import { join } from "path";
import { existsSync } from "fs";
import { Env } from "../env";
import { executeRclone, RETRY_FLAGS, getIsSyncPaused } from "./utils";
import { clearActiveTransfers } from "./progress";
import type { PortalConfig } from "../config";
import type { SyncProgress } from "./types";
import { Logger } from "../logger";


/**
 * Runs the Manifest-Based Cloud Phase: Local -> Remote backup.
 * Authoritative: Only syncs files listed in upsync-manifest.txt.
 */
export async function runManifestCloudPhase(
    config: PortalConfig,
    onProgress: (p: Partial<SyncProgress>) => void
): Promise<void> {
    const manifestPath = join(config.local_dir, "upsync-manifest.txt");
    const destPath = config.backup_dir || (config.backup_provider === "gdrive" ? "SchematicsBackup" : "");
    const destRemote = `${Env.REMOTE_PORTAL_BACKUP}:${destPath}`;

    if (!existsSync(manifestPath)) {
        Logger.error("SYNC", "Cloud Phase Aborted: upsync-manifest.txt not found.");
        onProgress({
            phase: "error",
            description: "Error: Upsync manifest missing. Shield might have failed."
        });
        return;
    }

    const cloudArgs = [
        "sync", config.local_dir, destRemote,
        "--files-from", manifestPath,
        "--size-only", "--fast-list",
        "--transfers", String(config.upsync_transfers || 4),
        "--checkers", "16",
        ...RETRY_FLAGS
    ];

    if (config.backup_provider === "gdrive") cloudArgs.push("--drive-use-trash=false");

    clearActiveTransfers();

    Logger.info("SYNC", `Starting manifest-based cloud sync to ${destRemote}`);

    await executeRclone(cloudArgs, (p) => {
        onProgress({
            ...p,
            phase: "cloud",
            description: "Syncing Manifest to Cloud...",
            isPaused: getIsSyncPaused()
        });
    }, undefined, "upload", "cloud");
}


