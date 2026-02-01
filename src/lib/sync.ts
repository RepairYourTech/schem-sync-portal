import { spawn, type Subprocess } from "bun";
import { join } from "path";
import { existsSync } from "fs";
import type { PortalConfig } from "./config";
import { runCleanupSweep, GARBAGE_PATTERNS } from "./cleanup";
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
    riskyFileCount?: number;
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
let isSyncPaused = false;
let activeProgressCallback: ((p: Partial<SyncProgress>) => void) | null = null;
let currentProgress: SyncProgress = { phase: "done", description: "Ready to sync.", percentage: 0 };
const lastProgressRef = { current: null as SyncProgress | null };

// Track active file transfers for queue display
const activeTransfers: Map<string, FileTransferItem> = new Map();
let transferQueueType: "download" | "upload" = "download";

// Deep Session Tracking
const sessionCompletions = new Set<string>();

/**
 * Gets the rclone command based on environment (MOCK_RCLONE support)
 */
function getRcloneCmd(): string[] {
    return process.env.MOCK_RCLONE
        ? ["bun", "run", process.env.MOCK_RCLONE]
        : ["rclone"];
}

/**
 * Reset the session completion tracker
 */
export function resetSessionCompletions(): void {
    sessionCompletions.clear();
}

/**
 * Get the current display queue with a limit on completed transfers (Max 2)
 */
function getDisplayQueue(limit = 10): FileTransferItem[] {
    const all = Array.from(activeTransfers.values());
    const active = all.filter(t => t.status === "active");
    const completed = all
        .filter(t => t.status === "completed")
        .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
        .slice(0, 10);

    const now = Date.now();
    activeTransfers.forEach((item, name) => {
        if (item.status === "completed" && item.completedAt && (now - item.completedAt > 60000)) {
            activeTransfers.delete(name);
        }
    });

    return [...active, ...completed]
        .sort((a, b) => {
            if (a.status === "active" && b.status === "active") return b.percentage - a.percentage;
            if (a.status === "active") return -1;
            if (b.status === "active") return 1;
            return (b.completedAt || 0) - (a.completedAt || 0);
        })
        .slice(0, limit);
}

/**
 * Resets internal session state for tests.
 */
export function resetSessionState(): void {
    sessionCompletions.clear();
    activeTransfers.clear();
}

/**
 * Parse rclone JSON log entry for transfer statistics
 */
