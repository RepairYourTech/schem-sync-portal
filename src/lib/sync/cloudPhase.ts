import { join } from "path";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { Env } from "../env";
import { executeRclone, RETRY_FLAGS, getIsSyncPaused, isShieldBlocking } from "./utils";
import { clearActiveTransfers } from "./progress";
import type { PortalConfig } from "../config";
import type { SyncProgress } from "./types";
import type { StreamingFileQueue } from "./streamingQueue";
import { Logger } from "../logger";

/**
 * Runs the Cloud Phase: Local -> Remote backup.
 */
export async function runCloudPhase(
    config: PortalConfig,
    onProgress: (p: Partial<SyncProgress>) => void
): Promise<void> {
    const excludeFile = Env.getExcludeFilePath(config.local_dir);
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

    clearActiveTransfers();

    await executeRclone(cloudArgs, (p) => {
        onProgress({
            ...p,
            phase: "cloud",
            description: "Syncing to Cloud...",
            isPaused: getIsSyncPaused()
        });
    }, undefined, "upload", "cloud");
}

/**
 * Runs the Streaming Cloud Phase: Uploads files as they are cleared by shield.
 * Consumes from a StreamingFileQueue in parallel with the pull phase.
 */
export async function runStreamingCloudPhase(
    config: PortalConfig,
    onProgress: (p: Partial<SyncProgress>) => void,
    cleanedQueue: StreamingFileQueue
): Promise<void> {
    const destPath = config.backup_dir || (config.backup_provider === "gdrive" ? "SchematicsBackup" : "");
    const destRemote = `${Env.REMOTE_PORTAL_BACKUP}:${destPath}`;
    const batchListFile = join(config.local_dir, ".upsync-batch.txt");

    clearActiveTransfers();

    let totalUploaded = 0;

    onProgress({
        phase: "cloud",
        description: "Waiting for files to upsync...",
        percentage: 0,
        isPaused: getIsSyncPaused()
    });

    // Consume batches from the queue as they become available
    for await (const batch of cleanedQueue.drain(50)) {
        if (batch.length === 0) continue;

        // Shield-blocking coordination: wait if shield is paused
        if (isShieldBlocking()) {
            onProgress({
                phase: "cloud",
                description: "Waiting for shield to resume...",
                percentage: 0,
                isPaused: false
            });
            while (isShieldBlocking()) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        Logger.debug("SYNC", `Streaming upsync: uploading batch of ${batch.length} files`);

        // Write batch to temporary file list
        if (!existsSync(config.local_dir)) {
            mkdirSync(config.local_dir, { recursive: true });
        }
        writeFileSync(batchListFile, batch.join("\n"));

        const batchArgs = [
            "copy", config.local_dir, destRemote,
            "--files-from", batchListFile,
            "--size-only",
            "--transfers", String(config.upsync_transfers || 4),
            "--checkers", "8",
            ...RETRY_FLAGS
        ];

        if (config.backup_provider === "gdrive") batchArgs.push("--drive-use-trash=false");

        await executeRclone(batchArgs, (stats) => onProgress({
            phase: "cloud",
            description: `Streaming upsync: ${totalUploaded + batch.length} files...`,
            isPaused: getIsSyncPaused(),
            ...stats,
            percentage: stats.percentage ?? 0
        }), undefined, "upload", "cloud");

        totalUploaded += batch.length;
    }

    // Final sync to catch any stragglers
    Logger.info("SYNC", `Streaming upsync complete: ${totalUploaded} files uploaded`);
}

