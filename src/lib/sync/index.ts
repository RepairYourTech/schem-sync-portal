import { Logger } from "../logger";
import { saveConfig } from "../config";
import type { PortalConfig } from "../config";
import type { SyncProgress, CleanupStats } from "./types";
import { runPullPhase } from "./pullPhase";
// cleanPhase removed - now integrated into pullPhase final sweep
import { runManifestCloudPhase } from "./cloudPhase";
import { resetSessionState, resetSessionCompletions, parseJsonLog } from "./progress";
import { runCleanupSweep } from "../cleanup";
import { Env } from "../env";
import { ShieldManager } from "../shield/ShieldManager";
import { loadSyncState, createEmptyState, saveSyncState } from "../syncState";

import {
    stopSync,
    pauseSync,
    resumeSync,
    getIsSyncPaused,
    resetExecutorState,
    resetStopSignal,
    startNewSession,
    setSessionId,
    getCurrentSessionId,
    isNewSession,
    isStopRequested
} from "./utils";

export * from "./types";
export {
    stopSync,
    pauseSync,
    resumeSync,
    getIsSyncPaused,
    getCurrentSessionId
};

export { resetSessionCompletions, resetSessionState, parseJsonLog };



let currentProgress: SyncProgress = { phase: "done", description: "Ready to sync.", percentage: 0 };
let lastProgressRef: { current: SyncProgress | null } = { current: null };

/**
 * Reset all ephemeral session state.
 */
export function clearSyncSession(): void {
    resetSessionState();
    resetExecutorState();
    currentProgress = { phase: "done", description: "Ready to sync.", percentage: 0 };
    lastProgressRef.current = null;
}

/**
 * Main Sync Entry Point: Orchestrates PULL, CLEAN, and CLOUD phases.
 */
