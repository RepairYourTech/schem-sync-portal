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
    id?: string;
}

const POLL_INTERVAL_MS = 15000;
const ERROR_BACKOFF_MS = 30000;
const MAX_ERROR_BACKOFF_MS = 120000;

/**
 * Creates a polling-based ntfy listener.
 * Uses `?poll=1&since=<timestamp>` for Cloudflare compatibility.
 * SSE streaming doesn't work through Cloudflare's proxy (response buffering),
 * so we poll at regular intervals instead.
 */
export function createNtfyListener(
    topicUrl: string,
    onNotification: (message: string) => void,
    onStatusChange: (status: NtfyStatus) => void
): NtfyListener {
    let currentStatus: NtfyStatus = "disconnected";
    let stopped = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let lastMessageTime = Math.floor(Date.now() / 1000);
    let consecutiveErrors = 0;

    function setStatus(status: NtfyStatus) {
        if (currentStatus !== status) {
            currentStatus = status;
            onStatusChange(status);
        }
    }

    function normalizeUrl(url: string): string {
        return url.replace(/\/+$/, "");
    }

    async function poll() {
        if (stopped) return;

        const isFirstPoll = currentStatus === "disconnected" || currentStatus === "connecting";
        if (isFirstPoll) setStatus("connecting");

        try {
            const url = `${normalizeUrl(topicUrl)}/json?poll=1&since=${lastMessageTime}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(url, {
                signal: controller.signal,
                headers: { "Accept": "application/x-ndjson" }
            });
            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const body = await response.text();
            const lines = body.split("\n").filter(l => l.trim());

            setStatus("connected");
            consecutiveErrors = 0;

            for (const line of lines) {
                try {
                    const msg = JSON.parse(line) as NtfyMessage;

                    if (msg.time && msg.time > lastMessageTime) {
                        lastMessageTime = msg.time;
                    }

                    if (msg.event === "open" || msg.event === "keepalive") {
                        continue;
                    }

                    if (msg.event === "message" && msg.message) {
                        Logger.info("NTFY", `Notification: ${msg.message}`);
                        onNotification(msg.message);
                    }
                } catch {
                    Logger.debug("NTFY", `Skipping non-JSON line: ${line.substring(0, 80)}`);
                }
            }

            schedulePoll(POLL_INTERVAL_MS);
        } catch (err) {
            if (stopped) return;

            consecutiveErrors++;
            const message = err instanceof Error ? err.message : String(err);
            Logger.error("NTFY", `Poll failed: ${message}`);

            if (consecutiveErrors >= 3) {
                setStatus("error");
            } else {
                setStatus("reconnecting");
            }

            const backoff = Math.min(ERROR_BACKOFF_MS * consecutiveErrors, MAX_ERROR_BACKOFF_MS);
            Logger.info("NTFY", `Retrying in ${backoff / 1000}s (attempt ${consecutiveErrors})`);
            schedulePoll(backoff);
        }
    }

    function schedulePoll(delayMs: number) {
        if (stopped) return;
        pollTimer = setTimeout(() => {
            pollTimer = null;
            poll();
        }, delayMs);
    }

    Logger.info("NTFY", `Starting poll listener for ${topicUrl} (every ${POLL_INTERVAL_MS / 1000}s)`);
    poll();

    return {
        stop: () => {
            stopped = true;
            if (pollTimer) {
                clearTimeout(pollTimer);
                pollTimer = null;
            }
            setStatus("disconnected");
            Logger.info("NTFY", "Listener stopped");
        },
        status: () => currentStatus
    };
}
