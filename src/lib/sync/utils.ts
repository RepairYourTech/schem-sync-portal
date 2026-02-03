import { spawn, type Subprocess } from "bun";
import { Env } from "../env";
import { Logger } from "../logger";
import { parseJsonLog } from "./progress";
import type { SyncProgress } from "./types";

/**
 * Core utility functions for the sync engine.
 */

let currentProc: Subprocess | null = null;
let isSyncPaused = false;

/**
 * Helper to strip ANSI codes and control characters.
 */
export function stripAnsi(str: string): string {
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
}

/**
 * Gets the rclone command based on environment (MOCK_RCLONE support).
 */
export function getRcloneCmd(): string[] {
    return process.env.MOCK_RCLONE
        ? ["bun", "run", process.env.MOCK_RCLONE]
        : ["rclone"];
}

/**
 * Format bytes to human readable string.
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KiB", "MiB", "GiB", "TiB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Format speed bits to human readable string.
 */
export function formatSpeed(bytesPerSecond: number): string {
    return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * Format seconds to human readable duration.
 */
export function formatEta(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export const RETRY_FLAGS = [
    "--retries", "4",
    "--retries-sleep", "10s",
    "--low-level-retries", "10",
    "--contimeout", "10s",
    "--timeout", "10s",
    "--ignore-errors"
];

/**
 * Executes an rclone command and streams JSON logs to the update callback.
 */
export async function executeRclone(
    args: string[],
    onUpdate: (stats: Partial<SyncProgress>) => void
): Promise<void> {
    return new Promise((resolve, reject) => {
        const fullArgs = [
            "--config", Env.getRcloneConfigPath(),
            ...args,
            "--stats", "500ms",
            "--log-level", "INFO",
            "--use-json-log"
        ];

        const rcloneCmd = getRcloneCmd();
        const spawnArgs = rcloneCmd[0] === "bun" ? ["bun", ...rcloneCmd.slice(1), ...fullArgs] : ["rclone", ...fullArgs];
        Logger.debug("SYNC", `Spawning: ${spawnArgs.join(" ")}`);

        currentProc = spawn(spawnArgs, {
            stdout: "pipe",
            stderr: "pipe",
            env: process.env as Record<string, string>
        });

        if (isSyncPaused) {
            currentProc.kill("SIGSTOP");
            onUpdate({ isPaused: true });
        }

        const handleOutput = async (stream: ReadableStream) => {
            const reader = stream.getReader();
            const decoder = new TextDecoder();
            let remainder = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = remainder + decoder.decode(value);
                const lines = text.split(/[\r\n]+/);
                remainder = lines.pop() || "";

                for (const line of lines) {
                    const cleanedLine = stripAnsi(line).trim();
                    if (!cleanedLine) continue;

                    try {
                        const json = JSON.parse(cleanedLine);
                        parseJsonLog(json, onUpdate);
                        if (json.msg) {
                            if (json.level === "error") Logger.error("SYNC", `[rclone] ${json.msg}`);
                            else if (json.level === "info") Logger.info("SYNC", `[rclone] ${json.msg}`);
                            else Logger.debug("SYNC", `[rclone] ${json.msg}`);
                        }
                    } catch {
                        Logger.info("SYNC", `[rclone] ${cleanedLine}`);
                    }
                }
            }
        };

        const stdoutDone = currentProc.stdout ? handleOutput(currentProc.stdout as unknown as ReadableStream) : Promise.resolve();
        const stderrDone = currentProc.stderr ? handleOutput(currentProc.stderr as unknown as ReadableStream) : Promise.resolve();

        const checkExit = async () => {
            const exitCode = await currentProc?.exited;
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

export function getIsSyncPaused(): boolean {
    return isSyncPaused;
}

export function stopSync(): void {
    if (currentProc) {
        currentProc.kill();
        currentProc = null;
    }
}

export function pauseSync(onUpdate?: (p: Partial<SyncProgress>) => void): void {
    if (currentProc && !isSyncPaused) {
        currentProc.kill("SIGSTOP");
        isSyncPaused = true;
        Logger.info("SYNC", "Sync process paused (SIGSTOP)");
        if (onUpdate) onUpdate({ isPaused: true });
    }
}

export function resumeSync(onUpdate?: (p: Partial<SyncProgress>) => void): void {
    if (currentProc && isSyncPaused) {
        currentProc.kill("SIGCONT");
        isSyncPaused = false;
        Logger.info("SYNC", "Sync process resumed (SIGCONT)");
        if (onUpdate) onUpdate({ isPaused: false });
    }
}

export function resetExecutorState(): void {
    isSyncPaused = false;
}
