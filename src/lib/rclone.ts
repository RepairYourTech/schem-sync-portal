import { existsSync } from "fs";
// Removed explicit 'bun' import to favor global Bun for better spyability in tests
import { Env } from "./env";
import { Logger } from "./logger";

/**
 * Gets the rclone command based on environment (MOCK_RCLONE support)
 */
function getRcloneCmd(): string[] {
    return process.env.MOCK_RCLONE
        ? ["bun", "run", process.env.MOCK_RCLONE]
        : ["rclone"];
}

/**
 * Generic function to create or update ANY rclone remote using the CLI.
 * This handles password obfuscation automatically.
 */
export function createRcloneRemote(name: string, type: string, options: Record<string, string>) {
    try {
        const rcloneConfig = Env.getRcloneConfigPath();

        // [ROBUST] Always attempt to remove the remote first to prevent duplicates.
        // Rclone 'config create' appends duplicates instead of overwriting, which 
        // causes the portal to use stale credentials.
        removePortalConfig([name]);

        const args = ["--config", rcloneConfig, "--non-interactive", "config", "create", name, type];
        for (const [key, value] of Object.entries(options)) {
            // Skip truly null/undefined values
            if (value === null || value === undefined) continue;

            // For token fields, preserve the JSON structure but trim whitespace
            // For other fields, sanitize newlines which can break rclone config
            let sanitizedValue: string;
            if (key === "token") {
                // Token is JSON - only trim outer whitespace, preserve internal structure
                sanitizedValue = value.trim();
            } else {
                // Other fields: remove newlines/CR which break rclone CLI parsing
                sanitizedValue = (value || "").replace(/[\r\n]+/g, " ").trim();
            }

            // Push even empty strings - rclone needs to know about the field
            // (e.g., empty team_drive is valid)
            args.push(key, sanitizedValue);
        }

        // Use non-interactive mode
        Logger.debug("CONFIG", `Executing: rclone config create ${name} ${type} ...`);

        const rcloneCmd = getRcloneCmd();
        const finalArgs = [...rcloneCmd.slice(1), ...args];

        console.log("DEBUG_RCLONE_ARGS:", JSON.stringify(finalArgs));

        // Use Bun.spawnSync for consistency and performance
        const result = Bun.spawnSync([rcloneCmd[0] as string, ...finalArgs], {
            stdout: "pipe",
            stderr: "pipe",
            env: process.env as Record<string, string>
        });

        if (!result.success) {
            const stderr = result.stderr?.toString() || "Unknown error";
            throw new Error(`rclone config failed: ${stderr}`);
        }

        Logger.info("CONFIG", `Successfully created rclone remote: ${name}`);

    } catch (err) {
        Logger.error("CONFIG", `Failed to create rclone remote: ${name}`, err);
    }
}

/**
 * Surgically updates or inserts a specific Google Drive remote in rclone.conf.
 * The token parameter should be the full OAuth token JSON from rclone authorize.
 */
