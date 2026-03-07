import { Logger } from "./logger";

export type NtfyStatus = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

export interface NtfyListener {
    stop: () => void;
    status: () => NtfyStatus;
}

interface NtfyMessage {
    event?: string;
    message?: string;
    title?: string;
    time?: number;
}

const MIN_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60000;
const BACKOFF_MULTIPLIER = 2;

/**
 * Creates a persistent SSE listener for an ntfy topic.
 * Auto-reconnects with exponential backoff on failure.
 * Uses Bun's fetch streaming — cross-platform, zero native deps.
 */
export function createNtfyListener(
    topicUrl: string,
    onNotification: (message: string) => void,
    onStatusChange: (status: NtfyStatus) => void
): NtfyListener {
    let currentStatus: NtfyStatus = "disconnected";
    let abortController = new AbortController();
    let backoffMs = MIN_BACKOFF_MS;
    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function setStatus(status: NtfyStatus) {
        currentStatus = status;
        onStatusChange(status);
    }

    function normalizeUrl(url: string): string {
        const base = url.replace(/\/+$/, "");
        return `${base}/json`;
    }

    async function connect() {
        if (stopped) return;

        setStatus("connecting");
        Logger.info("NTFY", `Connecting to ${topicUrl}`);

        try {
            const response = await fetch(normalizeUrl(topicUrl), {
                signal: abortController.signal,
                headers: { "Accept": "application/x-ndjson" }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            if (!response.body) {
                throw new Error("No response body (streaming not supported)");
            }

            setStatus("connected");
            backoffMs = MIN_BACKOFF_MS;
            Logger.info("NTFY", "Connected successfully");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (!stopped) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;

                    try {
                        const msg = JSON.parse(trimmed) as NtfyMessage;

                        if (msg.event === "open" || msg.event === "keepalive") {
                            Logger.debug("NTFY", `Received ${msg.event} event`);
                            continue;
                        }

                        if (msg.event === "message" && msg.message) {
                            Logger.info("NTFY", `Notification: ${msg.message}`);
                            onNotification(msg.message);
                        }
                    } catch {
                        Logger.debug("NTFY", `Skipping non-JSON line: ${trimmed.substring(0, 80)}`);
                    }
                }
            }

            if (!stopped) {
                Logger.warn("NTFY", "Stream ended unexpectedly, reconnecting...");
                scheduleReconnect();
            }
        } catch (err) {
            if (stopped || abortController.signal.aborted) return;

            const message = err instanceof Error ? err.message : String(err);
            Logger.error("NTFY", `Connection failed: ${message}`);
            setStatus("error");
            scheduleReconnect();
        }
    }

    function scheduleReconnect() {
        if (stopped) return;

        setStatus("reconnecting");
        Logger.info("NTFY", `Reconnecting in ${backoffMs}ms...`);

        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            abortController = new AbortController();
            backoffMs = Math.min(backoffMs * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);
            connect();
        }, backoffMs);
    }

    connect();

    return {
        stop: () => {
            stopped = true;
            abortController.abort();
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            setStatus("disconnected");
            Logger.info("NTFY", "Listener stopped");
        },
        status: () => currentStatus
    };
}
