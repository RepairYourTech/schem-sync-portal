import { join } from "path";
import { existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import { Env } from "../env";
import { executeRclone, executeRcloneSimple, RETRY_FLAGS, getIsSyncPaused, getCurrentSessionId, setSessionId, isStopRequested } from "./utils";
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
/** Outcome of the upload phase. `failures` is non-empty when batches did not upload. */
export interface CloudPhaseResult {
    uploadedCount: number;
    failures: string[];
    stopped: boolean;
}

/** Give up polling after this many consecutive failed upload attempts. */
const MAX_CONSECUTIVE_UPLOAD_FAILURES = 3;

export async function runManifestCloudPhase(
    config: PortalConfig,
    onProgress: (p: Partial<SyncProgress>) => void,
    isPullDone?: () => boolean
): Promise<CloudPhaseResult> {
    const manifestPath = join(config.local_dir, "upsync-manifest.txt");
    const destPath = config.backup_dir || (config.backup_provider === "gdrive" ? "SchematicsBackup" : "");
    const destRemote = `${Env.REMOTE_PORTAL_BACKUP}:${destPath}`;
    const remoteManifestName = "upsync-remote-manifest.txt";
    const remoteManifestPath = `${destRemote}/${remoteManifestName}`;
    const _localRemoteManifestPath = join(config.local_dir, "remote-manifest-cache.txt");
    const batchListPath = join(config.local_dir, ".upsync-batch.txt");

    Logger.info("SYNC", "Cloud Phase: Waiting for initial manifest...");

    // 1. Wait for initial manifest
    while (!existsSync(manifestPath)) {
        if (isStopRequested()) {
            Logger.info("SYNC", "Cloud Phase: Stop requested while waiting for manifest.");
            return { uploadedCount: 0, failures: [], stopped: true };
        }
        if (isPullDone && isPullDone()) {
            Logger.info("SYNC", "Pull phase completed before manifest appeared. Nothing to upsync.");
            onProgress({ phase: "cloud", description: "No files to backup. Pull completed." });
            return { uploadedCount: 0, failures: [], stopped: false };
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        onProgress({ phase: "cloud", description: "Waiting for files to process..." });
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
    /** Consecutive failures; reset by any successful pass. */
    const uploadFailures: string[] = [];
    /** Every failure seen this run, for the final outcome. */
    const allFailures: string[] = [];

    // NOTE: Remote manifest reconciliation was removed because the handshake
    // uploaded the FULL local manifest (including files never actually uploaded),
    // causing false positives that blocked real uploads. rclone's --checksum flag
    // handles deduplication natively and accurately.
    if (uploadedFiles.size > 0) {
        onProgress({ phase: "cloud", description: `Resuming session: ${uploadedFiles.size.toLocaleString()} files already uploaded.` });
        Logger.info("SYNC", `Cloud Phase: Resuming from in-progress session. ${uploadedFiles.size} files already marked as uploaded.`);
    }

    // 2. Polling Loop
    while (true) {
        if (isStopRequested()) {
            Logger.info("SYNC", "Cloud Phase: Stop requested. Exiting loop.");
            break;
        }
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
                onProgress({ phase: "cloud", description: `Uploading ${newFiles.length.toLocaleString()} files to backup...` });
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
                if (isStopRequested()) break;
                await executeRclone(cloudArgs, (p) => {
                    onProgress({
                        ...p,
                        phase: "cloud",
                        description: `Uploading batch (${newFiles.length} files)...`,
                        isPaused: getIsSyncPaused(),
                        cloudManifestStats
                    });
                }, undefined, "upload", "cloud");

                if (isStopRequested()) break;

                for (const f of newFiles) {
                    uploadedFiles.add(f);
                }

                if (isStopRequested()) break;
                // Update and save state
                state.uploadedFiles = Array.from(uploadedFiles);
                state.upsyncStatus = "running";
                saveSyncState(config.local_dir, state);

                // Handshake: Upload current manifest as remote manifest
                try {
                    await executeRcloneSimple(["copyto", manifestPath, remoteManifestPath]);
                    Logger.debug("SYNC", "Cloud Phase: Remote manifest updated.");
                } catch (err) {
                    Logger.error("SYNC", `Failed to update remote manifest: ${err instanceof Error ? err.message : String(err)}`);
                }

                needsUpload = true;
            } else {
                // Report stats even if no files need upload right now
                onProgress({
                    phase: "cloud",
                    description: "Monitoring manifest for updates...",
                    cloudManifestStats
                });
            }
            // Always report stats at least once per loop if we have them
            onProgress({
                phase: "cloud",
                cloudManifestStats
            });
            uploadFailures.length = 0; // a clean pass clears the failure streak
        } catch (err) {
            if (isStopRequested()) {
                Logger.info("SYNC", "Cloud Phase: Stop requested during operation. Exiting.");
                break;
            }
            const message = err instanceof Error ? err.message : String(err);
            Logger.error("SYNC", `Error in cloud phase polling: ${message}`);
            uploadFailures.push(message);
            allFailures.push(message);

            // Without this the loop retries forever, reporting "Monitoring manifest for
            // updates..." while nothing uploads, and still ends in "Backup complete".
            if (uploadFailures.length >= MAX_CONSECUTIVE_UPLOAD_FAILURES) {
                Logger.error("SYNC", `Cloud Phase: aborting after ${uploadFailures.length} consecutive upload failures.`);
                state.upsyncStatus = "error";
                saveSyncState(config.local_dir, state);
                throw new Error(`Backup failed after ${uploadFailures.length} attempts: ${message}`);
            }
        }

        const pullIsDone = isPullDone ? isPullDone() : true;
        if (pullIsDone && !needsUpload) {
            // Re-read manifest one final time to catch files added between our last read and pullDone
            try {
                const finalManifest = readFileSync(manifestPath, "utf8");
                const finalFiles = finalManifest.split("\n")
                    .map(line => line.trim())
                    .filter(line => line.length > 0 && !line.startsWith("#") && !line.startsWith("{"));
                const finalNew = finalFiles.filter(f => !uploadedFiles.has(f));
                if (finalNew.length > 0) {
                    Logger.info("SYNC", `Cloud Phase: Final sweep found ${finalNew.length} files added during pull. Continuing.`);
                    continue; // Loop back to process them
                }
            } catch { /* proceed to break */ }
            Logger.info("SYNC", "Cloud Phase: Pull complete and all manifest entries processed. Finishing.");
            break;
        }

        if (isStopRequested()) {
            Logger.info("SYNC", "Cloud Phase: Stop requested. Exiting.");
            break;
        }

        // Wait before next check
        onProgress({ phase: "cloud", description: "Monitoring manifest for updates..." });
        const pollInterval = parseInt(process.env.SYNC_POLL_INTERVAL_MS || "2000");
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Every `break` above lands here, including a user stop mid-upload. Report what
    // actually happened rather than announcing completion unconditionally.
    const stopped = isStopRequested();

    if (stopped) {
        state.upsyncStatus = "incomplete";
        saveSyncState(config.local_dir, state);
        onProgress({ phase: "cloud", description: `Backup stopped by user. ${uploadedFiles.size.toLocaleString()} file(s) uploaded before stopping.` });
    } else if (allFailures.length > 0) {
        state.upsyncStatus = "incomplete";
        saveSyncState(config.local_dir, state);
        onProgress({ phase: "cloud", description: `Backup incomplete: ${allFailures.length} upload error(s). ${uploadedFiles.size.toLocaleString()} files uploaded.` });
    } else {
        state.upsyncStatus = "complete";
        saveSyncState(config.local_dir, state);
        onProgress({ phase: "cloud", description: `Backup complete. ${uploadedFiles.size.toLocaleString()} files synced to remote.`, percentage: 100 });
    }

    // Final handshake: Ensure remote manifest is identical to final local manifest.
    // Only when the backup is actually complete — otherwise the remote manifest would
    // claim files that were never uploaded.
    if (!stopped && allFailures.length === 0) {
        try {
            if (existsSync(manifestPath)) {
                await executeRcloneSimple(["copyto", manifestPath, remoteManifestPath]);
            }
        } catch (err) {
            Logger.debug("SYNC", `Final handshake failed (non-critical): ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    // Cleanup batch file
    try {
        if (existsSync(batchListPath)) rmSync(batchListPath, { force: true });
    } catch { /* ignore */ }

    return { uploadedCount: uploadedFiles.size, failures: allFailures, stopped };
}


