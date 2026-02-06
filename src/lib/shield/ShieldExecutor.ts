import { join } from "path";
import { readdirSync, existsSync } from "fs";
import { Logger } from "../logger";
import { ShieldManager } from "./ShieldManager";
import { Env } from "../env";
import { runCleanupSweep, cleanFile } from "../cleanup";
import type { CleanupResult } from "../cleanup";
import type { CleanupStats, SyncProgress } from "../sync/types";

export interface ShieldExecutionContext {
    type: "risky_sweep" | "realtime_clean" | "final_sweep";
    localDir: string;
    policy: "purge" | "isolate";
    onProgress?: (stats: Partial<SyncProgress>) => void;
    initialStats?: CleanupStats;
    // For realtime_clean
    filePath?: string;
    excludeFile?: string;
}

export interface ScanLocalContext {
    localDir: string;
    policy: "purge" | "isolate";
    onProgress?: (stats: Partial<SyncProgress>) => void;
}

export class ShieldExecutor {
    /**
     * Execute shield operation with consistent stats and logging.
     */
    static async execute(context: ShieldExecutionContext): Promise<CleanupResult | boolean> {
        const { type, localDir, policy, onProgress, initialStats } = context;

        // Ensure stats have the correct context
        const stats: CleanupStats = initialStats || {
            phase: "clean",
            totalArchives: 0,
            scannedArchives: 0,
            safePatternCount: 0,
            riskyPatternCount: 0,
            cleanArchives: 0,
            flaggedArchives: 0,
            extractedFiles: 0,
            purgedFiles: 0,
            isolatedFiles: 0,
            policyMode: policy,
            executionContext: type
        };
        stats.executionContext = type;

        const wrapProgress = (s: CleanupStats | Partial<SyncProgress>) => {
            if (onProgress) {
                if ("phase" in s && s.phase === "clean") {
                    onProgress(s);
                } else {
                    onProgress({
                        phase: "clean",
                        cleanupStats: s as CleanupStats,
                        description: `Shield: ${type.replace("_", " ")} in progress...`
                    });
                }
            }
        };

        Logger.info("SHIELD", `Starting ${type} (policy=${policy})`);

        try {
            if (type === "realtime_clean") {
                if (!context.filePath) throw new Error("filePath is required for realtime_clean");
                const result = await cleanFile(context.filePath, localDir, policy, stats, (s) => wrapProgress(s));
                Logger.info("SHIELD", `Completed ${type} for ${context.filePath} | result=${result}`);
                return result;
            } else {
                const excludeFile = context.excludeFile || "";
                const result = await runCleanupSweep(localDir, excludeFile, policy, (s) => wrapProgress(s), undefined, stats);
                Logger.info("SHIELD", `Completed ${type} | scanned=${stats.scannedArchives} threats=${stats.riskyPatternCount} extracted=${stats.extractedFiles}`);
                return result;
            }
        } catch (err) {
            Logger.error("SHIELD", `Error during ${type}`, err);
            throw err;
        }
    }

    /**
     * Scans the local directory retroactively and generates a manifest.
     * Used for Standalone Shield mode.
     */
    static async scanLocal(context: ScanLocalContext): Promise<void> {
        const { localDir, policy, onProgress } = context;
        const excludeFile = Env.getExcludeFilePath(localDir);

        Logger.info("SHIELD", `Starting standalone local scan in ${localDir}`);

        // 1. Full Cleanup Sweep
        const sweepStats: CleanupStats = {
            phase: "clean",
            totalArchives: 0,
            scannedArchives: 0,
            safePatternCount: 0,
            riskyPatternCount: 0,
            cleanArchives: 0,
            flaggedArchives: 0,
            extractedFiles: 0,
            purgedFiles: 0,
            isolatedFiles: 0,
            policyMode: policy,
            executionContext: "final_sweep" // Treat as final sweep for consistency
        };

        const wrapProgress = (s: CleanupStats | Partial<SyncProgress>) => {
            if (onProgress) {
                if ("phase" in s && s.phase === "clean") {
                    onProgress(s);
                } else {
                    onProgress({
                        phase: "clean",
                        cleanupStats: s as CleanupStats,
                        description: "Shield: Local scan in progress..."
                    });
                }
            }
        };

        await runCleanupSweep(localDir, excludeFile, policy, wrapProgress, undefined, sweepStats);

        // 2. Discover all verified files
        const approvedFiles = new Set<string>();
        const scan = (dir: string, base: string) => {
            if (!existsSync(dir)) return;
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const relPath = join(base, entry.name);
                // Skip isolated/quarantine directories
                if (entry.isDirectory()) {
                    if (entry.name === "_risk_tools" || entry.name === "_shield_isolated") {
                        Logger.info("SHIELD", `Skipping isolated directory: ${entry.name}`);
                        continue;
                    }
                    scan(join(dir, entry.name), relPath);
                } else if (entry.isFile()) {
                    const filename = entry.name;
                    if (!filename.startsWith(".") && !filename.includes("manifest.txt")) {
                        approvedFiles.add(relPath);
                    }
                }
            }
        };
        scan(localDir, "");

        // Add extracted files from sweep
        if (sweepStats.extractedFilePaths) {
            sweepStats.extractedFilePaths.forEach(f => approvedFiles.add(f));
        }

        // 3. Save Manifest
        const filteredApprovedFiles = Array.from(approvedFiles).filter(f => {
            const low = f.toLowerCase();
            return !low.startsWith("_risk_tools") && !low.startsWith("_shield_isolated");
        });
        const manifestInfo = ShieldManager.saveUpsyncManifest(localDir, filteredApprovedFiles, policy);

        Logger.info("SHIELD", `Standalone scan complete. Manifest generated with ${approvedFiles.size} files.`);
        if (onProgress) {
            onProgress({
                phase: "done",
                description: `Scan complete: ${approvedFiles.size} files verified.`,
                percentage: 100,
                manifestInfo: manifestInfo || undefined
            });
        }
    }
}
