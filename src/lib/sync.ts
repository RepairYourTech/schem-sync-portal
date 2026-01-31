import { spawn, type Subprocess } from "bun";
import { join } from "path";
import { existsSync } from "fs";
import type { PortalConfig } from "./config";
import { runCleanupSweep } from "./cleanup";
import { Env } from "./env";
import { Logger } from "./logger";
import { readFileSync, writeFileSync, readdirSync } from "fs";

// Helper to strip ANSI codes and control characters
function stripAnsi(str: string): string {
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
}

/**
 * Represents an individual file being transferred during sync operations.
 * Populated in downloadQueue during pull phase and uploadQueue during cloud phase.
 */
export interface FileTransferItem {
    filename: string;
    size: number;
    transferred: number;
    percentage: number;
    speed: string;
    status: "queued" | "active" | "completed" | "failed";
    eta?: string;
    completedAt?: number; // Timestamp when transfer hit 100%
}

/**
 * Statistics regarding the manifest analysis phase.
 * Populated in manifestStats during pull phase.
 */
export interface ManifestStats {
    remoteFileCount: number;
    localFileCount: number;
    missingFileCount: number;
    optimizationMode: "manifest" | "full";
    manifestSource?: "source" | "backup" | "none";
}

/**
 * Statistics for the malware shield cleanup operation.
 * Populated in cleanupStats during clean phase.
 */
export interface CleanupStats {
    totalArchives: number;
    scannedArchives: number;
    currentArchive?: string;
    currentArchiveSize?: number;
    safePatternCount: number;
    riskyPatternCount: number;
    cleanArchives: number;
    flaggedArchives: number;
    extractedFiles: number;
    purgedFiles: number;
    isolatedFiles: number;
    policyMode: "purge" | "isolate";
}

/**
 * Summary statistics for cloud sync operations.
 * Populated in cloudStats during cloud phase.
 */
export interface CloudSyncStats {
    newFiles: number;
    updatedFiles: number;
    deletedFiles: number;
    provider?: string;
    trashEnabled?: boolean;
}

export interface SyncProgress {
    phase: "pull" | "clean" | "cloud" | "done" | "error";
    description: string;
    percentage: number; // Phase-specific percentage
    globalPercentage?: number; // Total mission percentage
    transferSpeed?: string;
    eta?: string;
    filesTransferred?: number;
    totalFiles?: number;
    bytesTransferred?: string;
    errorCount?: number;
    isPaused?: boolean;

    // New optional fields for enhanced tracking
    manifestStats?: ManifestStats;
    downloadQueue?: FileTransferItem[];
    uploadQueue?: FileTransferItem[];
    cleanupStats?: CleanupStats;
    cloudStats?: CloudSyncStats;
    transferSlots?: { active: number; total: number };
}

const RETRY_FLAGS = [
    "--retries", "4",
    "--retries-sleep", "10s",
    "--low-level-retries", "10",
    "--contimeout", "10s",
    "--timeout", "10s",
    "--ignore-errors"
];

let currentProc: Subprocess | null = null;

// Track active file transfers for queue display
const activeTransfers: Map<string, FileTransferItem> = new Map();
let transferQueueType: "download" | "upload" = "download";

// Deep Session Tracking (Issue-018)
// This Set maintains a list of filenames that have completed in the current session
// to ensure counters remain accurate even across rclone resets or log interleaved output.
const sessionCompletions = new Set<string>();

/**
 * Reset the session completion tracker
 */
export function resetSessionCompletions(): void {
    sessionCompletions.clear();
}

/**
 * Get the current display queue with a limit on completed transfers (Max 2)
 * to prevent them from "polluting" the view and hiding new active transfers.
 */
