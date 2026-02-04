import { formatSpeed, formatEta, formatBytes } from "./utils";
import type { FileTransferItem, SyncProgress } from "./types";

// Track active file transfers for queue display
const activeTransfers: Map<string, FileTransferItem> = new Map();
let transferQueueType: "download" | "upload" = "download";

// Deep Session Tracking
const sessionCompletions = new Set<string>();

/**
 * Reset the session completion tracker.
 */
export function resetSessionCompletions(): void {
    sessionCompletions.clear();
}

/**
 * Sets the current transfer queue type (download or upload).
 */
export function setTransferQueueType(type: "download" | "upload"): void {
    transferQueueType = type;
}

/**
 * Get the current display queue with a limit on completed transfers.
 */
export function getDisplayQueue(limit = 10): FileTransferItem[] {
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
 * Resets internal session state.
 */
export function resetSessionState(): void {
    sessionCompletions.clear();
    activeTransfers.clear();
}

/**
 * Parse rclone JSON log entry for transfer statistics.
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

        // Fallback parsing from msg string
        if (msgStr.includes("Transferring:") && percentage === 0) {
            const parts = msgStr.split(":");
            if (parts.length >= 3 && parts[2]) {
                const pctPart = parts[2].trim().split("%")[0];
                if (pctPart && !isNaN(parseInt(pctPart))) {
                    percentage = parseInt(pctPart);
                }
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

        const queue = getDisplayQueue(10);
        const bytes = (stats?.bytes as number) || 0;
        const total = (stats?.totalBytes as number) || 0;

        const queueUpdate: Partial<SyncProgress> = {
            percentage: percentage ?? undefined,
            transferSpeed: speed ? formatSpeed(speed) : undefined,
            eta: eta ? formatEta(eta) : undefined,
            bytesTransferred: total > 0 ? `${formatBytes(bytes)}/${formatBytes(total)}` : undefined,
            rawBytesTransferred: bytes,
            rawTotalBytes: total,
            filesTransferred: sessionCompletions.size,
            transferSlots: { active: queue.filter(t => t.status === "active").length, total: 8 },
        };


        if (transferQueueType === "download") {
            queueUpdate.downloadQueue = queue;
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

export function getSessionCompletionsSize(): number {
    return sessionCompletions.size;
}

export function getActiveTransfersSize(): number {
    return activeTransfers.size;
}

export function clearActiveTransfers(): void {
    activeTransfers.clear();
}
