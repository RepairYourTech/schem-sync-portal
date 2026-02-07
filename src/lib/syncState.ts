import { join } from "path";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { Logger } from "./logger";
import { randomUUID } from "crypto";

/**
 * Represents the persisted state of a sync session.
 * Saved to config.local_dir/.sync_state.json for crash recovery.
 */
export interface SyncSessionState {
    sessionId: string;
    startedAt: number;
    lastUpdatedAt: number;

    // Phase statuses
    downsyncStatus: PhaseStatus;
    shieldStatus: PhaseStatus;
    upsyncStatus: PhaseStatus;

    // Downsync tracking
    downloadedFiles: string[];
    totalFilesToDownload: number;
    lastDownloadedIndex: number;

    // Shield tracking
    scannedArchives: string[];
    unscannedArchives: string[];
    totalArchives: number;
    flaggedArchives: string[];

    // Upsync tracking
    uploadedFiles: string[];
    totalFilesToUpload: number;
    lastUploadedIndex: number;

    // Error tracking
    errors: Array<{ phase: string; message: string; timestamp: number }>;
}

export type PhaseStatus = "idle" | "running" | "paused" | "complete" | "incomplete" | "error";

/**
 * Sync control signals for async abort/pause operations.
 */
export interface SyncController {
    signal: AbortSignal;
    abort: () => void;
    pause: () => void;
    resume: () => void;
    isPaused: () => boolean;
}

const STATE_FILENAME = ".sync_state.json";

/**
 * Create an empty sync session state with a unique ID.
 */
export function createEmptyState(): SyncSessionState {
    return {
        sessionId: `sync-${Date.now()}-${randomUUID().split("-")[0]}`,
        startedAt: Date.now(),
        lastUpdatedAt: Date.now(),

        downsyncStatus: "idle",
        shieldStatus: "idle",
        upsyncStatus: "idle",

        downloadedFiles: [],
        totalFilesToDownload: 0,
        lastDownloadedIndex: 0,

        scannedArchives: [],
        unscannedArchives: [],
        totalArchives: 0,
        flaggedArchives: [],

        uploadedFiles: [],
        totalFilesToUpload: 0,
        lastUploadedIndex: 0,

        errors: []
    };
}

/**
 * Load sync state from a directory.
 * Returns null if no state file exists or state is corrupted.
 */
export function loadSyncState(localDir: string): SyncSessionState | null {
    const statePath = join(localDir, STATE_FILENAME);
    try {
        if (existsSync(statePath)) {
            const data = readFileSync(statePath, "utf-8");
            const state = JSON.parse(data) as SyncSessionState;
            Logger.debug("SYNC", `Loaded sync state: session ${state.sessionId}`);
            return state;
        }
    } catch (err) {
        Logger.error("SYNC", "Failed to load sync state", err as Error);
    }
    return null;
}

/**
 * Save sync state to a directory.
 */
export function saveSyncState(localDir: string, state: SyncSessionState): void {
    const statePath = join(localDir, STATE_FILENAME);
    try {
        state.lastUpdatedAt = Date.now();
        const data = JSON.stringify(state, null, 2);
        writeFileSync(statePath, data, "utf-8");
        Logger.debug("SYNC", `Saved sync state: session ${state.sessionId}`);
    } catch (err) {
        Logger.error("SYNC", "Failed to save sync state", err as Error);
    }
}

/**
 * Clear sync state from a directory.
 */
export function clearSyncState(localDir: string): void {
    const statePath = join(localDir, STATE_FILENAME);
    try {
        if (existsSync(statePath)) {
            unlinkSync(statePath);
            Logger.debug("SYNC", "Cleared sync state");
        }
    } catch (err) {
        Logger.error("SYNC", "Failed to clear sync state", err as Error);
    }
}

/**
 * Check if a previous session is incomplete (needs resume or restart).
 */
export function hasIncompleteSession(localDir: string): boolean {
    const state = loadSyncState(localDir);
    if (!state) return false;

    return (
        state.downsyncStatus === "incomplete" ||
        state.downsyncStatus === "paused" ||
        state.shieldStatus === "incomplete" ||
        state.shieldStatus === "paused" ||
        state.upsyncStatus === "incomplete" ||
        state.upsyncStatus === "paused"
    );
}

/**
 * Create a sync controller with abort/pause capabilities.
 * Uses AbortController for async abort and a simple flag for pause.
 */
export function createSyncController(): SyncController {
    const abortController = new AbortController();
    let paused = false;
    let pauseResolver: (() => void) | null = null;

    return {
        signal: abortController.signal,

        abort: () => {
            abortController.abort();
            // If paused, also resolve the pause to unblock
            if (pauseResolver) {
                pauseResolver();
                pauseResolver = null;
            }
        },

        pause: () => {
            paused = true;
            Logger.info("SYNC", "Pause requested");
        },

        resume: () => {
            paused = false;
            if (pauseResolver) {
                pauseResolver();
                pauseResolver = null;
            }
            Logger.info("SYNC", "Resume requested");
        },

        isPaused: () => paused
    };
}

/**
 * Wait until pause is resolved or abort is signaled.
 * Use this at strategic points in sync loops to honor pause requests.
 */
export async function waitIfPaused(controller: SyncController): Promise<void> {
    if (controller.signal.aborted) {
        throw new Error("Sync aborted");
    }

    if (controller.isPaused()) {
        Logger.debug("SYNC", "Sync paused, waiting for resume...");
        await new Promise<void>((resolve) => {
            // Check periodically for resume or abort
            const check = () => {
                if (controller.signal.aborted || !controller.isPaused()) {
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });

        if (controller.signal.aborted) {
            throw new Error("Sync aborted");
        }
    }
}

/**
 * Determine if upsync is blocked (malware shield incomplete).
 */
export function isUpsyncBlocked(state: SyncSessionState): { blocked: boolean; reason?: string } {
    if (state.shieldStatus === "running") {
        return { blocked: true, reason: "Malware shield is currently scanning" };
    }
    if (state.shieldStatus === "paused") {
        return { blocked: true, reason: "Malware shield is paused. Resume scan before backup." };
    }
    if (state.shieldStatus === "incomplete") {
        return { blocked: true, reason: "Malware shield scan incomplete. Unscanned files cannot be uploaded." };
    }
    if (state.shieldStatus === "error") {
        return { blocked: true, reason: "Malware shield encountered an error. Re-run scan before backup." };
    }
    // Shield is idle, complete, or N/A
    return { blocked: false };
}

/**
 * Check if malware shield is mandatory for a given backup provider.
 */
export function isShieldMandatory(backupProvider: string): boolean {
    // Providers known to suspend accounts for malicious content
    const mandatoryProviders = ["gdrive"];
    return mandatoryProviders.includes(backupProvider);
}
