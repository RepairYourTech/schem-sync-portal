import { spawn, type Subprocess } from "bun";
import { Env } from "../env";
import { Logger } from "../logger";
import { parseJsonLog } from "./progress";
import type { SyncProgress } from "./types";

/**
 * Core utility functions for the sync engine.
 */

const activeProcs = new Set<Subprocess>();
let currentSessionId: string | null = null;

export function startNewSession(): string {
    currentSessionId = `session_${Date.now()}`;
    return currentSessionId;
}

export function getCurrentSessionId(): string | null {
    return currentSessionId;
}

export function isNewSession(sessionId: string): boolean {
    return sessionId !== currentSessionId;
}

// Per-phase process tracking for independent pause control
const phaseProcesses: { pull: Set<Subprocess>, shield: Set<Subprocess>, cloud: Set<Subprocess> } = {
    pull: new Set(),
    shield: new Set(),
    cloud: new Set()
};

// Per-phase pause state
const pauseState = { pull: false, shield: false, cloud: false };

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
export function formatBytes(number: number): string {
    if (number === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KiB", "MiB", "GiB", "TiB"];
    const i = Math.floor(Math.log(number) / Math.log(k));
    return parseFloat((number / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
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
 * Check if shield phase is blocking upsync.
 * Returns true if shield is paused, which should block cloud phase.
 */
export function isShieldBlocking(): boolean {
    return pauseState.shield;
}

/**
 * Get processes belonging to a specific phase.
 */
export function getPhaseProcesses(phase: 'pull' | 'shield' | 'cloud'): Set<Subprocess> {
    return phaseProcesses[phase];
}

/**
 * Executes an rclone command and streams JSON logs to the update callback.
 * Now supports an optional onFileComplete callback for streaming upsync.
 *
 * @param phase - Optional phase identifier for per-phase pause control
 */
export async function executeRclone(
    args: string[],
    onUpdate: (stats: Partial<SyncProgress>) => void,
    onFileComplete?: (filename: string) => void,
    type: "download" | "upload" = "download",
    phase?: 'pull' | 'shield' | 'cloud'
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

        const proc = spawn(spawnArgs, {
            stdout: "pipe",
            stderr: "pipe",
            env: process.env as Record<string, string>
        });

        activeProcs.add(proc);

        // Track process by phase if specified
        if (phase) {
            phaseProcesses[phase].add(proc);
        }

        // Check pause state for this specific phase or global
        const phasePaused = phase ? pauseState[phase] : (pauseState.pull || pauseState.shield || pauseState.cloud);
        if (phasePaused) {
            proc.kill("SIGSTOP");
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
                        await parseJsonLog(json, onUpdate, onFileComplete, type);
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

        const stdoutDone = proc.stdout ? handleOutput(proc.stdout as unknown as ReadableStream) : Promise.resolve();
        const stderrDone = proc.stderr ? handleOutput(proc.stderr as unknown as ReadableStream) : Promise.resolve();

        const checkExit = async () => {
            const exitCode = await proc.exited;
            activeProcs.delete(proc);
            // Remove from phase tracking if tagged
            if (phase) {
                phaseProcesses[phase].delete(proc);
            }
            await Promise.all([stdoutDone, stderrDone]);
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

export function getIsSyncPaused(phase?: 'pull' | 'shield' | 'cloud'): boolean {
    if (phase) {
        return pauseState[phase];
    }
    // Global check: return true if any phase is paused
    return pauseState.pull || pauseState.shield || pauseState.cloud;
}

export function stopSync(): void {
    for (const proc of activeProcs) {
        proc.kill();
    }
    activeProcs.clear();
    // Clear phase tracking
    phaseProcesses.pull.clear();
    phaseProcesses.shield.clear();
    phaseProcesses.cloud.clear();
}

export function pauseSync(onUpdate?: (p: Partial<SyncProgress>) => void, phase?: 'pull' | 'shield' | 'cloud'): void {
    if (phase) {
        // Pause specific phase
        if (!pauseState[phase] && phaseProcesses[phase].size > 0) {
            for (const proc of phaseProcesses[phase]) {
                proc.kill("SIGSTOP");
            }
            pauseState[phase] = true;
            Logger.info("SYNC", `${phase.toUpperCase()} phase paused: ${phaseProcesses[phase].size} processes`);
            if (onUpdate) onUpdate({ isPaused: true });
        }
    } else {
        // Global pause: pause all active phases
        if (activeProcs.size > 0) {
            for (const proc of activeProcs) {
                proc.kill("SIGSTOP");
            }
            pauseState.pull = true;
            pauseState.shield = true;
            pauseState.cloud = true;
            Logger.info("SYNC", `All phases paused: ${activeProcs.size} processes`);
            if (onUpdate) onUpdate({ isPaused: true });
        }
    }
}

export function resumeSync(onUpdate?: (p: Partial<SyncProgress>) => void, phase?: 'pull' | 'shield' | 'cloud'): void {
    if (phase) {
        // Resume specific phase
        if (pauseState[phase]) {
            for (const proc of phaseProcesses[phase]) {
                proc.kill("SIGCONT");
            }
            pauseState[phase] = false;
            Logger.info("SYNC", `${phase.toUpperCase()} phase resumed: ${phaseProcesses[phase].size} processes`);
            if (onUpdate) onUpdate({ isPaused: false });
        }
    } else {
        // Global resume: resume all phases
        if (pauseState.pull || pauseState.shield || pauseState.cloud) {
            for (const proc of activeProcs) {
                proc.kill("SIGCONT");
            }
            pauseState.pull = false;
            pauseState.shield = false;
            pauseState.cloud = false;
            Logger.info("SYNC", "All phases resumed");
            if (onUpdate) onUpdate({ isPaused: false });
        }
    }
}

export function resetExecutorState(): void {
    pauseState.pull = false;
    pauseState.shield = false;
    pauseState.cloud = false;
    activeProcs.clear();
    phaseProcesses.pull.clear();
    phaseProcesses.shield.clear();
    phaseProcesses.cloud.clear();
}
