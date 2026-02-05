import { Logger } from "../logger";
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
}
