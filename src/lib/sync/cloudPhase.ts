import { join } from "path";
import { existsSync } from "fs";
import { Env } from "../env";
import { executeRclone, RETRY_FLAGS, getIsSyncPaused } from "./utils";
import { setTransferQueueType, clearActiveTransfers } from "./progress";
import type { PortalConfig } from "../config";
import type { SyncProgress } from "./types";

/**
 * Runs the Cloud Phase: Local -> Remote backup.
 */
export async function runCloudPhase(
    config: PortalConfig,
    onProgress: (p: Partial<SyncProgress>) => void
): Promise<void> {
    const excludeFile = Env.getExcludeFilePath();
    const destPath = config.backup_dir || (config.backup_provider === "gdrive" ? "SchematicsBackup" : "");
    const destRemote = `${Env.REMOTE_PORTAL_BACKUP}:${destPath}`;
    const localManifest = join(config.local_dir, "manifest.txt");

    const cloudArgs = [
        "sync", config.local_dir, destRemote,
        "--size-only", "--fast-list",
        "--transfers", String(config.upsync_transfers || 4),
        "--checkers", "16",
        ...RETRY_FLAGS
    ];

    if (existsSync(localManifest)) {
        cloudArgs.push("--files-from", localManifest);
    } else {
        cloudArgs.push("--exclude-from", excludeFile, "--exclude", "_risk_tools/**");
    }

    if (config.backup_provider === "gdrive") cloudArgs.push("--drive-use-trash=false");

    setTransferQueueType("upload");
    clearActiveTransfers();

    await executeRclone(cloudArgs, (stats) => onProgress({
        phase: "cloud",
        description: "Cloud Backup...",
        isPaused: getIsSyncPaused(),
        ...stats,
        percentage: stats.percentage ?? 0
    }));
}
