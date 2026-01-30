import { execFile } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { spawnSync } from "bun";
import { Env } from "./env";
import { Logger } from "./logger";

/**
 * Generic function to create or update ANY rclone remote using the CLI.
 * This handles password obfuscation automatically.
 */
export function createRcloneRemote(name: string, type: string, options: Record<string, string>) {
    try {
        const args = ["config", "create", name, type];
        for (const [key, value] of Object.entries(options)) {
            // Skip empty values to avoid confusing rclone
            if (value && value.trim() !== "") {
                args.push(key, value);
            }
        }

        // Use non-interactive mode
        Logger.debug("CONFIG", `Executing: rclone config create ${name} ${type} ...`);

        const rcloneCmd = process.env.MOCK_RCLONE
            ? ["bun", "run", process.env.MOCK_RCLONE as string]
            : ["rclone"];
        const finalArgs = [...rcloneCmd.slice(1), ...args] as string[]; // Skip 'bun' if using bun run, or handle appropriately

        // Use Bun.spawnSync for consistency and performance
        const result = spawnSync([rcloneCmd[0] as string, ...finalArgs], {
            stdout: "ignore",
            stderr: "ignore",
            env: process.env as Record<string, string>
        });

        if (!result.success) {
            throw new Error(`rclone config failed with exit code ${result.exitCode}`);
        }

        Logger.info("CONFIG", `Successfully created rclone remote: ${name}`);

    } catch (err) {
        Logger.error("CONFIG", `Failed to create rclone remote: ${name}`, err);
    }
}

/**
 * Surgically updates or inserts a specific Google Drive remote in rclone.conf.
 */
export function updateGdriveRemote(name: string, clientId: string, secret: string, refreshToken: string) {
    createRcloneRemote(name, "drive", {
        scope: "drive",
        client_id: clientId,
        client_secret: secret,
        token: `{"refresh_token":"${refreshToken}"}`,
        team_drive: ""
    });
}

/**
 * Surgically removes specific portal remotes from rclone.conf.
 * This ensures that other remotes (like your OS backup storage) remain UNTOUCHED.
 */
export function removePortalConfig(remoteNames: string[]) {
    const rcloneConfig = Env.getRcloneConfigPath();

    if (!existsSync(rcloneConfig)) return;

    try {
        const content = readFileSync(rcloneConfig, "utf8");
        const lines = content.split(/\r?\n/);
        const filteredLines: string[] = [];
        let currentSection: string | null = null;
        let isRemoving = false;

        for (const line of lines) {
            const trimmed = line.trim();
            const headerMatch = trimmed.match(/^\[([^\]]+)\]/);

            if (headerMatch) {
                currentSection = headerMatch[1]!;
                isRemoving = remoteNames.includes(currentSection);
            }

            if (!isRemoving) {
                filteredLines.push(line);
            }
        }

        // Clean up trailing/leading newlines to keep it tidy
        writeFileSync(rcloneConfig, filteredLines.join("\n").trim() + "\n");
        Logger.info("CONFIG", `Removed portal remotes: ${remoteNames.join(", ")}`);
    } catch (err) {
        Logger.error("CONFIG", "Failed to remove portal config", err);
    }
}

/**
 * LEGACY/HELPER: For removing the [schematics_source] http remote.
 */
export function removeLegacySource() {
    removePortalConfig([Env.REMOTE_LEGACY_SOURCE]);
}

/**
 * Updates a generic rclone remote with a given token blob.
 */
export function updateGenericRemote(name: string, type: string, extraOptions: Record<string, string>) {
    createRcloneRemote(name, type, extraOptions);
}

/**
 * Creates a standard HTTP remote (used for CopyParty).
 */
export function createHttpRemote(name: string, url: string, cookie?: string) {
    const opts: Record<string, string> = {
        url: url,
        no_head: "true"
    };

    if (cookie) {
        opts.headers = `Cookie,${cookie}`;
    }

    createRcloneRemote(name, "http", opts);
}

/**
 * Runs 'rclone authorize' asynchronously to capture the token.
 * This launches the user's browser for OAuth flows.
 */
export function authorizeRemote(provider: string): Promise<string> {
    return new Promise((resolve, reject) => {
        // rclone authorize <provider>
        // It outputs the JSON to stdout when finished.
        execFile("rclone", ["authorize", provider], (error, stdout, stderr) => {
            if (error) {
                // If user closed browser or timed out
                reject(stderr || error.message);
                return;
            }
            // stdout contains the token JSON (sometimes surrounded by text, but usually just the block at the end)
            // We'll return the whole stdout, caller can try to parse or just store it.
            // Rclone usually prints: "Paste the following into your remote machine > ... {json} ... <"
            // OR if strictly local, it just prints the JSON.
            // Let's return stdout and let caller handle.
            resolve(stdout.trim());
        });
    });
}
