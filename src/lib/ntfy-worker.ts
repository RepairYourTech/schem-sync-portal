/**
 * ntfy Daemon Worker — Headless entry point for background sync.
 *
 * Runs as a standalone process (no TUI). Listens for ntfy notifications
 * and triggers runSync() with the latest portal config on each message.
 *
 * Launched by the platform-native service (systemd/launchd/startup).
 */
import { loadConfig } from "./config";
import { createNtfyListener } from "./ntfy";
import { runSync } from "./sync";
import { Logger } from "./logger";

Logger.info("DAEMON", "ntfy worker starting...");

const config = loadConfig();

if (!config.ntfy_url) {
    Logger.error("DAEMON", "No ntfy_url configured. Exiting.");
    process.exit(1);
}

let syncing = false;
let lastSyncFailed = false;
let consecutiveFailures = 0;

/**
 * Exit non-zero after this many failures in a row so the supervising service
 * (systemd `Restart=on-failure`) notices. A single failure is not fatal.
 */
const MAX_CONSECUTIVE_FAILURES = 5;

const listener = createNtfyListener(
    config.ntfy_url,
    async (message) => {
        if (syncing) {
            Logger.info("DAEMON", "Sync already in progress, skipping trigger.");
            return;
        }

        Logger.info("DAEMON", `Received notification: ${message}`);
        syncing = true;
        lastSyncFailed = false;

        try {
            const freshConfig = loadConfig();
            // runSync reports failure by returning, not by throwing: a catch block alone
            // would log "completed successfully" for every failed run.
            const outcome = await runSync(freshConfig, (progress) => {
                Logger.debug("DAEMON", `[${progress.phase}] ${progress.description || ""}`);
            });

            switch (outcome.status) {
                case "success":
                    lastSyncFailed = false;
                    Logger.info("DAEMON", "Sync completed successfully.");
                    break;
                case "partial":
                    lastSyncFailed = true;
                    Logger.warn("DAEMON", `Sync completed with issues: ${outcome.error ?? "see log"}`);
                    break;
                case "stopped":
                    Logger.info("DAEMON", "Sync stopped before completion.");
                    break;
                case "error":
                    lastSyncFailed = true;
                    Logger.error("DAEMON", `Sync failed: ${outcome.error ?? "unknown error"}`);
                    break;
            }
        } catch (err) {
            lastSyncFailed = true;
            Logger.error("DAEMON", "Sync threw an unexpected error", err);
        } finally {
            syncing = false;

            consecutiveFailures = lastSyncFailed ? consecutiveFailures + 1 : 0;
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                Logger.error("DAEMON", `${consecutiveFailures} consecutive sync failures; exiting non-zero for the service supervisor.`);
                listener.stop();
                process.exit(1);
            }
        }
    },
    (status) => {
        Logger.info("DAEMON", `ntfy status: ${status}`);
    }
);

function shutdown() {
    Logger.info("DAEMON", "Shutting down...");
    listener.stop();
    process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