export async function runSync(
    config: PortalConfig,
    onProgress: (progress: Partial<SyncProgress>) => void,
    sessionId?: string
): Promise<void> {
    resetStopSignal();

    if (!config.local_dir) {
        onProgress({ phase: "error", description: "Portal not initialized.", percentage: 0 });
        return;
    }

    const showPull = config.source_provider !== "none" && config.source_provider !== "unconfigured";
    const _showClean = config.enable_malware_shield; // Used for UI logic, clean integrated into pull
    const showCloud = config.upsync_enabled && config.backup_provider !== "none" && config.backup_provider !== "unconfigured";

    // INTEGRATED CLEANING: Assign weight to clean phase for UI visibility
    const weights = { pull: showPull ? 50 : 0, clean: 0, cloud: showCloud ? 50 : 0 };
    const totalWeight = weights.pull + weights.cloud;
    const scale = totalWeight > 0 ? 100 / totalWeight : 1;

    let pullFinished = false;

    const wrapProgress = (p: Partial<SyncProgress>) => {
        const incomingPhase = p.phase || currentProgress.phase;

        // Track phase completion in parallel mode
        // Pull is finished if it explicitly reaches 100% OR if we transitioned out of it to cloud/done
        if ((p.phase === "pull" || (!p.phase && incomingPhase === "pull")) && p.percentage === 100) {
            pullFinished = true;
        }

        let effectivePhase = incomingPhase;

        // In parallel mode, use the "syncing" phase to indicate dual activity.
        // This prevents flickering and provides a clean global state for panels.
        if (showPull && showCloud && !pullFinished && (incomingPhase === "pull" || incomingPhase === "cloud")) {
            effectivePhase = "syncing";
        }

        const currentPct = p.percentage !== undefined ? p.percentage : currentProgress.percentage;
        const phasePct = currentPct || 0;
        let baseWeight = 0;

        // Dynamic weight calculation based on the effective phase
        if (effectivePhase === "pull") {
            baseWeight = 0;
        } else if (effectivePhase === "clean") {
            baseWeight = weights.pull;
        } else if (effectivePhase === "cloud") {
            baseWeight = weights.pull + weights.clean;
        } else if (effectivePhase === "done") {
            baseWeight = totalWeight;
        }

        const currentPhaseWeight = (weights[effectivePhase as keyof typeof weights] || 0);
        const globalPercentage = Math.min(100, Math.round((baseWeight + (phasePct * currentPhaseWeight / 100)) * scale));

        const full: SyncProgress = {
            ...currentProgress,
            ...p,
            phase: effectivePhase as SyncProgress["phase"],
            description: p.description || currentProgress.description,
            percentage: phasePct,
            isPaused: p.isPaused !== undefined ? p.isPaused : currentProgress.isPaused,
            globalPercentage
        };
        currentProgress = full;
        lastProgressRef.current = full;
        onProgress(full);
    };

    try {
        const state = loadSyncState(config.local_dir);

        // Refinement: Only adopt session from state if it's actually resumable (not idle)
        const isResumableRaw = state ? (
            state.downsyncStatus === "incomplete" || state.downsyncStatus === "paused" ||
            state.shieldStatus === "incomplete" || state.shieldStatus === "paused" ||
            state.upsyncStatus === "incomplete" || state.upsyncStatus === "paused"
        ) : false;

        if (sessionId) {
            setSessionId(sessionId);
        } else if (!getCurrentSessionId() && state && isResumableRaw && state.upsyncStatus !== "complete") {
            setSessionId(state.sessionId);
            Logger.info("SYNC", `Adopting incomplete session from state: ${state.sessionId}`);
        }

        const isResumingMatch = state && getCurrentSessionId() === state.sessionId && isResumableRaw;

        if (!isResumingMatch && (!sessionId || isNewSession(sessionId))) {
            // New session or no session ID: Clear any stale state
            resetSessionState();
            resetExecutorState();
            startNewSession();

            // Step 1: Initialize session state with downloadMode
            const newState = createEmptyState();
            newState.sessionId = getCurrentSessionId() || newState.sessionId; // Refinement: Sync sessionId
            newState.downloadMode = config.download_mode;
            saveSyncState(config.local_dir, newState);

            Logger.info("SYNC", `Starting new sync session (mode: ${config.download_mode || "full"})`);
        } else {
            // Resuming: The cloudPhase will load its own state internally
            Logger.info("SYNC", `Resuming existing session: ${getCurrentSessionId()}`);
        }

        const tasks: Promise<void>[] = [];
        let pullDone = false;
        let shieldError: Error | null = null;

        // Resolve effective mode once and pass explicitly to pull phase
        const effectiveMode = (state?.downloadMode || config.download_mode || "full") as "full" | "lean";

        if (showPull) {
            tasks.push((async () => {
                try {
                    await runPullPhase(config, wrapProgress, effectiveMode);
                } catch (err) {
                    shieldError = err as Error;
                    throw err;
                } finally {
                    pullDone = true;
                }
            })());
        } else if (config.enable_malware_shield) {
            tasks.push((async () => {
                try {
                    const excludeFile = Env.getExcludeFilePath(config.local_dir);
                    const cleanupStats: CleanupStats = {
                        phase: "clean", totalArchives: 0, scannedArchives: 0, safePatternCount: 0, riskyPatternCount: 0,
                        cleanArchives: 0, flaggedArchives: 0, extractedFiles: 0, purgedFiles: 0, isolatedFiles: 0,
                        policyMode: config.malware_policy || "purge"
                    };
                    await runCleanupSweep(config.local_dir, excludeFile, config.malware_policy || "purge", (cStats) => {
                        if ("phase" in cStats && cStats.phase && !("scannedArchives" in cStats)) {
                            wrapProgress(cStats as Partial<SyncProgress>);
                            return;
                        }
                        Object.assign(cleanupStats, cStats);
                        wrapProgress({
                            phase: "clean",
                            description: `Shield: Sweep... ${cleanupStats.flaggedArchives} threats purged.`,
                            cleanupStats
                        });
                    }, undefined, cleanupStats);

                    // STANDALONE SHIELD PATH: Generate manifest after cleanup
                    Logger.info("SYNC", "Standalone shield run: Generating manifest after cleanup");
                    const approvedFiles = ShieldManager.scanForApprovedFiles(config.local_dir, "", isStopRequested);

                    // Include any files extracted from archives
                    if (cleanupStats.extractedFilePaths) {
                        cleanupStats.extractedFilePaths.forEach(f => {
                            if (!approvedFiles.includes(f)) approvedFiles.push(f);
                        });
                    }

                    const manifestInfo = ShieldManager.saveUpsyncManifest(config.local_dir, approvedFiles, config.malware_policy || "purge");
                    wrapProgress({ manifestInfo });
                } catch (err) {
                    shieldError = err as Error;
                    throw err;
                } finally {
                    pullDone = true;
                }
            })());
        } else {
            pullDone = true;
        }

        if (showCloud) {
            tasks.push(runManifestCloudPhase(config, wrapProgress, () => pullDone));
        }

        if (tasks.length > 0) {
            await Promise.all(tasks);
        }

        if (shieldError) throw shieldError;

        wrapProgress({
            phase: "done",
            description: "MISSION ACCOMPLISHED. SYSTEM RESILIENT.",
            percentage: 100,
            isPaused: false
        });

        // Refinement: Clear sync state on successful completion (Step 3)
        const { clearSyncState } = await import("../syncState");
        clearSyncState(config.local_dir);

        // PERSISTENCE: Save final stats to config
        const finalStats = lastProgressRef.current;
        if (finalStats) {
            const updatedConfig = { ...config };
            updatedConfig.last_sync_stats = {
                timestamp: Date.now(),
                files_processed: finalStats.filesTransferred || 0,
                bytes_transferred: finalStats.rawBytesTransferred || 0,
                status: "success" as const
            };



            if (finalStats.cleanupStats) {
                updatedConfig.last_shield_stats = {
                    timestamp: Date.now(),
                    totalArchives: finalStats.cleanupStats.scannedArchives,
                    riskyPatternCount: finalStats.cleanupStats.riskyPatternCount,
                    extractedFiles: finalStats.cleanupStats.extractedFiles
                };
            }
            await saveConfig(updatedConfig);
        }
    } catch (err) {
        if (isStopRequested()) {
            Logger.info("SYNC", "Sync stopped by user.");
            wrapProgress({
                phase: "done",
                description: "Sync stopped by user.",
                percentage: 0,
                isPaused: false
            });
        } else {
            Logger.error("SYNC", `Sync failed: ${err instanceof Error ? err.stack : String(err)}`);
            wrapProgress({
                phase: "error",
                description: `Sync Failed: ${err instanceof Error ? err.message : String(err)}`,
                percentage: 0
            });
        }
    }
}
