import { join } from "path";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { Logger } from "../logger";
import { Env } from "../env";
import { executeRclone, RETRY_FLAGS, getIsSyncPaused, isStopRequested } from "./utils";
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

/** Floor for the strict-mirror deletion cap, so small libraries can still prune normally. */
const MIN_MIRROR_DELETE_CAP = 50;
/** A single mirror run may remove at most this fraction of the known local file count. */
const MIRROR_DELETE_FRACTION = 0.1;

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
        ], () => { }, () => isStopRequested(), "download", "pull");
        return localManifest;
    } catch (err) {
        Logger.debug("SYNC", `Failed to fetch manifest from source: ${err instanceof Error ? err.message : String(err)}`);
        if (config.upsync_enabled && config.backup_provider !== "none") {
            const destRemote = `${Env.REMOTE_PORTAL_BACKUP}:/`;
            try {
                await executeRclone([
                    "copyto", `${destRemote}manifest.txt`, localManifest,
                    ...RETRY_FLAGS
                ], () => { }, () => isStopRequested(), "download", "pull");
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
            if (isStopRequested()) return;
            if (!existsSync(dir)) return;
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (isStopRequested()) break;
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
 * @param mode - The download mode, passed explicitly from runSync to avoid state file timing issues.
 */
export async function runPullPhase(
    config: PortalConfig,
    onProgress: (p: Partial<SyncProgress>) => void,
    mode: "full" | "lean" = "full"
): Promise<void> {
    const approvedFiles = new Set<string>();
    const releasePending = () => {
        // Manifest-only mode: scan local dir to ensure we capture all existing files
        const verifiedFiles: string[] = [];
        const scan = (dir: string, base: string) => {
            if (isStopRequested()) return;
            if (!existsSync(dir)) return;
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (isStopRequested()) break;
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

    onProgress({ phase: "pull", description: "Checking for remote manifest...", percentage: 0 });
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

    const effectiveMode = mode;
    const leanMode = effectiveMode === "lean";

    Logger.info("SYNC", `Pull phase mode: ${effectiveMode}`);

    let excludedFileCount = 0;
    let valuableFileCount = 0;

    if (localManifest) {
        onProgress({ phase: "pull", description: "Manifest found. Scanning local files...", percentage: 0 });
        const manifestData = processManifest(localManifest, config.local_dir);
        if (isStopRequested()) return;

        if (manifestData) {
            initialLocalCount = manifestData.initialLocalCount;
            onProgress({ phase: "pull", description: `Comparing manifests... ${manifestData.remoteFiles.length.toLocaleString()} remote vs ${initialLocalCount.toLocaleString()} local`, percentage: 0 });

            const alreadyExcluded = new Set<string>();
            if (existsSync(excludeFile)) {
                try {
                    onProgress({ phase: "pull", description: "Loading exclusion ledger...", percentage: 0 });
                    const lines = readFileSync(excludeFile, "utf-8").split("\n");
                    lines.forEach(l => { if (l.trim()) alreadyExcluded.add(l.trim()); });
                } catch (e) {
                    Logger.error("SYNC", "Failed to read exclude file", e);
                }
            }

            // Initial generic filtering
            const missingFiltered = manifestData.missing.filter(f => !alreadyExcluded.has(f));
            if (alreadyExcluded.size > 0) {
                const filteredOut = manifestData.missing.length - missingFiltered.length;
                onProgress({ phase: "pull", description: `Exclusion filter applied: ${filteredOut.toLocaleString()} already processed, ${missingFiltered.length.toLocaleString()} candidates remain`, percentage: 0 });
            }

            // LEAN MODE FILTERING
            let candidates = missingFiltered;
            if (leanMode) {
                onProgress({ phase: "pull", description: "Applying lean mode filter...", percentage: 0 });
                candidates = missingFiltered.filter(f => {
                    const keep = shouldDownloadInLeanMode(f);
                    if (!keep) excludedFileCount++;
                    return keep;
                });
                onProgress({ phase: "pull", description: `Lean mode: ${excludedFileCount.toLocaleString()} bloat files filtered, ${candidates.length.toLocaleString()} valuable files remain`, percentage: 0 });
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

            const riskySet = new Set(riskyItems);
            standardItems = candidates.filter(f => !riskySet.has(f));

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

    if (isStopRequested()) return;

    // `sync` mirrors deletions from the source. Cap how many files a single run may
    // remove, so an incomplete or wrong source listing cannot wipe the local library.
    const mirrorGuards: string[] = [];
    if (config.strict_mirror) {
        const deleteCap = initialLocalCount > 0
            ? Math.max(MIN_MIRROR_DELETE_CAP, Math.floor(initialLocalCount * MIRROR_DELETE_FRACTION))
            : MIN_MIRROR_DELETE_CAP;
        mirrorGuards.push("--max-delete", String(deleteCap));
        Logger.info("SYNC", `Strict mirror enabled; deletions capped at ${deleteCap} file(s) this run.`);
    }

    const basePullArgs = [
        config.strict_mirror ? "sync" : "copy", sourceRemote, config.local_dir,
        "--size-only", "--fast-list",
        "--transfers", String(config.downsync_transfers || 4),
        "--checkers", "16",
        ...mirrorGuards,
        ...RETRY_FLAGS
    ];

    clearActiveTransfers();
    resetSessionCompletions();

    // STAGE 1: Prioritized Pull (Known Threats) - ONLY when shield enabled
    if (config.enable_malware_shield && riskyItems.length > 0) {
        if (isStopRequested()) return;
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
        }, () => isStopRequested(), "download", "pull");

        if (isStopRequested()) return;
        // Neutralize through both archive sweep AND direct file cleanup
        await ShieldExecutor.execute({
            type: effectiveMode === "lean" ? "valuable_sweep" : "risky_sweep",
            localDir: config.local_dir,
            policy: config.malware_policy || "purge",
            excludeFile,
            onProgress,
            initialStats: cleanupStats,
            mode: effectiveMode
        });

        if (isStopRequested()) return;
        for (const item of riskyItems) {
            if (isStopRequested()) break;
            const fullPath = join(config.local_dir, item);
            if (existsSync(fullPath)) {
                await ShieldExecutor.execute({
                    type: "realtime_clean",
                    localDir: config.local_dir,
                    policy: config.malware_policy || "purge",
                    filePath: fullPath,
                    onProgress,
                    initialStats: cleanupStats,
                    mode: effectiveMode
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

        if (isStopRequested()) return;
        // IMMEDIATE CREATION: Create manifest immediately after initial risky sweep
        Logger.info("SYNC", `Creating initial upsync manifest after risky sweep (${approvedFiles.size} files approved)`);
        const manifestInfo = ShieldManager.saveUpsyncManifest(config.local_dir, Array.from(approvedFiles), config.malware_policy || "purge");
        onProgress({ manifestInfo });
    }

    if (isStopRequested()) return;
    // STAGE 2: Standard Pull
    const standardFilesCount = standardItems.length;
    const hasManifestWithNoMissing = localManifest && standardFilesCount === 0 && riskyItems.length === 0;

    let downloadError: unknown = null;

    if (hasManifestWithNoMissing) {
        // Manifest exists, everything is already local — skip rclone entirely
        Logger.info("SYNC", "Manifest shows all files present locally. Skipping Stage 2 download.");
        onProgress({ phase: "pull", description: "No updates found. Building file inventory...", percentage: 100 });
        releasePending();

        // Generate upsync manifest with ALL local files (not just empty session set)
        const allLocalFiles = ShieldManager.scanForApprovedFiles(config.local_dir, "", isStopRequested);
        const manifestInfo = ShieldManager.saveUpsyncManifest(config.local_dir, allLocalFiles, config.malware_policy || "purge");
        onProgress({
            phase: "pull",
            description: `No updates needed. ${allLocalFiles.length.toLocaleString()} files verified.`,
            manifestStats,
            manifestInfo: manifestInfo || undefined,
            filesTransferred: 0,
            percentage: 100
        });
    } else {
        if (standardFilesCount > 0) {
            onProgress({ phase: "pull", description: `${standardFilesCount.toLocaleString()} files to download...`, percentage: 0 });
        } else if (!localManifest) {
            onProgress({ phase: "pull", description: "No manifest found. Running full discovery sync...", percentage: 0 });
        }
        const standardArgs = [...basePullArgs];
        if (standardFilesCount > 0) {
            const standardListFile = join(config.local_dir, "standard_missing.txt");
            writeFileSync(standardListFile, standardItems.join("\n"));
            standardArgs.push("--files-from", standardListFile);
        } else if (!localManifest) {
            // DISCOVERY MODE: No manifest - use filters and exclusion list
            // Include exclude-from to protect shield-cleaned files from size-only re-download
            standardArgs.push("--exclude-from", excludeFile, "--exclude", "_risk_tools/**", "--exclude", "_shield_isolated/**");
            if (effectiveMode === "lean") {
                LEAN_MODE_EXCLUDE_PATTERNS.forEach(p => standardArgs.push("--exclude", `*${p}*`));
            }
        }

        try {
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
                if (isStopRequested()) return;
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
                            mode: effectiveMode
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
        } catch (err) {
            downloadError = err;
            Logger.error("SYNC", `Download phase error (non-fatal for manifest): ${err instanceof Error ? err.message : String(err)}`);
            // Don't throw here — continue to finalization so the manifest gets generated
        }
    }

    // === GUARANTEED FINALIZATION (runs regardless of download/shield errors) ===

    // FINAL SWEEP: Catch any archives identified after download during standard pull
    if (config.enable_malware_shield && !isStopRequested()) {
        try {
            onProgress({ phase: "clean", description: "Running final shield sweep...", percentage: 0 });
            await ShieldExecutor.execute({
                type: "final_sweep",
                localDir: config.local_dir,
                policy: config.malware_policy || "purge",
                excludeFile,
                onProgress,
                initialStats: cleanupStats,
                mode: effectiveMode
            });

            // After final sweep, ensure we capture extracted files
            if (cleanupStats.extractedFilePaths && cleanupStats.extractedFilePaths.length > 0) {
                cleanupStats.extractedFilePaths.forEach(f => approvedFiles.add(f));
            }
        } catch (err) {
            Logger.error("SYNC", `Final shield sweep error (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    // GUARANTEED CLEARANCE: Ensure all pending files are released before finishing pull phase
    releasePending();

    // Finalize manifest — include ALL local files, not just current session's downloads
    onProgress({ phase: "pull", description: "Building complete file inventory...", percentage: 100 });
    const allLocalFiles = ShieldManager.scanForApprovedFiles(config.local_dir, "", isStopRequested);
    // Merge session-approved files (survives shield cleaning) with full local scan
    for (const f of approvedFiles) {
        if (!allLocalFiles.includes(f)) allLocalFiles.push(f);
    }
    onProgress({ phase: "pull", description: `Finalizing... ${allLocalFiles.length.toLocaleString()} files inventoried.`, percentage: 100 });
    const manifestInfo = ShieldManager.saveUpsyncManifest(config.local_dir, allLocalFiles, config.malware_policy || "purge");
    if (manifestInfo && onProgress) {
        onProgress({ manifestInfo });
    }

    // Re-throw download error after manifest is guaranteed
    if (downloadError) throw downloadError;
}