function getDisplayQueue(limit = 10): FileTransferItem[] {
    const all = Array.from(activeTransfers.values());
    const active = all.filter(t => t.status === "active");
    const completed = all
        .filter(t => t.status === "completed")
        .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
        .slice(0, 2); // Only show 2 most recent completed transfers

    // Filter out very old completed transfers from the source Map to keep it clean
    const now = Date.now();
    activeTransfers.forEach((item, name) => {
        if (item.status === "completed" && item.completedAt && (now - item.completedAt > 60000)) {
            activeTransfers.delete(name);
        }
    });

    return [...active, ...completed]
        .sort((a, b) => {
            // Sort active by progress, completed stay at the end (or top, depending on sorting)
            if (a.status === "active" && b.status === "active") return b.percentage - a.percentage;
            if (a.status === "active") return -1;
            if (b.status === "active") return 1;
            return (b.completedAt || 0) - (a.completedAt || 0);
        })
        .slice(0, limit);
}

/**
 * Parse rclone JSON log entry for transfer statistics
 */
export function parseJsonLog(json: unknown, onUpdate: (stats: Partial<SyncProgress>) => void): void {
    const data = json as Record<string, unknown>;

    // Handle transfer progress updates (rclone emits these for each file)
    if (data.msg === "Transferred" || data.objectType === "file") {
        const name = data.name as string | undefined;
        const size = (data.size as number) || 0;
        const bytes = (data.bytes as number) || 0;
        const speedRaw = data.speed;
        const speed = typeof speedRaw === "number" ? formatSpeed(speedRaw) : (speedRaw as string | undefined);
        const eta = data.eta as number | undefined;

        if (name) {
            const percentage = size > 0 ? Math.round((bytes / size) * 100) : 0;
            const existing = activeTransfers.get(name);
            const status = percentage >= 100 ? "completed" : "active";

            if (status === "completed") sessionCompletions.add(name);

            activeTransfers.set(name, {
                filename: name,
                size,
                transferred: bytes,
                percentage,
                speed: speed || formatSpeed(bytes),
                status,
                eta: eta ? formatEta(eta) : undefined,
                completedAt: (status === "completed" && existing?.status !== "completed") ? Date.now() : existing?.completedAt
            });
        }
    }

    // Handle completion of transfers
    if (data.msg?.toString().includes("Copied") || data.msg?.toString().includes("Moved")) {
        const name = data.object as string | undefined;
        if (name) {
            sessionCompletions.add(name); // Truth-based tracking
            if (activeTransfers.has(name)) {
                const item = activeTransfers.get(name)!;
                if (item.status !== "completed") {
                    item.status = "completed";
                    item.percentage = 100;
                    item.completedAt = Date.now();
                }
            }
            // Trigger update so counters refresh immediately
            onUpdate({
                filesTransferred: sessionCompletions.size,
                downloadQueue: transferQueueType === "download" ? getDisplayQueue(10) : undefined,
                uploadQueue: transferQueueType === "upload" ? getDisplayQueue(10) : undefined
            });
        }
    }

    // Handle overall stats
    if (data.stats) {
        const stats = data.stats as Record<string, unknown>;
        const percentage = stats.percentage as number | undefined;
        const speed = stats.speed as number | undefined;
        const eta = stats.eta as number | undefined;
        const transferring = stats.transferring as Array<Record<string, unknown>> | undefined;

        // Update individual file transfers from stats.transferring array
        if (transferring && Array.isArray(transferring)) {
            for (const transfer of transferring) {
                const name = transfer.name as string;
                const size = (transfer.size as number) || 0;
                const bytes = (transfer.bytes as number) || 0;
                const fileSpeed = transfer.speed as number | undefined;
                const fileEta = transfer.eta as number | undefined;

                if (name) {
                    const filePercentage = size > 0 ? Math.round((bytes / size) * 100) : 0;
                    const existing = activeTransfers.get(name);
                    const status = filePercentage >= 100 ? "completed" : "active";

                    if (status === "completed") sessionCompletions.add(name);

                    activeTransfers.set(name, {
                        filename: name,
                        size,
                        transferred: bytes,
                        percentage: filePercentage,
                        speed: fileSpeed ? formatSpeed(fileSpeed) : "0 B/s",
                        status,
                        eta: fileEta ? formatEta(fileEta) : undefined,
                        completedAt: (status === "completed" && existing?.status !== "completed") ? Date.now() : existing?.completedAt
                    });
                }
            }
        }

        // Build queue from active transfers
        const queue = getDisplayQueue(10);

        const queueUpdate: Partial<SyncProgress> = {
            percentage: percentage ?? undefined, // Don't overwrite with 0 if missing
            transferSpeed: speed ? formatSpeed(speed) : undefined,
            eta: eta ? formatEta(eta) : undefined,
            filesTransferred: sessionCompletions.size, // Truth-based tracking
            transferSlots: { active: queue.filter(t => t.status === "active").length, total: 8 },
        };

        // Assign to correct queue based on current operation type
        if (transferQueueType === "download") {
            queueUpdate.downloadQueue = queue;
        } else {
            queueUpdate.uploadQueue = queue;
        }

        onUpdate(queueUpdate);
    } else if (data.msg === "Transferred" || data.objectType === "file") {
        const queue = getDisplayQueue(10);
        const queueUpdate: Partial<SyncProgress> = {
            filesTransferred: sessionCompletions.size // Always report truth
        };
        if (transferQueueType === "download") {
            queueUpdate.downloadQueue = queue;
        } else {
            queueUpdate.uploadQueue = queue;
        }
        onUpdate(queueUpdate);
    }
}

