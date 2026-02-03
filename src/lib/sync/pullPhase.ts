import { join } from "path";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { Logger } from "../logger";
import { Env } from "../env";
import { executeRclone, RETRY_FLAGS, getIsSyncPaused } from "./utils";
import {
    resetSessionCompletions,
    getSessionCompletionsSize,
    setTransferQueueType,
    clearActiveTransfers
} from "./progress";
import { runCleanupSweep, GARBAGE_PATTERNS } from "../cleanup";
import type { PortalConfig } from "../config";
import type { SyncProgress, ManifestStats } from "./types";

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
        ], () => { });
        return localManifest;
    } catch (err) {
        Logger.debug("SYNC", `Failed to fetch manifest from source: ${err instanceof Error ? err.message : String(err)}`);
        if (config.upsync_enabled && config.backup_provider !== "none") {
            const destRemote = `${Env.REMOTE_PORTAL_BACKUP}:/`;
            try {
                await executeRclone([
                    "copyto", `${destRemote}manifest.txt`, localManifest,
                    ...RETRY_FLAGS
                ], () => { });
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
    onProgress: (p: Partial<SyncProgress>) => void
): Promise<void> {
    const excludeFile = Env.getExcludeFilePath();
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
            riskyItems = missingFiltered.filter(f =>
                GARBAGE_PATTERNS.some(p => f.toLowerCase().includes(p.toLowerCase()))
            );
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

    setTransferQueueType("download");
    clearActiveTransfers();
    resetSessionCompletions();

    const basePullArgs = [
        config.strict_mirror ? "sync" : "copy", sourceRemote, config.local_dir,
        ...(config.source_provider === "copyparty" && config.cookie ? ["--header", config.cookie] : []),
        "--exclude-from", excludeFile,
        "--exclude", "_risk_tools/**",
        "--size-only", "--fast-list",
        "--transfers", String(config.downsync_transfers || 4),
        "--checkers", "16",
        ...RETRY_FLAGS
    ];

    // STAGE 1: Prioritized Pull (Known Threats)
    if (riskyItems.length > 0) {
        const riskyListFile = join(config.local_dir, "prioritized_risky.txt");
        writeFileSync(riskyListFile, riskyItems.join("\n"));

        const riskyArgs = [
            "copy", sourceRemote, config.local_dir,
            "--files-from", riskyListFile,
            ...basePullArgs.slice(3)
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

        await runCleanupSweep(config.local_dir, excludeFile, config.malware_policy || "purge", (cStats) => {
            onProgress({
                phase: "pull",
                description: `Shield: Neutralizing... ${cStats.flaggedArchives} threats purged.`,
                manifestStats,
                cleanupStats: cStats,
                percentage: Math.min(100, Math.round((getSessionCompletionsSize() / (riskyItems.length + standardItems.length)) * 100))
            });
        });
    }

    // STAGE 2: Standard Pull
    const standardFilesCount = standardItems.length;
    const standardArgs = [...basePullArgs];
    if (standardFilesCount > 0) {
        const standardListFile = join(config.local_dir, "standard_missing.txt");
        writeFileSync(standardListFile, standardItems.join("\n"));
        standardArgs.push("--files-from", standardListFile);
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
    });
}
