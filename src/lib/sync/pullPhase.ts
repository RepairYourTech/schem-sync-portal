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
import { runCleanupSweep, cleanFile } from "../cleanup";
import { ShieldManager } from "../shield/ShieldManager";
import type { PortalConfig } from "../config";
import type { SyncProgress, ManifestStats, CleanupStats } from "./types";
import type { StreamingFileQueue } from "./streamingQueue";

/**
 * Discovers the manifest file from source or backup.
 */
async function discoverManifest(config: PortalConfig, sourceRemote: string): Promise<string | null> {
    const localManifest = join(config.local_dir, "manifest.txt");
    const sourceFlags = (config.source_provider === "copyparty" && config.cookie) ? ["--header", config.cookie] : [];

    try {
        Logger.debug("SYNC", "Checking for remote manifest.txt...");
        await executeRclone([
            "copyto", `${sourceRemote}manifest.txt`, localManifest,
            ...sourceFlags,
            ...RETRY_FLAGS
        ], () => { }, undefined, "download");
        return localManifest;
    } catch (err) {
        Logger.debug("SYNC", `Failed to fetch manifest from source: ${err instanceof Error ? err.message : String(err)}`);
        if (config.upsync_enabled && config.backup_provider !== "none") {
            const destRemote = `${Env.REMOTE_PORTAL_BACKUP}:/`;
            try {
                await executeRclone([
                    "copyto", `${destRemote}manifest.txt`, localManifest,
                    ...RETRY_FLAGS
                ], () => { }, undefined, "download");
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
    onProgress: (p: Partial<SyncProgress>) => void,
    cleanedQueue?: StreamingFileQueue
): Promise<void> {
    const excludeFile = Env.getExcludeFilePath(config.local_dir);
    const sourceRemote = `${Env.REMOTE_PORTAL_SOURCE}:/`;

    onProgress({ phase: "pull", description: "Analyzing Source...", percentage: 0 });
    const localManifest = await discoverManifest(config, sourceRemote);
    let manifestStats: ManifestStats | undefined;
    let initialLocalCount = 0;
    let riskyItems: string[] = [];
    let standardItems: string[] = [];

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

            const missingFiltered = manifestData.missing.filter(f => !alreadyExcluded.has(f));

            // Combine priority filenames (static) with saved offenders (dynamic)
            const savedOffenders = ShieldManager.getOffenders(config.local_dir);
            const priorityFilenames = ShieldManager.getPriorityFilenames();

            // Extract filenames for path-agnostic matching
            // Remote structure is dynamic - we can only match on filenames
            const knownOffenderFilenames = new Set([
                ...savedOffenders.map(path => path.split('/').pop() || path),
                ...priorityFilenames  // Already just filenames
            ]);

            // Use ONLY exact filename matching - works with any remote directory structure
            riskyItems = missingFiltered.filter(f => {
                const filename = f.split('/').pop() || f;
                return knownOffenderFilenames.has(filename);
            });
            standardItems = missingFiltered.filter(f => !riskyItems.includes(f));

            manifestStats = {
                remoteFileCount: manifestData.remoteFiles.length,
                localFileCount: initialLocalCount,
                missingFileCount: missingFiltered.length,
                riskyFileCount: riskyItems.length,
                optimizationMode: "manifest",
                manifestSource: "source"
            };
        }
    }

    // REDUNDANT GLOBAL PULL REMOVED
    // We now proceed directly to Tiered Pull (Risky -> Standard) or Discovery Pull
    // to ensure the Shield is always in the critical path.

    const basePullArgs = [
        config.strict_mirror ? "sync" : "copy", sourceRemote, config.local_dir,
        ...(config.source_provider === "copyparty" && config.cookie ? ["--header", config.cookie] : []),
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
                description: `Shield: Neutralizing prioritized threats (${riskyItems.length})...`,
                manifestStats,
                filesTransferred: getSessionCompletionsSize(),
                isPaused: getIsSyncPaused(),
                ...stats,
                percentage: Math.min(100, Math.round((getSessionCompletionsSize() / (riskyItems.length + standardItems.length)) * 100))
            });
        });

        // Neutralize through both archive sweep AND direct file cleanup
        await runCleanupSweep(config.local_dir, excludeFile, config.malware_policy || "purge", (cStats) => {
            if ("phase" in cStats && cStats.phase) {
                onProgress(cStats as Partial<SyncProgress>);
                return;
            }
            const stats = cStats as CleanupStats;
            onProgress({
                phase: "clean",
                description: `Shield: Neutralizing archives... ${stats.flaggedArchives} threats purged.`,
                manifestStats,
                cleanupStats: stats,
                percentage: Math.min(100, Math.round((getSessionCompletionsSize() / (riskyItems.length + standardItems.length)) * 100))
            });
        });

        for (const item of riskyItems) {
            const fullPath = join(config.local_dir, item);
            if (existsSync(fullPath)) {
                await cleanFile(fullPath, config.local_dir, config.malware_policy || "purge");

                // If it survives cleaning and we have a queue, push it to allow upsync
                if (existsSync(fullPath) && cleanedQueue) {
                    cleanedQueue.push(item);
                }
            }
        }
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
    } else {
        // Manifest exists but no missing files identified - nothing to do for standard
        return;
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
            ...stats,
            percentage: displayPct
        });
    }, async (filename) => {
        // REAL-TIME CLEANING: Clean the file immediately after download
        if (config.enable_malware_shield) {
            const fullPath = join(config.local_dir, filename);
            if (existsSync(fullPath)) {
                await cleanFile(fullPath, config.local_dir, config.malware_policy || "purge");
            }
        }

        // Only push to cleanedQueue if the file still exists (passed the filter/shield)
        if (cleanedQueue && existsSync(join(config.local_dir, filename))) {
            cleanedQueue.push(filename);
        }
    });

    // FINAL SWEEP: Catch any archives identified after download during standard pull
    if (config.enable_malware_shield) {
        onProgress({ phase: "clean", description: "Shield: Final security sweep..." });
        await runCleanupSweep(config.local_dir, excludeFile, config.malware_policy || "purge", (cStats) => {
            if ("phase" in cStats && cStats.phase) {
                onProgress(cStats as Partial<SyncProgress>);
                return;
            }
            const stats = cStats as CleanupStats;
            onProgress({
                phase: "clean",
                description: `Shield: Final sweep... ${stats.scannedArchives}/${stats.totalArchives} archives checked.`,
                cleanupStats: stats
            });
        });
    }
}
