import { spawn, type Subprocess } from "bun";
import { join } from "path";
import { existsSync } from "fs";
import type { PortalConfig } from "./config";
import { runCleanupSweep } from "./cleanup.ts";
import { Env } from "./env";
import { Logger } from "./logger";

export interface SyncProgress {
    phase: "pull" | "clean" | "cloud" | "done" | "error";
    description: string;
    percentage: number;
    transferSpeed?: string;
    eta?: string;
    filesTransferred?: number;
    totalFiles?: number;
    bytesTransferred?: string;
    errorCount?: number;
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

export async function runSync(
    config: PortalConfig,
    onProgress: (progress: SyncProgress) => void
): Promise<void> {
    if (!config.local_dir) {
        onProgress({ phase: "error", description: "Portal not initialized.", percentage: 0 });
        return;
    }

    try {
        const excludeFile = Env.getExcludeFilePath();

        // --- STEP 1: DOWNLOAD (PULL) ---
        onProgress({ phase: "pull", description: "Analyzing Source...", percentage: 0 });

        if (config.source_provider === "none") {
            onProgress({ phase: "error", description: "Source remote not configured.", percentage: 0 });
            return;
        }

        const sourceRemote = `${Env.REMOTE_PORTAL_SOURCE}:/`;
        let sourceFlags: string[] = [];

        // Special handling for CopyParty cookie if still used for porting
        if (config.source_provider === "copyparty" && config.cookie) {
            sourceFlags = ["--header", config.cookie];
        }

        // --- MANIFEST DISCOVERY ---
        // Attempt to pull manifest.txt from source to enable faster sync
        const localManifest = join(config.local_dir, "manifest.txt");
        try {
            Logger.debug("SYNC", "Checking for remote manifest.txt...");
            await executeRclone([
                "copyto", `${sourceRemote}manifest.txt`, localManifest,
                ...sourceFlags,
                ...RETRY_FLAGS
            ], () => { });
            Logger.info("SYNC", "Remote manifest.txt found at Source.");
        } catch {
            Logger.debug("SYNC", "No manifest.txt at Source, checking Backup...");
            // If not at source, check backup (if configured)
            if (config.upsync_enabled && config.backup_provider !== "none") {
                const destRemote = `${Env.REMOTE_PORTAL_BACKUP}:/`;
                try {
                    await executeRclone([
                        "copyto", `${destRemote}manifest.txt`, localManifest,
                        ...RETRY_FLAGS
                    ], () => { });
                    Logger.info("SYNC", "Remote manifest.txt found at Backup.");
                } catch {
                    Logger.debug("SYNC", "No manifest.txt at Backup either.");
                }
            }
        }

        const pullCmd = config.strict_mirror ? "sync" : "copy";
        const hasManifest = existsSync(localManifest);

        const pullArgs = [
            pullCmd, sourceRemote, config.local_dir,
            ...sourceFlags,
            "--exclude-from", excludeFile,
            "--exclude", "_risk_tools/**",
            "--size-only", "--fast-list", "--transfers", "4", "--checkers", "16",
            ...RETRY_FLAGS
        ];

        if (hasManifest) {
            Logger.info("SYNC", "Using manifest.txt for optimized Pull.");
            pullArgs.push("--files-from", localManifest);
        }

        onProgress({ phase: "pull", description: `Downloading from ${sourceRemote}...`, percentage: 0 });
        await executeRclone(pullArgs, (stats) => onProgress({
            phase: "pull",
            description: "Downloading...",
            percentage: stats.percentage ?? 0,
            ...stats
        }));


        // --- STEP 2: CLEAN (MALWARE SHIELD) ---
        if (config.enable_malware_shield) {
            onProgress({ phase: "clean", description: "Surgical Malware Shield...", percentage: 0 });
            await runCleanupSweep(config.local_dir, excludeFile, config.malware_policy || "purge");
            onProgress({ phase: "clean", description: "Cleanup complete.", percentage: 100 });
        }


        // --- STEP 3: UPLOAD (PUSH) ---
        if (config.upsync_enabled && config.backup_provider !== "none") {
            const destRemote = `${Env.REMOTE_PORTAL_BACKUP}:/`;

            onProgress({ phase: "cloud", description: `Backing up to ${destRemote}...`, percentage: 0 });

            const cloudArgs = [
                "sync", config.local_dir, destRemote,
                "--exclude", "_risk_tools/**",
                "--size-only", "--fast-list", "--transfers", "4", "--checkers", "16",
                ...RETRY_FLAGS
            ];

            if (hasManifest) {
                Logger.info("SYNC", "Using manifest.txt for optimized Push.");
                cloudArgs.push("--files-from", localManifest);
            }

            // GDrive specific flags (if dest is gdrive)
            if (config.backup_provider === "gdrive") {
                cloudArgs.push("--drive-use-trash=false");
            }

            await executeRclone(cloudArgs, (stats) => onProgress({
                phase: "cloud",
                description: "Cloud Backup...",
                percentage: stats.percentage ?? 0,
                ...stats
            }));
        }

        onProgress({ phase: "done", description: "MISSION ACCOMPLISHED. SYSTEM RESILIENT.", percentage: 100 });
    } catch (err: unknown) {
        const error = err as Error;
        Logger.error("SYNC", "Sync failed", error);
        onProgress({ phase: "error", description: `Sync Failed: ${error.message}`, percentage: 0 });
    }
}

async function executeRclone(
    args: string[],
    onUpdate: (stats: Partial<SyncProgress>) => void
): Promise<void> {
    return new Promise((resolve, reject) => {
        const fullArgs = [
            ...args,
            "-P",
            "--stats", "500ms",
            "--use-json-log",
            "--log-level", "INFO"
        ];

        Logger.debug("SYNC", `Executing: rclone ${fullArgs.join(" ")}`);

        const rcloneCmd = process.env.MOCK_RCLONE ? ["bun", process.env.MOCK_RCLONE] : ["rclone"];
        const finalCmd = [...rcloneCmd, ...fullArgs];
        Logger.debug("SYNC", `Spawning: ${finalCmd.join(" ")}`);

        currentProc = spawn(finalCmd, {
            stdout: "pipe",
            stderr: "pipe",
            env: process.env
        });

        const handleOutput = async (stream: ReadableStream, isError: boolean) => {
            const reader = stream.getReader();
            const decoder = new TextDecoder();
            let remainder = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = remainder + decoder.decode(value);
                const lines = text.split("\n");
                remainder = lines.pop() || "";

                for (const line of lines) {
                    if (isError) {
                        try {
                            const json = JSON.parse(line);
                            if (json.level === "error") {
                                Logger.error("SYNC", json.msg);
                            } else {
                                Logger.debug("SYNC", `[rclone] ${json.msg}`);
                            }
                        } catch {
                            Logger.verbose("SYNC", `[rclone stderr] ${line}`);
                        }
                    } else {
                        // Parse human-readable progress from stdout (-P)
                        parseProgress(line, onUpdate);
                    }
                }
            }
        };

        const stdoutDone = currentProc.stdout ? handleOutput(currentProc.stdout as unknown as ReadableStream, false) : Promise.resolve();
        const stderrDone = currentProc.stderr ? handleOutput(currentProc.stderr as unknown as ReadableStream, true) : Promise.resolve();

        const checkExit = async () => {
            const exitCode = await currentProc?.exited;
            Logger.debug("SYNC", `rclone exited with code ${exitCode}`);
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

function parseProgress(line: string, onUpdate: (stats: Partial<SyncProgress>) => void) {
    // Example: *        Transferred:   	   1.234 MiB / 1.234 MiB, 100%, 5.2 MiB/s, ETA 0s
    // Example: *        Transferred:   	         0 / 1, 0%
    const transferredMatch = line.match(/Transferred:\s+([\d.]+ \w+) \/ ([\d.]+ \w+), (\d+)%, ([\d.]+ \w+\/s), ETA ([\w\s]+)/);
    if (transferredMatch) {
        onUpdate({
            bytesTransferred: `${transferredMatch[1]}/${transferredMatch[2]}`,
            percentage: parseInt(transferredMatch[3]!),
            transferSpeed: transferredMatch[4],
            eta: transferredMatch[5]
        });
        return;
    }

    // Files: 1 / 1, 100%
    const filesMatch = line.match(/Files:\s+(\d+)\s+\/\s+(\d+),\s+(\d+)%/);
    if (filesMatch) {
        onUpdate({
            filesTransferred: parseInt(filesMatch[1]!),
            totalFiles: parseInt(filesMatch[2]!),
            percentage: parseInt(filesMatch[3]!)
        });
    }

    // Catch-all for simple percentage
    const percentMatch = line.match(/(\d+)%/);
    if (percentMatch) {
        onUpdate({ percentage: parseInt(percentMatch[1]!) });
    }
}

export function stopSync(): void {
    if (currentProc) {
        currentProc.kill();
        currentProc = null;
    }
}
