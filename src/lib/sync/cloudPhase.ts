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
export async function runManifestCloudPhase(
    config: PortalConfig,
    onProgress: (p: Partial<SyncProgress>) => void,
    isPullDone?: () => boolean
): Promise<void> {
    const manifestPath = join(config.local_dir, "upsync-manifest.txt");
    const destPath = config.backup_dir || (config.backup_provider === "gdrive" ? "SchematicsBackup" : "");
    const destRemote = `${Env.REMOTE_PORTAL_BACKUP}:${destPath}`;
    const remoteManifestName = "upsync-remote-manifest.txt";
    const remoteManifestPath = `${destRemote}/${remoteManifestName}`;
    const localRemoteManifestPath = join(config.local_dir, "remote-manifest-cache.txt");
    const batchListPath = join(config.local_dir, ".upsync-batch.txt");

    Logger.info("SYNC", "Cloud Phase: Waiting for initial manifest...");

    // 1. Wait for initial manifest
    while (!existsSync(manifestPath)) {
        if (isStopRequested()) {
            Logger.info("SYNC", "Cloud Phase: Stop requested while waiting for manifest.");
            return;
        }
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

    // 1.5 Remote Manifest Verification (Anti-Duplication)
    try {
        Logger.info("SYNC", "Cloud Phase: Checking for remote manifest...");
        await executeRcloneSimple(["copyto", remoteManifestPath, localRemoteManifestPath]);
        if (existsSync(localRemoteManifestPath)) {
            const remoteContent = readFileSync(localRemoteManifestPath, "utf8");
            const remoteFiles = remoteContent.split("\n")
                .map(l => l.trim())
                .filter(l => l.length > 0 && !l.startsWith("#"));

            let reconciledCount = 0;
            for (const f of remoteFiles) {
                if (!uploadedFiles.has(f)) {
                    uploadedFiles.add(f);
                    reconciledCount++;
                }
            }
            if (reconciledCount > 0) {
                Logger.info("SYNC", `Cloud Phase: Reconciled ${reconciledCount} files from remote manifest.`);
                onProgress({ phase: "cloud", description: `Reconciled ${reconciledCount} files from remote.` });
            }
            rmSync(localRemoteManifestPath, { force: true });
        }
    } catch {
        Logger.info("SYNC", "Cloud Phase: No remote manifest found or inaccessible. Proceeding with local state.");
    }

    if (uploadedFiles.size > 0) {
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
                }, () => isStopRequested(), "upload", "cloud");

                if (isStopRequested()) break;

                newFiles.forEach(f => uploadedFiles.add(f));

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
        } catch (err) {
            if (isStopRequested()) {
                Logger.info("SYNC", "Cloud Phase: Stop requested during operation. Exiting.");
                break;
            }
            Logger.error("SYNC", `Error in cloud phase polling: ${err instanceof Error ? err.message : String(err)}`);
        }

        const pullIsDone = isPullDone ? isPullDone() : true;
        if (pullIsDone && !needsUpload) {
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

    // Mark as complete
    state.upsyncStatus = "complete";
    saveSyncState(config.local_dir, state);

    // Final handshake: Ensure remote manifest is identical to final local manifest
    try {
        if (existsSync(manifestPath)) {
            await executeRcloneSimple(["copyto", manifestPath, remoteManifestPath]);
        }
    } catch (err) {
        Logger.debug("SYNC", `Final handshake failed (non-critical): ${err instanceof Error ? err.message : String(err)}`);
    }

    // Cleanup batch file
    try {
        if (existsSync(batchListPath)) rmSync(batchListPath, { force: true });
    } catch { /* ignore */ }
}