export function parseJsonLog(json: unknown, onUpdate: (stats: Partial<SyncProgress>) => void): void {
    const data = json as Record<string, unknown>;

    // Handle slog/v1.73.0 format where progress might be in 'msg' or 'stats'
    if (data.msg === "Transferred" || data.objectType === "file" || (data.msg?.toString().includes("Transferring:") && !data.stats)) {
        const msgStr = data.msg?.toString() || "";
        const name = (data.name as string) || (msgStr.includes("Transferring:") ? msgStr.split("Transferring:")[1]?.trim().split(":")[0]?.trim() : undefined);
        let size = (data.size as number) || 0;
        let bytes = (data.bytes as number) || 0;
        let percentage = size > 0 ? Math.round((bytes / size) * 100) : 0;
        const speedRaw = data.speed;
        let speed = typeof speedRaw === "number" ? formatSpeed(speedRaw) : (speedRaw as string | undefined);
        const etaRaw = data.eta;
        let eta = typeof etaRaw === "number" ? formatEta(etaRaw) : (etaRaw as string | undefined);

        // Fallback parsing from msg string (e.g. "Transferring: file.txt: 45% /1.2Mi, 128KiB/s, 2s")
        if (msgStr.includes("Transferring:") && percentage === 0) {
            const parts = msgStr.split(":");
            if (parts.length >= 3) {
                const pctPart = parts[2].trim().split("%")[0];
                if (pctPart && !isNaN(parseInt(pctPart))) {
                    percentage = parseInt(pctPart);
                }
                // Try to get speed from the third part
                const speedMatch = msgStr.match(/, ([^,]+)\/s/);
                if (speedMatch && !speed) speed = speedMatch[1] + "/s";

                const etaMatch = msgStr.match(/, ([^,]+)$/);
                if (etaMatch && !eta) eta = etaMatch[1];
            }
        }

        if (name) {
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
                eta: eta || undefined,
                completedAt: (status === "completed" && existing?.status !== "completed") ? Date.now() : existing?.completedAt
            });
        }
    }

    if (data.msg?.toString().includes("Copied") || data.msg?.toString().includes("Moved")) {
        const name = data.object as string | undefined;
        if (name) {
            sessionCompletions.add(name);
            if (activeTransfers.has(name)) {
                const item = activeTransfers.get(name)!;
                if (item.status !== "completed") {
                    item.status = "completed";
                    item.percentage = 100;
                    item.completedAt = Date.now();
                }
            }
            onUpdate({
                filesTransferred: sessionCompletions.size,
                downloadQueue: transferQueueType === "download" ? getDisplayQueue(10) : undefined,
                uploadQueue: transferQueueType === "upload" ? getDisplayQueue(10) : undefined
            });
        }
    }

    if (data.stats) {
        const stats = data.stats as Record<string, unknown>;
        const percentage = stats.percentage as number | undefined;
        const speed = stats.speed as number | undefined;
        const eta = stats.eta as number | undefined;
        const transferring = stats.transferring as Array<Record<string, unknown>> | undefined;

        if (transferring && Array.isArray(transferring)) {
            Logger.debug("SYNC", `Processing ${transferring.length} transferring items`);
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
        } else {
            Logger.debug("SYNC", `No transferring array in stats. Keys: ${Object.keys(stats).join(", ")}`);
        }

        const queue = getDisplayQueue(10);
        const bytes = (stats?.bytes as number) || 0;
        const total = (stats?.totalBytes as number) || 0;

        const queueUpdate: Partial<SyncProgress> = {
            percentage: percentage ?? undefined,
            transferSpeed: speed ? formatSpeed(speed) : undefined,
            eta: eta ? formatEta(eta) : undefined,
            bytesTransferred: total > 0 ? `${formatBytes(bytes)}/${formatBytes(total)}` : undefined,
            filesTransferred: sessionCompletions.size,
            transferSlots: { active: queue.filter(t => t.status === "active").length, total: 8 },
        };

        if (transferQueueType === "download") {
            queueUpdate.downloadQueue = queue;
            Logger.debug("SYNC", `Queue update: downloadQueue length=${queue.length}, transferQueueType=${transferQueueType}, activeTransfers size=${activeTransfers.size}`);
        } else {
            queueUpdate.uploadQueue = queue;
        }

        onUpdate(queueUpdate);
    } else if (data.msg === "Transferred" || data.objectType === "file" || (data.msg?.toString().includes("Transferring:") && !data.stats)) {
        const queue = getDisplayQueue(10);
        const queueUpdate: Partial<SyncProgress> = {
            filesTransferred: sessionCompletions.size
        };
        if (transferQueueType === "download") {
            queueUpdate.downloadQueue = queue;
        } else {
            queueUpdate.uploadQueue = queue;
        }
        onUpdate(queueUpdate);
    }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KiB", "MiB", "GiB", "TiB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Format speed bits to human readable string
 */
function formatSpeed(bytesPerSecond: number): string {
    return `${formatBytes(bytesPerSecond)}/s`;
}

function formatEta(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/**
 * --- MODULAR PHASE HELPERS ---
 */

async function discoverManifest(config: PortalConfig, sourceRemote: string): Promise<string | null> {
    const localManifest = join(config.local_dir, "manifest.txt");
    const sourceFlags = (config.source_provider === "copyparty" && config.cookie) ? ["--header", config.cookie] : [];

    try {
        Logger.debug("SYNC", "Checking for remote manifest.txt...");
        await executeRclone([
            "copyto", `${sourceRemote}manifest.txt`, localManifest,
            ...sourceFlags,
            ...RETRY_FLAGS
        ], () => { });
        return localManifest;
    } catch {
        if (config.upsync_enabled && config.backup_provider !== "none") {
            const destRemote = `${Env.REMOTE_PORTAL_BACKUP}:/`;
            try {
                await executeRclone([
                    "copyto", `${destRemote}manifest.txt`, localManifest,
                    ...RETRY_FLAGS
                ], () => { });
                return localManifest;
            } catch { }
        }
    }
    return null;
}

function processManifest(localManifest: string, localDir: string): { remoteFiles: string[], initialLocalCount: number, missing: string[] } | null {
    try {
        const manifestContent = readFileSync(localManifest, "utf8");
        const remoteFiles = manifestContent.split("\n")
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith("#"));

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
        if (existsSync(localDir)) scan(localDir, "");

        return {
            remoteFiles,
            initialLocalCount: localFiles.size,
            missing: remoteFiles.filter(f => !localFiles.has(f))
        };
    } catch (err) {
        Logger.error("SYNC", "Failed to parse manifest.txt", err as Error);
        return null;
    }
}

