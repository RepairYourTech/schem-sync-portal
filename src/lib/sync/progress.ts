import { formatSpeed, formatEta, formatBytes } from "./utils";
import type { FileTransferItem, SyncProgress } from "./types";

// Queue Tracking: Separate maps for parallel phases
const downloadTransfers = new Map<string, FileTransferItem>();
const uploadTransfers = new Map<string, FileTransferItem>();
const sessionCompletions = new Set<string>();

/**
 * Get a display queue for a specific map.
 */
function getQueueFromMap(map: Map<string, FileTransferItem>, limit = 10): FileTransferItem[] {
    const all = Array.from(map.values());
    const active = all.filter(t => t.status === "active");
    const completed = all
        .filter(t => t.status === "completed")
        .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
        .slice(0, 10);

    const now = Date.now();
    map.forEach((item, name) => {
        if (item.status === "completed" && item.completedAt && (now - item.completedAt > 60000)) {
            map.delete(name);
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
 * Core log parser for rclone --use-json-log
 */
export function parseJsonLog(
    json: unknown,
    onUpdate: (stats: Partial<SyncProgress>) => void,
    onFileComplete?: (filename: string) => void,
    type: "download" | "upload" = "download"
): void {
    const data = json as Record<string, unknown>;
    const targetMap = type === "download" ? downloadTransfers : uploadTransfers;

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
            const existing = targetMap.get(name);
            const status = percentage >= 100 ? "completed" : "active";

            if (status === "completed") {
                const alreadyDone = sessionCompletions.has(name);
                sessionCompletions.add(name);
                if (!alreadyDone && onFileComplete) onFileComplete(name);
            }

            targetMap.set(name, {
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
            const alreadyDone = sessionCompletions.has(name);
            sessionCompletions.add(name);
            if (!alreadyDone && onFileComplete) onFileComplete(name);

            // Ensure file is in the target map
            const existing = targetMap.get(name);
            if (!existing || existing.status !== "completed") {
                targetMap.set(name, {
                    filename: name,
                    size: existing?.size || 0,
                    transferred: existing?.size || 0,
                    percentage: 100,
                    speed: existing?.speed || "0 B/s",
                    status: "completed",
                    completedAt: Date.now()
                });
            }
            const update: Partial<SyncProgress> = {
                filesTransferred: sessionCompletions.size
            };
            if (type === "download") {
                update.downloadQueue = getQueueFromMap(downloadTransfers, 10);
            } else {
                update.uploadQueue = getQueueFromMap(uploadTransfers, 10);
            }
            onUpdate(update);
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
                    const existing = targetMap.get(name);
                    const status = filePercentage >= 100 ? "completed" : "active";

                    if (status === "completed") sessionCompletions.add(name);

                    targetMap.set(name, {
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

        const queue = getQueueFromMap(targetMap, 10);
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

        if (type === "download") {
            queueUpdate.downloadQueue = queue;
        } else {
            queueUpdate.uploadQueue = queue;
        }

        onUpdate(queueUpdate);
    } else if (data.msg === "Transferred" || data.objectType === "file" || (data.msg?.toString().includes("Transferring:") && !data.stats)) {
        const queue = getQueueFromMap(targetMap, 10);
        const queueUpdate: Partial<SyncProgress> = {
            filesTransferred: sessionCompletions.size
        };
        if (type === "download") {
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

export function resetSessionCompletions(): void {
    sessionCompletions.clear();
}

export function resetSessionState(): void {
    downloadTransfers.clear();
    uploadTransfers.clear();
    sessionCompletions.clear();
}

export function clearActiveTransfers(): void {
    downloadTransfers.clear();
    uploadTransfers.clear();
}
