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

const listener = createNtfyListener(
    config.ntfy_url,
    async (message) => {
        if (syncing) {
            Logger.info("DAEMON", "Sync already in progress, skipping trigger.");
            return;
        }

        Logger.info("DAEMON", `Received notification: ${message}`);
        syncing = true;

        try {
            const freshConfig = loadConfig();
            await runSync(freshConfig, (progress) => {
                Logger.debug("DAEMON", `[${progress.phase}] ${progress.description || ""}`);
            });
            Logger.info("DAEMON", "Sync completed successfully.");
        } catch (err) {
            Logger.error("DAEMON", "Sync failed", err);
        } finally {
            syncing = false;
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
