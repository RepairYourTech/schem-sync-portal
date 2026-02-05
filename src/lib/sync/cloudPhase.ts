import { join } from "path";
import { existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import { Env } from "../env";
import { executeRclone, RETRY_FLAGS, getIsSyncPaused } from "./utils";
import { clearActiveTransfers } from "./progress";
import type { PortalConfig } from "../config";
import type { SyncProgress } from "./types";
import { Logger } from "../logger";


/**
 * Runs the Manifest-Based Cloud Phase: Local -> Remote backup.
 * Authoritative: Only syncs files listed in upsync-manifest.txt.
 * Polling: Watches the manifest and uploads new files incrementally.
 */
export async function runManifestCloudPhase(
    config: PortalConfig,
    onProgress: (p: Partial<SyncProgress>) => void,
    isPullDone?: () => boolean
): Promise<void> {
    const manifestPath = join(config.local_dir, "upsync-manifest.txt");
    const destPath = config.backup_dir || (config.backup_provider === "gdrive" ? "SchematicsBackup" : "");
    const destRemote = `${Env.REMOTE_PORTAL_BACKUP}:${destPath}`;
    const batchListPath = join(config.local_dir, ".upsync-batch.txt");

    Logger.info("SYNC", "Cloud Phase: Waiting for initial manifest...");

    // 1. Wait for initial manifest
    while (!existsSync(manifestPath)) {
        if (isPullDone && isPullDone()) {
            Logger.info("SYNC", "Pull phase completed before manifest appeared. Nothing to upsync.");
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        onProgress({ phase: "cloud", description: "Waiting for shield..." });
    }

    const uploadedFiles = new Set<string>();

    // 2. Polling Loop
    while (true) {
        let needsUpload = false;
        try {
            const manifest = readFileSync(manifestPath, "utf8");
            const files = manifest.split("\n")
                .map(line => line.trim())
                .filter(line => line.length > 0 && !line.startsWith("#") && !line.startsWith("{"));

            const newFiles = files.filter(f => !uploadedFiles.has(f));

            if (newFiles.length > 0) {
                Logger.info("SYNC", `Cloud Phase: Found ${newFiles.length} new files in manifest. Starting batch upload.`);
                writeFileSync(batchListPath, newFiles.join("\n"), "utf8");

                const cloudArgs = [
                    "copy", config.local_dir, destRemote,
                    "--files-from", batchListPath,
                    "--size-only", "--fast-list",
                    "--transfers", String(config.upsync_transfers || 4),
                    "--checkers", "16",
                    ...RETRY_FLAGS
                ];

                if (config.backup_provider === "gdrive") cloudArgs.push("--drive-use-trash=false");

                clearActiveTransfers();
                await executeRclone(cloudArgs, (p) => {
                    onProgress({
                        ...p,
                        phase: "cloud",
                        description: `Uploading batch (${newFiles.length} files)...`,
                        isPaused: getIsSyncPaused()
                    });
                }, undefined, "upload", "cloud");

                newFiles.forEach(f => uploadedFiles.add(f));
                needsUpload = true;
            }
        } catch (err) {
            Logger.error("SYNC", `Error in cloud phase polling: ${err instanceof Error ? err.message : String(err)}`);
        }

        const pullIsDone = isPullDone ? isPullDone() : true;
        if (pullIsDone && !needsUpload) {
            Logger.info("SYNC", "Cloud Phase: Pull complete and all manifest entries processed. Finishing.");
            break;
        }

        // Wait before next check
        onProgress({ phase: "cloud", description: "Monitoring manifest for updates..." });
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Cleanup batch file
    try {
        if (existsSync(batchListPath)) rmSync(batchListPath, { force: true });
    } catch { /* ignore */ }
}