export function updateGdriveRemote(name: string, clientId: string, secret: string, token: string) {
    // Validate token is valid JSON before passing to rclone
    try {
        const parsed = JSON.parse(token);
        if (!parsed.access_token && !parsed.refresh_token) {
            throw new Error("Token missing required fields (access_token or refresh_token)");
        }
        Logger.debug("CONFIG", "Token validation passed");
    } catch (err) {
        Logger.error("CONFIG", "Invalid OAuth token format", err);
        throw new Error(`Invalid OAuth token: ${err instanceof Error ? err.message : String(err)}`);
    }

    createRcloneRemote(name, "drive", {
        scope: "drive",
        client_id: clientId,
        client_secret: secret,
        token: token, // Use the full token JSON directly - rclone authorize returns complete token
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
        const rcloneCmd = getRcloneCmd();
        for (const name of remoteNames) {
            Logger.debug("CONFIG", `Surgically removing remote: ${name}`);
            const args = [...rcloneCmd.slice(1), "--config", rcloneConfig, "config", "delete", name];

            const result = Bun.spawnSync([rcloneCmd[0] as string, ...args], {
                stdout: "pipe", // Capture to log errors
                stderr: "pipe",
                env: process.env as Record<string, string>
            });

            if (!result.success) {
                const stderr = result.stderr?.toString() || "";
                // Only warn if it's not a "not found" error, or if we are debug mode 
                // (though rclone delete is usually silent on success)
                if (stderr.includes("section not found")) {
                    Logger.debug("CONFIG", `Remote ${name} not found (already clean)`);
                } else {
                    Logger.warn("CONFIG", `Failed to delete remote ${name}: ${stderr}`);
                }
            }
        }
        Logger.info("CONFIG", `Finished removing portal remotes: ${remoteNames.join(", ")}`);
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
 * Creates a standard WebDAV remote (used for CopyParty).
 */
export function createWebDavRemote(name: string, url: string, user?: string, pass?: string) {
    const opts: Record<string, string> = {
        url: url,
        vendor: "owncloud",
        pacer_min_sleep: "0.01ms"
    };

    if (user) opts.user = user;
    if (pass) opts.pass = pass;

    createRcloneRemote(name, "webdav", opts);
}

/**
 * Creates a standard HTTP remote (used for CopyParty Legacy).
 */
export function createHttpRemote(name: string, url: string, cookie?: string) {
    const opts: Record<string, string> = {
        url: url,
        no_head: "true"
    };

    if (cookie) {
        // Rclone HTTP backend handles headers as "Key: Value" or "Key,Value"
        opts.headers = cookie.startsWith("Cookie,") ? cookie : `Cookie,${cookie}`;
    }

    createRcloneRemote(name, "http", opts);
}

/**
 * Runs 'rclone authorize' asynchronously to capture the token.
 * This launches the user's browser for OAuth flows.
 * Supports custom OAuth credentials (clientId, clientSecret) for providers like Google Drive.
 * Supports AbortSignal for cancellation.
 */
export function authorizeRemote(
    provider: string,
    signal?: AbortSignal,
    clientId?: string,
    clientSecret?: string
): Promise<string> {
    return new Promise(async (resolve, reject) => {
        try {
            const rcloneCmd = getRcloneCmd();
            const rcloneConfig = Env.getRcloneConfigPath();

            // Build authorize command: rclone authorize <provider> [client_id] [client_secret]
            const args = [...rcloneCmd.slice(1), "--config", rcloneConfig, "authorize", provider];

            // Add custom OAuth credentials if provided (required for Google Drive, etc.)
            if (clientId && clientSecret) {
                args.push(clientId, clientSecret);
                Logger.debug("AUTH", `Executing: rclone authorize ${provider} <client_id> <client_secret>`);
            } else {
                Logger.debug("AUTH", `Executing: rclone authorize ${provider} (using built-in credentials)`);
            }

            const proc = Bun.spawn([rcloneCmd[0] as string, ...args], {
                stdout: "pipe",
                stderr: "pipe",
                env: process.env as Record<string, string>
            });

            if (signal) {
                signal.addEventListener("abort", () => {
                    Logger.info("AUTH", `Aborting rclone authorize for ${provider}...`);
                    proc.kill();
                    reject(new Error("ABORTED"));
                });
            }

            const stdoutPromise = new Response(proc.stdout).text();
            const stderrPromise = new Response(proc.stderr).text();

            const exitCode = await proc.exited;
            const stdout = await stdoutPromise;
            const stderr = await stderrPromise;

            if (exitCode !== 0) {
                // If aborted, the promise might have already rejected
                if (signal?.aborted) return;
                reject(new Error(stderr || `rclone authorize failed with exit code ${exitCode}`));
                return;
            }

            // rclone authorize outputs the token in stdout 
            // Format: "Paste the following into your remote machine --->\n{...token JSON...}\n<---End paste"
            const combined = stdout + "\n" + stderr;

            // Strategy 1: Try to find JSON block between markers (---> and <---)
            const markerMatch = combined.match(/--->(.*?)<---/s);
            if (markerMatch && markerMatch[1]) {
                const potentialJson = markerMatch[1].trim();
                try {
                    const parsed = JSON.parse(potentialJson) as Record<string, unknown>;
                    if (parsed.access_token || parsed.refresh_token || parsed.token_type) {
                        Logger.debug("AUTH", `Successfully extracted OAuth token via markers (${potentialJson.length} chars)`);
                        resolve(JSON.stringify(parsed));
                        return;
                    }
                } catch {
                    Logger.debug("AUTH", "Marker content is not valid JSON, trying other methods");
                }
            }

            // Strategy 2: Find all JSON objects using brace-matching parser
            const jsonObjects: { str: string, obj: Record<string, unknown> }[] = [];
            let depth = 0;
            let jsonStart = -1;

            for (let i = 0; i < combined.length; i++) {
                if (combined[i] === "{") {
                    if (depth === 0) jsonStart = i;
                    depth++;
                } else if (combined[i] === "}") {
                    depth--;
                    if (depth === 0 && jsonStart !== -1) {
                        const jsonStr = combined.substring(jsonStart, i + 1);
                        try {
                            const parsed = JSON.parse(jsonStr);
                            jsonObjects.push({ str: jsonStr, obj: parsed });
                        } catch {
                            // Not valid JSON, continue
                        }
                        jsonStart = -1;
                    }
                }
            }

            // Find the first valid OAuth token object
            for (const { str, obj } of jsonObjects) {
                if (obj.access_token || obj.refresh_token || obj.token_type) {
                    Logger.debug("AUTH", `Successfully extracted OAuth token via JSON parsing (${str.length} chars)`);
                    resolve(str);
                    return;
                }
            }

            // Strategy 3: Last resort - look for any JSON with token-like fields
            for (const { str, obj } of jsonObjects) {
                if (typeof obj === "object" && obj !== null && Object.keys(obj).length > 0) {
                    Logger.warn("AUTH", "Using best-guess JSON object as token");
                    resolve(str);
                    return;
                }
            }

            // If we get here, we truly couldn't find a token
            Logger.error("AUTH", "Failed to extract OAuth token from rclone output");
            Logger.error("AUTH", `stdout: ${stdout}`);
            Logger.error("AUTH", `stderr: ${stderr}`);
            reject(new Error("Could not extract OAuth token from rclone authorize output"));
        } catch (err) {
            reject(err instanceof Error ? err.message : String(err));
        }
    });
}
