import { join } from "path";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { Logger } from "../logger";
import { Env } from "../env";
import { executeRclone, RETRY_FLAGS, getIsSyncPaused } from "./utils";
import {
    resetSessionCompletions,
    getSessionCompletionsSize,
    clearActiveTransfers
} from "./progress";
import { ShieldManager } from "../shield/ShieldManager";
import { ShieldExecutor } from "../shield/ShieldExecutor";
import { LEAN_MODE_EXCLUDE_PATTERNS, LEAN_MODE_PRIORITY_FILENAMES } from "../shield/patterns";
import { shouldDownloadInLeanMode } from "../shield/archiveAnalyzer";
import type { PortalConfig } from "../config";
import type { SyncProgress, ManifestStats, CleanupStats } from "./types";

/**
 * Discovers the manifest file from source or backup.
 */
async function discoverManifest(config: PortalConfig, sourceRemote: string): Promise<string | null> {
    const localManifest = join(config.local_dir, "manifest.txt");

    try {
        Logger.debug("SYNC", "Checking for remote manifest.txt...");
        await executeRclone([
            "copyto", `${sourceRemote}manifest.txt`, localManifest,
            ...RETRY_FLAGS
        ], () => { }, undefined, "download", "pull");
        return localManifest;
    } catch (err) {
        Logger.debug("SYNC", `Failed to fetch manifest from source: ${err instanceof Error ? err.message : String(err)}`);
        if (config.upsync_enabled && config.backup_provider !== "none") {
            const destRemote = `${Env.REMOTE_PORTAL_BACKUP}:/`;
            try {
                await executeRclone([
                    "copyto", `${destRemote}manifest.txt`, localManifest,
                    ...RETRY_FLAGS
                ], () => { }, undefined, "download", "pull");
                return localManifest;
            } catch (err) {
                Logger.debug("SYNC", `Failed to fetch manifest from backup: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }
    return null;
}

/**
 * Processes the local manifest and scans local directory for differences.
 */
function processManifest(localManifest: string, localDir: string): { remoteFiles: string[], initialLocalCount: number, missing: string[] } | null {
    try {
        const manifestContent = readFileSync(localManifest, "utf8");
        const remoteFiles = manifestContent.split("\n")
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith("#"));

        const localFiles = new Set<string>();
        const scan = (dir: string, base: string) => {
            if (!existsSync(dir)) return;
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const relPath = join(base, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name === "_risk_tools" || entry.name === "_shield_isolated") continue;
                    scan(join(dir, entry.name), relPath);
                } else {
                    localFiles.add(relPath);
                }
            }
        };
        if (existsSync(localDir)) scan(localDir, "");

        return {
            remoteFiles,
            initialLocalCount: localFiles.size,
            missing: remoteFiles.filter(f => !localFiles.has(f))
        };
    } catch (err) {
        Logger.error("SYNC", "Failed to parse manifest.txt", err as Error);
        return null;
    }
}

/**
 * Runs the Pull Phase: Manifest discovery -> Stage 1 (Risky) -> Stage 2 (Standard).
 */
export async function runPullPhase(
    config: PortalConfig,
    onProgress: (p: Partial<SyncProgress>) => void
): Promise<void> {
    const approvedFiles = new Set<string>();
    const releasePending = () => {
        // Manifest-only mode: scan local dir to ensure we capture all existing files
        const verifiedFiles: string[] = [];
        const scan = (dir: string, base: string) => {
            if (!existsSync(dir)) return;
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const relPath = join(base, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name === "_risk_tools" || entry.name === "_shield_isolated") continue;
                    scan(join(dir, entry.name), relPath);
                } else if (entry.isFile()) {
                    verifiedFiles.push(relPath);
                }
            }
        };
        scan(config.local_dir, "");
        verifiedFiles.forEach(f => {
            const filename = f.split(/[/\\]/).pop();
            if (filename && !filename.startsWith(".") && !filename.includes("manifest.txt")) {
                approvedFiles.add(f);
            }
        });
    };
    const excludeFile = Env.getExcludeFilePath(config.local_dir);
    const sourceRemote = `${Env.REMOTE_PORTAL_SOURCE}:/`;

    onProgress({ phase: "pull", description: "Analyzing Source...", percentage: 0 });
    const localManifest = await discoverManifest(config, sourceRemote);
    let manifestStats: ManifestStats | undefined;
    let initialLocalCount = 0;
    let riskyItems: string[] = [];
    let standardItems: string[] = [];

    // Track shield stats cumulatively
    const cleanupStats: CleanupStats = {
        phase: "clean", totalArchives: 0, scannedArchives: 0, safePatternCount: 0, riskyPatternCount: 0,
        cleanArchives: 0, flaggedArchives: 0, extractedFiles: 0, purgedFiles: 0, isolatedFiles: 0,
        policyMode: config.malware_policy || "purge"
    };

    const leanMode = config.download_mode === "lean";
    let excludedFileCount = 0;
    let valuableFileCount = 0;

    if (localManifest) {
        const manifestData = processManifest(localManifest, config.local_dir);
        if (manifestData) {
            initialLocalCount = manifestData.initialLocalCount;

            const alreadyExcluded = new Set<string>();
            if (existsSync(excludeFile)) {
                try {
                    const lines = readFileSync(excludeFile, "utf-8").split("\n");
                    lines.forEach(l => { if (l.trim()) alreadyExcluded.add(l.trim()); });
                } catch (e) {
                    Logger.error("SYNC", "Failed to read exclude file", e);
                }
            }

            // Initial generic filtering
            const missingFiltered = manifestData.missing.filter(f => !alreadyExcluded.has(f));

            // LEAN MODE FILTERING
            let candidates = missingFiltered;
            if (leanMode) {
                candidates = missingFiltered.filter(f => {
                    const filename = f.split('/').pop() || f;
                    const keep = shouldDownloadInLeanMode(filename);
                    if (!keep) excludedFileCount++;
                    return keep;
                });
            }

            // Identify Priority/Risky Items
            // In LEAN mode: Priority = Valuable archives (forced download first)
            // In FULL mode: Priority = Risky/Malware offenders (scan first)

            const savedOffenders = ShieldManager.getOffenders(config.local_dir);
            const priorityFilenames = leanMode ? LEAN_MODE_PRIORITY_FILENAMES : ShieldManager.getPriorityFilenames();

            const knownPriorityFilenames = new Set([
                ...(leanMode ? [] : savedOffenders.map(path => path.split('/').pop() || path)), // Only include offenders in full mode? Or both? stick to plan: lean prioritizes value.
                ...priorityFilenames
            ]);

            riskyItems = candidates.filter(f => { // "riskyItems" variable reused as "stage1Items"
                const filename = f.split('/').pop() || f;
                const isPriority = knownPriorityFilenames.has(filename);
                if (leanMode && isPriority) valuableFileCount++;
                return isPriority;
            });

            standardItems = candidates.filter(f => !riskyItems.includes(f));

            manifestStats = {
                remoteFileCount: manifestData.remoteFiles.length,
                localFileCount: initialLocalCount,
                missingFileCount: missingFiltered.length, // Total missing before lean exclusion
                riskyFileCount: riskyItems.length,
                optimizationMode: "manifest",
                manifestSource: "source",
                leanModeActive: leanMode,
                excludedFileCount,
                valuableFileCount
            };
        }
    }

    const basePullArgs = [
        config.strict_mirror ? "sync" : "copy", sourceRemote, config.local_dir,
        "--size-only", "--fast-list",
        "--transfers", String(config.downsync_transfers || 4),
        "--checkers", "16",
        ...RETRY_FLAGS
    ];

    clearActiveTransfers();
    resetSessionCompletions();

    // STAGE 1: Prioritized Pull (Known Threats) - ONLY when shield enabled
    if (config.enable_malware_shield && riskyItems.length > 0) {
        const riskyListFile = join(config.local_dir, "prioritized_risky.txt");
        writeFileSync(riskyListFile, riskyItems.join("\n"));

        const riskyArgs = [
            "copy", sourceRemote, config.local_dir,
            "--files-from", riskyListFile,
            ...basePullArgs.slice(3) // Skip sync/copy, source, dest
        ];

        await executeRclone(riskyArgs, (stats) => {
            onProgress({
                phase: "pull",
                description: `Shield: Neutralizing prioritized threats (Archives + Nested + Standalone)...`,
                manifestStats,
                filesTransferred: getSessionCompletionsSize(),
                isPaused: getIsSyncPaused(),
                ...stats,
                cleanupStats,
                percentage: Math.min(100, Math.round((getSessionCompletionsSize() / (riskyItems.length + standardItems.length)) * 100))
            });
        }, undefined, "download", "pull");

        // Neutralize through both archive sweep AND direct file cleanup
        await ShieldExecutor.execute({
            type: config.download_mode === "lean" ? "valuable_sweep" : "risky_sweep",
            localDir: config.local_dir,
            policy: config.malware_policy || "purge",
            excludeFile,
            onProgress,
            initialStats: cleanupStats,
            mode: config.download_mode || "full"
        });

        for (const item of riskyItems) {
            const fullPath = join(config.local_dir, item);
            if (existsSync(fullPath)) {
                await ShieldExecutor.execute({
                    type: "realtime_clean",
                    localDir: config.local_dir,
                    policy: config.malware_policy || "purge",
                    filePath: fullPath,
                    onProgress,
                    initialStats: cleanupStats,
                    mode: config.download_mode || "full"
                });

                if (existsSync(fullPath)) {
                    approvedFiles.add(item);
                }
            }
        }

        // Add any files extracted from archives during risky sweep
        if (cleanupStats.extractedFilePaths && cleanupStats.extractedFilePaths.length > 0) {
            cleanupStats.extractedFilePaths.forEach(f => approvedFiles.add(f));
        }

        // IMMEDIATE CREATION: Create manifest immediately after initial risky sweep
        Logger.info("SYNC", `Creating initial upsync manifest after risky sweep (${approvedFiles.size} files approved)`);
        const manifestInfo = ShieldManager.saveUpsyncManifest(config.local_dir, Array.from(approvedFiles), config.malware_policy || "purge");
        onProgress({ manifestInfo });
    }

    // STAGE 2: Standard Pull
    const standardFilesCount = standardItems.length;
    const standardArgs = [...basePullArgs];
    if (standardFilesCount > 0) {
        const standardListFile = join(config.local_dir, "standard_missing.txt");
        writeFileSync(standardListFile, standardItems.join("\n"));
        standardArgs.push("--files-from", standardListFile);
    } else if (!localManifest) {
        // DISCOVERY MODE: No manifest - use filters and exclusion list
        standardArgs.push("--exclude-from", excludeFile, "--exclude", "_risk_tools/**");
        if (config.download_mode === "lean") {
            LEAN_MODE_EXCLUDE_PATTERNS.forEach(p => standardArgs.push("--exclude", `*${p}*`));
        }
    } else {
        // Manifest exists but no missing files identified - nothing to do for standard
        releasePending();
    }

    await executeRclone(standardArgs, (stats) => {
        const completedCount = getSessionCompletionsSize();
        const totalMissing = riskyItems.length + standardItems.length;
        if (manifestStats) {
            manifestStats.localFileCount = initialLocalCount + completedCount;
            manifestStats.missingFileCount = Math.max(0, totalMissing - completedCount);
        }
        const displayPct = (totalMissing > 0) ? Math.min(100, Math.round((completedCount / totalMissing) * 100)) : (stats.percentage ?? 0);
        onProgress({
            phase: "pull",
            description: "Downloading files...",
            manifestStats,
            filesTransferred: completedCount,
            isPaused: getIsSyncPaused(),
            cleanupStats,
            ...stats,
            percentage: displayPct
        });
    }, async (filename) => {
        // REAL-TIME CLEANING: Clean the file immediately after download
        if (config.enable_malware_shield) {
            const fullPath = join(config.local_dir, filename);
            if (existsSync(fullPath)) {
                await ShieldExecutor.execute({
                    type: "realtime_clean",
                    localDir: config.local_dir,
                    policy: config.malware_policy || "purge",
                    filePath: fullPath,
                    onProgress,
                    initialStats: cleanupStats,
                    mode: config.download_mode || "full"
                });
            }
        }

        // Mark as approved if it survives cleaning
        if (existsSync(join(config.local_dir, filename))) {
            approvedFiles.add(filename);

            // INCREMENTAL UPDATE: Update manifest in batches (e.g., every 8 files)
            // or for every file if we're dealing with a small number of total files
            const shouldUpdate = approvedFiles.size % 8 === 0 || (standardItems.length < 20);

            if (shouldUpdate) {
                const manifestInfo = ShieldManager.updateUpsyncManifest(config.local_dir, [filename]);
                onProgress({ manifestInfo });
            }
        }
    }, "download", "pull");

    // FINAL SWEEP: Catch any archives identified after download during standard pull
    if (config.enable_malware_shield) {
        await ShieldExecutor.execute({
            type: "final_sweep",
            localDir: config.local_dir,
            policy: config.malware_policy || "purge",
            excludeFile,
            onProgress,
            initialStats: cleanupStats,
            mode: config.download_mode || "full"
        });

        // After final sweep, ensure we capture extracted files
        if (cleanupStats.extractedFilePaths && cleanupStats.extractedFilePaths.length > 0) {
            cleanupStats.extractedFilePaths.forEach(f => approvedFiles.add(f));
        }
    }

    // GUARANTEED CLEARANCE: Ensure all pending files are released before finishing pull phase
    releasePending();

    // Finalize manifest
    const manifestInfo = ShieldManager.saveUpsyncManifest(config.local_dir, Array.from(approvedFiles), config.malware_policy || "purge");
    if (manifestInfo && onProgress) {
        onProgress({ manifestInfo });
    }
}
