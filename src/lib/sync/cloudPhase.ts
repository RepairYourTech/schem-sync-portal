import { join } from "path";
import { existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import { Env } from "../env";
import { executeRclone, RETRY_FLAGS, getIsSyncPaused, getCurrentSessionId, setSessionId } from "./utils";
import { clearActiveTransfers } from "./progress";
import type { PortalConfig } from "../config";
import type { SyncProgress } from "./types";
import { Logger } from "../logger";
import { loadSyncState, saveSyncState, createEmptyState } from "../syncState";
import type { SyncSessionState } from "../syncState";


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

    const state: SyncSessionState = loadSyncState(config.local_dir) || createEmptyState();
    let currentSessionId = getCurrentSessionId();

    // Comment 1: Adopt session ID if just started and upsync was not complete
    if (!currentSessionId && state.sessionId && state.upsyncStatus !== "complete") {
        setSessionId(state.sessionId);
        currentSessionId = state.sessionId;
        Logger.info("SYNC", `Cloud Phase: Adopting incomplete session ${state.sessionId} from state.`);
    }

    // Comment 1: Only clear uploadedFiles if intentionally new (session ID mismatch) or previous was complete
    if ((currentSessionId && state.sessionId !== currentSessionId) || state.upsyncStatus === "complete") {
        if (state.uploadedFiles && state.uploadedFiles.length > 0) {
            Logger.info("SYNC", `Cloud Phase: New session or previous complete. Resetting upload tracking for ${state.uploadedFiles.length} files.`);
        }
        state.uploadedFiles = [];
        state.sessionId = currentSessionId || state.sessionId;
        state.upsyncStatus = "running";
        saveSyncState(config.local_dir, state);
    }

    const uploadedFiles = new Set<string>(state.uploadedFiles || []);

    if (uploadedFiles.size > 0) {
        Logger.info("SYNC", `Cloud Phase: Resuming from in-progress session. ${uploadedFiles.size} files already marked as uploaded.`);
    }

    // 2. Polling Loop
    while (true) {
        let needsUpload = false;
        try {
            const manifest = readFileSync(manifestPath, "utf8");
            const files = manifest.split("\n")
                .map(line => line.trim())
                .filter(line => line.length > 0 && !line.startsWith("#") && !line.startsWith("{"));

            const newFiles = files.filter(f => !uploadedFiles.has(f));

            const cloudManifestStats = {
                totalFiles: files.length,
                uploadedFiles: uploadedFiles.size,
                pendingFiles: newFiles.length
            };

            if (newFiles.length > 0) {
                Logger.info("SYNC", `Cloud Phase: Found ${newFiles.length} new files in manifest. Starting batch upload.`);
                writeFileSync(batchListPath, newFiles.join("\n"), "utf8");

                const cloudArgs = [
                    "copy", config.local_dir, destRemote,
                    "--files-from", batchListPath,
                    "--checksum", "--fast-list",
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
                        isPaused: getIsSyncPaused(),
                        cloudManifestStats
                    });
                }, undefined, "upload", "cloud");

                newFiles.forEach(f => uploadedFiles.add(f));

                // Update and save state
                state.uploadedFiles = Array.from(uploadedFiles);
                state.upsyncStatus = "running";
                saveSyncState(config.local_dir, state);

                needsUpload = true;
            } else {
                // Report stats even if no files need upload right now
                onProgress({
                    phase: "cloud",
                    description: "Monitoring manifest for updates...",
                    cloudManifestStats
                });
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
        const pollInterval = parseInt(process.env.SYNC_POLL_INTERVAL_MS || "2000");
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Mark as complete
    state.upsyncStatus = "complete";
    saveSyncState(config.local_dir, state);

    // Cleanup batch file
    try {
        if (existsSync(batchListPath)) rmSync(batchListPath, { force: true });
    } catch { /* ignore */ }
}