function formatSpeed(bytesPerSec: number): string {
    if (bytesPerSec >= 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
    if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    return `${bytesPerSec} B/s`;
}

function formatEta(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export async function runSync(
    config: PortalConfig,
    onProgress: (progress: Partial<SyncProgress>) => void
): Promise<void> {
    if (!config.local_dir) {
        onProgress({ phase: "error", description: "Portal not initialized.", percentage: 0 });
        return;
    }

    // --- Phase Weighting Logic (Phase 22: Mission-Centric Progress) ---
    const showPull = config.source_provider !== "none" && config.source_provider !== "unconfigured";
    const showClean = config.enable_malware_shield;
    const showCloud = config.upsync_enabled && config.backup_provider !== "none" && config.backup_provider !== "unconfigured";

    const weights = {
        pull: showPull ? 45 : 0,
        clean: showClean ? 10 : 0,
        cloud: showCloud ? 45 : 0
    };

    const totalWeight = weights.pull + weights.clean + weights.cloud;
    const scale = totalWeight > 0 ? 100 / totalWeight : 1;

    // Helper to wrap onProgress and inject global mission percentage
    const wrapProgress = (p: Partial<SyncProgress>) => {
        const phase = p.phase || "pull";
        const phasePct = p.percentage || 0;

        let baseWeight = 0;
        if (phase === "clean") baseWeight = weights.pull;
        if (phase === "cloud") baseWeight = weights.pull + weights.clean;
        if (phase === "done") baseWeight = totalWeight;

        const currentPhaseWeight = weights[phase as keyof typeof weights] || 0;
        const globalPercentage = Math.min(100, Math.round((baseWeight + (phasePct * currentPhaseWeight / 100)) * scale));

        onProgress({
            ...p,
            phase: phase as SyncProgress["phase"],
            description: p.description || "",
            percentage: phasePct,
            globalPercentage
        });
    };

    try {
        const excludeFile = Env.getExcludeFilePath();

        // --- STEP 1: DOWNLOAD (PULL) ---
        wrapProgress({ phase: "pull", description: "Analyzing Source...", percentage: 0 });

        if (config.source_provider === "none") {
            wrapProgress({ phase: "error", description: "Source remote not configured.", percentage: 0 });
            return;
        }

        const sourceRemote = `${Env.REMOTE_PORTAL_SOURCE}:/`;
        let sourceFlags: string[] = [];

        // Special handling for CopyParty cookie if still used for porting
        if (config.source_provider === "copyparty" && config.cookie) {
            sourceFlags = ["--header", config.cookie];
        }

        // --- MANIFEST DISCOVERY ---
        // Attempt to pull manifest.txt from source to enable faster sync
        const localManifest = join(config.local_dir, "manifest.txt");
        try {
            Logger.debug("SYNC", "Checking for remote manifest.txt...");
            await executeRclone([
                "copyto", `${sourceRemote}manifest.txt`, localManifest,
                ...sourceFlags,
                ...RETRY_FLAGS
            ], () => { });
            Logger.info("SYNC", "Remote manifest.txt found at Source.");
        } catch {
            Logger.debug("SYNC", "No manifest.txt at Source, checking Backup...");
            // If not at source, check backup (if configured)
            if (config.upsync_enabled && config.backup_provider !== "none") {
                const destRemote = `${Env.REMOTE_PORTAL_BACKUP}:/`;
                try {
                    await executeRclone([
                        "copyto", `${destRemote}manifest.txt`, localManifest,
                        ...RETRY_FLAGS
                    ], () => { });
                    Logger.info("SYNC", "Remote manifest.txt found at Backup.");
                } catch {
                    Logger.debug("SYNC", "No manifest.txt at Backup either.");
                }
            }
        }

        const pullCmd = config.strict_mirror ? "sync" : "copy";
        let hasManifest = existsSync(localManifest);
        let pullArgs: string[] = [];

        // Track totals for progress reporting
        let manifestStats: ManifestStats | undefined;
        let totalFilesToSync = 0;
        let initialLocalCount = 0;
        let initialMissingCount = 0;

        wrapProgress({ phase: "pull", description: `Downloading from ${sourceRemote}...`, percentage: 0 });
        const missingFile = join(config.local_dir || ".", "missing.txt");

        if (hasManifest) {
            Logger.info("SYNC", "Synthesizing missing.txt from manifest...");
            try {
                const manifestContent = readFileSync(localManifest, "utf8");
                const remoteFiles = manifestContent.split("\n")
                    .map(line => line.trim())
                    .filter(line => line.length > 0 && !line.startsWith("#"));

                // Get local files list
                const localFiles = new Set<string>();
                const scan = (dir: string, base: string) => {
                    const entries = readdirSync(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        const relPath = join(base, entry.name);
                        if (entry.isDirectory()) {
                            scan(join(dir, entry.name), relPath);
                        } else {
                            localFiles.add(relPath);
                        }
                    }
                };
                if (existsSync(config.local_dir)) scan(config.local_dir, "");

                const missing = remoteFiles.filter(f => !localFiles.has(f));
                writeFileSync(missingFile, missing.join("\n"));

                // Populate manifestStats for UI display
                initialLocalCount = localFiles.size;
                initialMissingCount = missing.length;

                manifestStats = {
                    remoteFileCount: remoteFiles.length,
                    localFileCount: initialLocalCount,
                    missingFileCount: initialMissingCount,
                    optimizationMode: "manifest",
                    manifestSource: "source"
                };
                totalFilesToSync = missing.length;

                Logger.info("SYNC", `Manifest parsed: ${remoteFiles.length} remote, ${localFiles.size} local, ${missing.length} missing.`);

                // Report manifest stats immediately
                wrapProgress({
                    phase: "pull",
                    description: `Downloading ${missing.length} missing files...`,
                    percentage: 0,
                    totalFiles: missing.length,
                    filesTransferred: 0,
                    manifestStats
                });
            } catch (err) {
                Logger.error("SYNC", "Failed to parse manifest.txt, ignoring manifest stats", err as Error);
            }
        }

        // --- STEP 1: DOWNLOAD (PULL) ---
        // We still parse manifest for stats if available, but we use regular rclone sync for robustness
        pullArgs = [
            pullCmd, sourceRemote, config.local_dir,
            ...sourceFlags,
            "--exclude-from", excludeFile,
            "--exclude", "_risk_tools/**",
            "--size-only", "--fast-list",
            "--transfers", String(config.downsync_transfers || 4),
            "--checkers", "16",
            ...RETRY_FLAGS
        ];

        // Set queue type for file transfer tracking
        transferQueueType = "download";
        activeTransfers.clear();
        resetSessionCompletions(); // Truth-based tracking (Issue-018)
        activeProgressCallback = wrapProgress; // Store for immediate pause/resume refresh

        await executeRclone(pullArgs, (stats) => {
            // Merge in our known totalFiles from manifest if available
            const totalFiles = totalFilesToSync > 0 ? totalFilesToSync : stats.totalFiles;

            // Derive Live Manifest Stats from Truth Set (Issue-018)
            const completedCount = sessionCompletions.size;
            if (manifestStats) {
                manifestStats = {
                    ...manifestStats,
                    localFileCount: initialLocalCount + completedCount,
                    missingFileCount: Math.max(0, initialMissingCount - completedCount)
                };
            }

            // Smoothing: percentage based on manifest total if available
            const displayPercentage = (totalFilesToSync > 0)
                ? Math.min(100, Math.round((completedCount / totalFilesToSync) * 100))
                : (stats.percentage ?? 0);

            wrapProgress({
                phase: "pull",
                description: hasManifest ? "Downloading missing files..." : "Downloading...",
                percentage: displayPercentage,
                totalFiles,
                manifestStats,
                filesTransferred: completedCount, // Always report truth
                isPaused: isSyncPaused,
                ...stats
            });
        });


        // --- STEP 2: CLEAN (MALWARE SHIELD) ---
        if (config.enable_malware_shield) {
            wrapProgress({ phase: "clean", description: "Surgical Malware Shield...", percentage: 0 });
            const cleanupResult = await runCleanupSweep(
                config.local_dir,
                excludeFile,
                config.malware_policy || "purge",
                (stats: CleanupStats) => {
                    const progress = stats.totalArchives > 0
                        ? Math.round((stats.scannedArchives / stats.totalArchives) * 100)
                        : 0;

                    let desc = "Scanning archives...";
                    if (stats.currentArchive) {
                        desc = `Scanning ${stats.currentArchive}...`;
                    }

                    wrapProgress({
                        phase: "clean",
                        description: desc,
                        percentage: progress,
                        cleanupStats: stats
                    });
                }
            );
            if (cleanupResult.completed) {
                wrapProgress({ phase: "clean", description: "Cleanup complete.", percentage: 100 });
            } else {
                Logger.warn("SYNC", `Cleanup incomplete: ${cleanupResult.unscannedArchives.length} archives not scanned`);
                wrapProgress({ phase: "clean", description: "Cleanup incomplete (aborted).", percentage: 50 });
            }
        }


        // --- STEP 3: UPLOAD (PUSH) ---
        if (config.upsync_enabled && config.backup_provider !== "none") {
            const destRemote = `${Env.REMOTE_PORTAL_BACKUP}:/`;

            wrapProgress({ phase: "cloud", description: `Backing up to ${destRemote}...`, percentage: 0 });

            const cloudArgs = [
                "sync", config.local_dir, destRemote,
                "--exclude", "_risk_tools/**",
                "--size-only", "--fast-list",
                "--transfers", String(config.upsync_transfers || 4),
                "--checkers", "16",
                ...RETRY_FLAGS
            ];

            if (hasManifest) {
                Logger.info("SYNC", "Using manifest.txt for optimized Push.");
                cloudArgs.push("--files-from", localManifest);
            }

            // GDrive specific flags (if dest is gdrive)
            if (config.backup_provider === "gdrive") {
                cloudArgs.push("--drive-use-trash=false");
            }

            // Set queue type for file transfer tracking
            transferQueueType = "upload";
            activeTransfers.clear();

            await executeRclone(cloudArgs, (stats) => wrapProgress({
                phase: "cloud",
                description: "Cloud Backup...",
                percentage: stats.percentage ?? 0,
                isPaused: isSyncPaused,
                ...stats
            }));
        }

        wrapProgress({ phase: "done", description: "MISSION ACCOMPLISHED. SYSTEM RESILIENT.", percentage: 100, isPaused: false });
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error("SYNC", "Sync failed", error);
        wrapProgress({ phase: "error", description: `Sync Failed: ${error.message}`, percentage: 0 });
    }
}

async function executeRclone(
    args: string[],
    onUpdate: (stats: Partial<SyncProgress>) => void
): Promise<void> {
    return new Promise((resolve, reject) => {
        const fullArgs = [
            "--config", Env.getRcloneConfigPath(),
            ...args,
            "-P",
            "--stats", "500ms",
            "--log-level", "INFO",
            "--use-json-log"
        ];

        Logger.debug("SYNC", `Executing: rclone ${fullArgs.join(" ")}`);

        const rcloneCmd = process.env.MOCK_RCLONE ? ["bun", process.env.MOCK_RCLONE] : ["rclone"];
        const finalCmd = [...rcloneCmd, ...fullArgs];
        Logger.debug("SYNC", `Spawning: ${finalCmd.join(" ")}`);

        currentProc = spawn(finalCmd, {
            stdout: "pipe",
            stderr: "pipe",
            env: process.env
        });

        // Apply initial pause state if preferred (Production Quality: Survivor Logic)
        if (isSyncPaused) {
            Logger.info("SYNC", "Applying initial pause state to new process...");
            currentProc.kill("SIGSTOP");
            // Trigger immediate UI refresh so it doesn't wait for rclone stats
            onUpdate({ isPaused: true });
        }

        const handleOutput = async (stream: ReadableStream, isError: boolean) => {
            const reader = stream.getReader();
            const decoder = new TextDecoder();
            let remainder = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = remainder + decoder.decode(value);
                // Split on BOTH newline and carriage return
                const lines = text.split(/[\r\n]+/);
                remainder = lines.pop() || "";

                for (const line of lines) {
                    const cleanedLine = stripAnsi(line).trim();
                    if (!cleanedLine) continue;

                    if (isError) {
                        try {
                            const json = JSON.parse(cleanedLine);
                            parseJsonLog(json, onUpdate);
                            // Restore logging for structured logs
                            if (json.msg) {
                                if (json.level === "error") Logger.error("SYNC", `[rclone] ${json.msg}`);
                                else if (json.level === "info") Logger.info("SYNC", `[rclone] ${json.msg}`);
                                else Logger.debug("SYNC", `[rclone] ${json.msg}`);
                            }
                        } catch {
                            // Fallback to progress parsing for human-readable errors/info
                            Logger.info("SYNC", `[rclone] ${cleanedLine}`);
                            parseProgress(cleanedLine, onUpdate);
                        }
                    } else {
                        // Stdout is usually human-readable progress if not using JSON log
                        parseProgress(cleanedLine, onUpdate);
                    }
                }
            }
        };

        const stdoutDone = currentProc.stdout ? handleOutput(currentProc.stdout as unknown as ReadableStream, false) : Promise.resolve();
        const stderrDone = currentProc.stderr ? handleOutput(currentProc.stderr as unknown as ReadableStream, true) : Promise.resolve();

        const checkExit = async () => {
            const exitCode = await currentProc?.exited;
            Logger.debug("SYNC", `rclone exited with code ${exitCode}`);
            await Promise.all([stdoutDone, stderrDone]);
            currentProc = null;
            if (exitCode === 0) {
                onUpdate({ percentage: 100 });
                resolve();
            } else {
                reject(new Error(`rclone failed with exit code ${exitCode}`));
            }
        };

        checkExit();
    });
}

export function parseProgress(line: string, onUpdate: (stats: Partial<SyncProgress>) => void) {
    // Overall Stats
    const transferredMatch = line.match(/Transferred:\s+([\d.]+ \w+) \/ ([\d.]+ \w+), (\d+)%, ([\d.]+ \w+\/s), ETA ([\w\s]+)/);
    if (transferredMatch) {
        onUpdate({
            bytesTransferred: `${transferredMatch[1]}/${transferredMatch[2]}`,
            percentage: parseInt(transferredMatch[3]!),
            transferSpeed: transferredMatch[4],
            eta: transferredMatch[5]
        });
        return;
    }

    const filesMatch = line.match(/Files:\s+(\d+)\s+\/\s+(\d+),\s+(\d+)%/);
    if (filesMatch) {
        onUpdate({
            filesTransferred: parseInt(filesMatch[1]!),
            totalFiles: parseInt(filesMatch[2]!),
            percentage: parseInt(filesMatch[3]!)
        });
        return;
    }

    // Individual File Progress (fallback for -P output)
    // Example: * some_file.zip: 50% /100.000 MiB, 5.000 MiB/s, 10s
    // OR:      * some_file.zip: transferring (no percentage yet)
    // The name can contain spaces, dots, etc. It ends at the last colon before the stats.
    const fileMatch = line.match(/^\*\s*(.*?):\s*(\d+)?%?\s*(\/)?([\d.]+ \w+)?(,\s*)?([\d.]+ \w+\/s)?(,\s*)?([^\r\n]+)?$/);
    if (fileMatch && !line.includes("Transferred:") && !line.includes("Files:")) {
        const name = fileMatch[1]?.trim();
        if (name) {
            const percentage = parseInt(fileMatch[2] || "0");
            const speed = fileMatch[6] || "0 B/s";
            const existing = activeTransfers.get(name);
            const status = percentage >= 100 ? "completed" : "active";

            if (status === "completed") sessionCompletions.add(name);

            activeTransfers.set(name, {
                filename: name,
                percentage,
                speed,
                transferred: 0, // Approximate as 0 for fallback
                size: 0,        // Approximate as 0 for fallback
                status,
                eta: fileMatch[8]?.trim(),
                completedAt: (status === "completed" && existing?.status !== "completed") ? Date.now() : existing?.completedAt
            });

            // Use the smart queue logic (max 2 completed)
            const queue = getDisplayQueue(10);

            onUpdate(transferQueueType === "download"
                ? { downloadQueue: queue, filesTransferred: sessionCompletions.size }
                : { uploadQueue: queue, filesTransferred: sessionCompletions.size }
            );
        }
        return;
    }

    // Catch-all for simple percentage (ONLY if clearly labels as overall progress)
    // Avoid catching per-file progress like "file.zip: 50%"
    if (line.includes("Transferred") || line.includes("Files")) {
        const percentMatch = line.match(/(\d+)%/);
        if (percentMatch) {
            onUpdate({ percentage: parseInt(percentMatch[1]!) });
        }
    }
}

// Global tracking for immediate UI refresh (Issue-018)
let isSyncPaused = false;
let activeProgressCallback: ((stats: Partial<SyncProgress>) => void) | null = null;

export function getIsSyncPaused(): boolean {
    return isSyncPaused;
}

export function stopSync(): void {
    if (currentProc) {
        currentProc.kill();
        currentProc = null;
    }
    // Deep Fix: Do NOT reset isSyncPaused here. 
    // It is a user preference that should survive stop/start.
    activeProgressCallback = null;
}

export function pauseSync(): void {
    if (currentProc && !isSyncPaused) {
        currentProc.kill("SIGSTOP");
        isSyncPaused = true;
        Logger.info("SYNC", "Sync process paused (SIGSTOP)");

        // Trigger immediate UI refresh because rclone will stop outputting
        if (activeProgressCallback) {
            activeProgressCallback({ isPaused: true });
        }
    }
}

export function resumeSync(): void {
    if (currentProc && isSyncPaused) {
        currentProc.kill("SIGCONT");
        isSyncPaused = false;
        Logger.info("SYNC", "Sync process resumed (SIGCONT)");

        // Trigger immediate UI refresh
        if (activeProgressCallback) {
            activeProgressCallback({ isPaused: false });
        }
    }
}


/**
 * Reset all ephemeral session state.
 * Called when a full sync cycle finishes or when entering the view fresh.
 */
export function clearSyncSession(): void {
    isSyncPaused = false;
    sessionCompletions.clear();
    activeTransfers.clear();
    activeProgressCallback = null;
}