/**
 * Main Sync Entry Point
 */
export async function runSync(
    config: PortalConfig,
    onProgress: (progress: Partial<SyncProgress>) => void
): Promise<void> {
    if (!config.local_dir) {
        onProgress({ phase: "error", description: "Portal not initialized.", percentage: 0 });
        return;
    }

    const showPull = config.source_provider !== "none" && config.source_provider !== "unconfigured";
    const showClean = config.enable_malware_shield;
    const showCloud = config.upsync_enabled && config.backup_provider !== "none" && config.backup_provider !== "unconfigured";

    const weights = { pull: showPull ? 45 : 0, clean: showClean ? 10 : 0, cloud: showCloud ? 45 : 0 };
    const totalWeight = weights.pull + weights.clean + weights.cloud;
    const scale = totalWeight > 0 ? 100 / totalWeight : 1;

    const wrapProgress = (p: Partial<SyncProgress>) => {
        const phase = p.phase || "pull";
        const phasePct = p.percentage || 0;
        let baseWeight = 0;
        if (phase === "clean") baseWeight = weights.pull;
        if (phase === "cloud") baseWeight = weights.pull + weights.clean;
        if (phase === "done") baseWeight = totalWeight;

        const currentPhaseWeight = weights[phase as keyof typeof weights] || 0;
        const globalPercentage = Math.min(100, Math.round((baseWeight + (phasePct * currentPhaseWeight / 100)) * scale));

        const full: SyncProgress = {
            ...currentProgress,
            ...p,
            phase: phase as SyncProgress["phase"],
            description: p.description || p.description || "",
            percentage: phasePct,
            globalPercentage
        };
        currentProgress = full;
        lastProgressRef.current = full;
        onProgress(full);
    };

    try {
        const excludeFile = Env.getExcludeFilePath();
        const sourceRemote = `${Env.REMOTE_PORTAL_SOURCE}:/`;

        // --- PULL PHASE ---
        if (showPull) {
            wrapProgress({ phase: "pull", description: "Analyzing Source...", percentage: 0 });
            const localManifest = await discoverManifest(config, sourceRemote);
            let manifestStats: ManifestStats | undefined;
            let initialLocalCount = 0;
            let riskyItems: string[] = [];
            let standardItems: string[] = [];

            if (localManifest) {
                const manifestData = processManifest(localManifest, config.local_dir);
                if (manifestData) {
                    initialLocalCount = manifestData.initialLocalCount;

                    // Gating logic: skip already excluded items
                    const alreadyExcluded = new Set<string>();
                    if (existsSync(excludeFile)) {
                        try {
                            const lines = readFileSync(excludeFile, "utf-8").split("\n");
                            lines.forEach(l => { if (l.trim()) alreadyExcluded.add(l.trim()); });
                        } catch (e) {
                            Logger.error("SYNC", "Failed to read exclude file", e);
                        }
                    }

                    const missingFiltered = manifestData.missing.filter(f => !alreadyExcluded.has(f));
                    riskyItems = missingFiltered.filter(f =>
                        GARBAGE_PATTERNS.some(p => f.toLowerCase().includes(p.toLowerCase()))
                    );
                    standardItems = missingFiltered.filter(f => !riskyItems.includes(f));

                    manifestStats = {
                        remoteFileCount: manifestData.remoteFiles.length,
                        localFileCount: initialLocalCount,
                        missingFileCount: missingFiltered.length,
                        riskyFileCount: riskyItems.length,
                        optimizationMode: "manifest",
                        manifestSource: "source"
                    };
                }
            }

            transferQueueType = "download";
            activeTransfers.clear();
            resetSessionCompletions();
            activeProgressCallback = wrapProgress;

            const basePullArgs = [
                config.strict_mirror ? "sync" : "copy", sourceRemote, config.local_dir,
                ...(config.source_provider === "copyparty" && config.cookie ? ["--header", config.cookie] : []),
                "--exclude-from", excludeFile,
                "--exclude", "_risk_tools/**",
                "--size-only", "--fast-list",
                "--transfers", String(config.downsync_transfers || 4),
                "--checkers", "16",
                ...RETRY_FLAGS
            ];

            // STAGE 1: Prioritized Pulll (Known Threats)
            if (riskyItems.length > 0) {
                const riskyListFile = join(config.local_dir, "prioritized_risky.txt");
                writeFileSync(riskyListFile, riskyItems.join("\n"));

                const riskyArgs = [
                    "copy", sourceRemote, config.local_dir, // Always use copy for partial sub-sync
                    "--files-from", riskyListFile,
                    ...basePullArgs.slice(3) // Skip sync/remote/local
                ];

                await executeRclone(riskyArgs, (stats) => {
                    wrapProgress({
                        phase: "pull",
                        description: `Shield: Neutralizing prioritized threats (${riskyItems.length})...`,
                        manifestStats,
                        filesTransferred: sessionCompletions.size,
                        isPaused: isSyncPaused,
                        ...stats,
                        percentage: Math.min(100, Math.round((sessionCompletions.size / (riskyItems.length + standardItems.length)) * 100))
                    });
                });

                // Immediate Shield Neutralization
                await runCleanupSweep(config.local_dir, excludeFile, config.malware_policy || "purge", (cStats) => {
                    wrapProgress({
                        phase: "pull",
                        description: `Shield: Neutralizing... ${cStats.flaggedArchives} threats purged.`,
                        manifestStats,
                        cleanupStats: cStats,
                        percentage: Math.min(100, Math.round((sessionCompletions.size / (riskyItems.length + standardItems.length)) * 100))
                    });
                });
            }

            // STAGE 2: Standard Pull
            const standardFilesCount = standardItems.length;
            const standardArgs = [...basePullArgs];
            if (standardFilesCount > 0) {
                const standardListFile = join(config.local_dir, "standard_missing.txt");
                writeFileSync(standardListFile, standardItems.join("\n"));
                standardArgs.push("--files-from", standardListFile);
            }

            await executeRclone(standardArgs, (stats) => {
                const completedCount = sessionCompletions.size;
                const totalMissing = riskyItems.length + standardItems.length;
                if (manifestStats) {
                    manifestStats.localFileCount = initialLocalCount + completedCount;
                    manifestStats.missingFileCount = Math.max(0, totalMissing - completedCount);
                }
                const displayPct = (totalMissing > 0) ? Math.min(100, Math.round((completedCount / totalMissing) * 100)) : (stats.percentage ?? 0);
                wrapProgress({
                    phase: "pull",
                    description: "Downloading files...",
                    manifestStats,
                    filesTransferred: completedCount,
                    isPaused: isSyncPaused,
                    ...stats,
                    percentage: displayPct
                });
            });
        }

        // --- CLEAN PHASE ---
        if (showClean) {
            wrapProgress({ phase: "clean", description: "Surgical Malware Shield...", percentage: 0 });
            await runCleanupSweep(config.local_dir, excludeFile, config.malware_policy || "purge", (stats) => {
                wrapProgress({
                    phase: "clean",
                    description: stats.currentArchive ? `Scanning ${stats.currentArchive}...` : "Scanning archives...",
                    percentage: stats.totalArchives > 0 ? Math.round((stats.scannedArchives / stats.totalArchives) * 100) : 0,
                    cleanupStats: stats
                });
            });
        }

        // --- CLOUD PHASE ---
        if (showCloud) {
            const destRemote = `${Env.REMOTE_PORTAL_BACKUP}:/`;
            const localManifest = join(config.local_dir, "manifest.txt");
            const cloudArgs = [
                "sync", config.local_dir, destRemote,
                "--exclude-from", excludeFile,
                "--exclude", "_risk_tools/**",
                "--size-only", "--fast-list",
                "--transfers", String(config.upsync_transfers || 4),
                "--checkers", "16",
                ...RETRY_FLAGS
            ];
            if (existsSync(localManifest)) cloudArgs.push("--files-from", localManifest);
            if (config.backup_provider === "gdrive") cloudArgs.push("--drive-use-trash=false");

            transferQueueType = "upload";
            activeTransfers.clear();
            await executeRclone(cloudArgs, (stats) => wrapProgress({
                phase: "cloud",
                description: "Cloud Backup...",
                isPaused: isSyncPaused,
                ...stats,
                percentage: stats.percentage ?? 0  // Set after spread to prevent overwrite
            }));
        }

        if (activeProgressCallback) {
            wrapProgress({ phase: "done", description: "MISSION ACCOMPLISHED. SYSTEM RESILIENT.", percentage: 100, isPaused: false });
        }

        // PERSISTENCE: Save final stats to config
        const finalStats = lastProgressRef.current;
        if (finalStats) {
            const updatedConfig = { ...config };

            // Sync Stats
            updatedConfig.last_sync_stats = {
                timestamp: Date.now(),
                files_processed: finalStats.filesTransferred || 0,
                bytes_transferred: parseInt(finalStats.bytesTransferred || "0"),
                status: "success" as const
            };

            // Shield Stats
            if (finalStats.cleanupStats) {
                updatedConfig.last_shield_stats = {
                    timestamp: Date.now(),
                    totalArchives: finalStats.cleanupStats.scannedArchives,
                    riskyPatternCount: finalStats.cleanupStats.riskyPatternCount,
                    extractedFiles: finalStats.cleanupStats.extractedFiles
                };
            }

            const { saveConfig } = await import("./config");
            saveConfig(updatedConfig);
        }
    } catch (err) {
        Logger.error("SYNC", "Sync failed", err);
        wrapProgress({ phase: "error", description: `Sync Failed: ${err instanceof Error ? err.message : String(err)}`, percentage: 0 });
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
            "--stats", "500ms",
            "--log-level", "INFO",
            "--use-json-log"
        ];

        const rcloneCmd = getRcloneCmd();
        const spawnArgs = rcloneCmd[0] === "bun" ? ["bun", ...rcloneCmd.slice(1), ...fullArgs] : ["rclone", ...fullArgs];
        Logger.debug("SYNC", `Spawning: ${spawnArgs.join(" ")}`);

        currentProc = spawn(spawnArgs, {
            stdout: "pipe",
            stderr: "pipe",
            env: process.env as Record<string, string>
        });

        if (isSyncPaused) {
            currentProc.kill("SIGSTOP");
            onUpdate({ isPaused: true });
        }

        const handleOutput = async (stream: ReadableStream) => {
            const reader = stream.getReader();
            const decoder = new TextDecoder();
            let remainder = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = remainder + decoder.decode(value);
                const lines = text.split(/[\r\n]+/);
                remainder = lines.pop() || "";

                for (const line of lines) {
                    const cleanedLine = stripAnsi(line).trim();
                    if (!cleanedLine) continue;

                    try {
                        const json = JSON.parse(cleanedLine);
                        // TEMPORARY: Log full JSON structure to diagnose queue issue
                        if (json.stats || json.msg?.toString().includes("Transferring:")) {
                            Logger.info("SYNC", `[DEBUG JSON] ${JSON.stringify(json)}`);
                        }
                        parseJsonLog(json, onUpdate);
                        if (json.msg) {
                            if (json.level === "error") Logger.error("SYNC", `[rclone] ${json.msg}`);
                            else if (json.level === "info") Logger.info("SYNC", `[rclone] ${json.msg}`);
                            else Logger.debug("SYNC", `[rclone] ${json.msg}`);
                        }
                    } catch {
                        Logger.info("SYNC", `[rclone] ${cleanedLine}`);
                    }
                }
            }
        };

        const stdoutDone = currentProc.stdout ? handleOutput(currentProc.stdout as unknown as ReadableStream) : Promise.resolve();
        const stderrDone = currentProc.stderr ? handleOutput(currentProc.stderr as unknown as ReadableStream) : Promise.resolve();

        const checkExit = async () => {
            const exitCode = await currentProc?.exited;
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
