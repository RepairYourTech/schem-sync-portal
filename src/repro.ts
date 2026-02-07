
import { createRcloneRemote } from "./lib/rclone";
import { Env } from "./lib/env";
import { Logger } from "./lib/logger";

Logger.setConsoleEnabled(true);
Logger.setLevel("DEBUG");

console.log("Rclone Config Path:", Env.getRcloneConfigPath());

try {
    createRcloneRemote("test_repro_remote", "drive", {
        scope: "drive",
        config_is_local: "false"
    });
} catch (e) {
    console.error("Caught error:", e);
}
