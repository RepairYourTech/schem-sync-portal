import { runCleanupSweep } from "../cleanup";
import { Env } from "../env";
import type { PortalConfig } from "../config";
import type { SyncProgress } from "./types";

/**
 * Runs the Clean Phase: Malware Shield sweep.
 */
export async function runCleanPhase(
    config: PortalConfig,
    onProgress: (p: Partial<SyncProgress>) => void
): Promise<void> {
    const excludeFile = Env.getExcludeFilePath();
    onProgress({ phase: "clean", description: "Surgical Malware Shield...", percentage: 0 });

    await runCleanupSweep(config.local_dir, excludeFile, config.malware_policy || "purge", (stats) => {
        onProgress({
            phase: "clean",
            description: stats.currentArchive ? `Scanning ${stats.currentArchive}...` : "Scanning archives...",
            percentage: stats.totalArchives > 0 ? Math.round((stats.scannedArchives / stats.totalArchives) * 100) : 0,
            cleanupStats: stats
        });
    });
}
