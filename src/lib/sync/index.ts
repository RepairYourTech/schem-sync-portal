import { Logger } from "../logger";
import { saveConfig } from "../config";
import type { PortalConfig } from "../config";
import type { SyncProgress } from "./types";
import { runPullPhase } from "./pullPhase";
// cleanPhase removed - now integrated into pullPhase final sweep
import { runCloudPhase, runStreamingCloudPhase } from "./cloudPhase";
import { resetSessionState, resetSessionCompletions, parseJsonLog } from "./progress";
import { StreamingFileQueue } from "./streamingQueue";

import {
    stopSync,
    pauseSync,
    resumeSync,
    getIsSyncPaused,
    resetExecutorState
} from "./utils";

export * from "./types";
export {
    stopSync,
    pauseSync,
    resumeSync,
    getIsSyncPaused
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
    onProgress: (progress: Partial<SyncProgress>) => void
): Promise<void> {
    if (!config.local_dir) {
        onProgress({ phase: "error", description: "Portal not initialized.", percentage: 0 });
        return;
    }

    const showPull = config.source_provider !== "none" && config.source_provider !== "unconfigured";
    const _showClean = config.enable_malware_shield; // Used for UI logic, clean integrated into pull
    const showCloud = config.upsync_enabled && config.backup_provider !== "none" && config.backup_provider !== "unconfigured";

    // INTEGRATED CLEANING: Assign weight to clean phase for UI visibility
    const weights = { pull: showPull ? 45 : 0, clean: 10, cloud: showCloud ? 45 : 0 };
    const totalWeight = weights.pull + weights.clean + weights.cloud;
    const scale = totalWeight > 0 ? 100 / totalWeight : 1;

    let pullFinished = false;

    const wrapProgress = (p: Partial<SyncProgress>) => {
        // Track phase completion in parallel mode
        if (p.phase === "pull" && p.percentage === 100) pullFinished = true;

        const incomingPhase = p.phase || currentProgress.phase;
        let effectivePhase = incomingPhase;

        // In parallel mode, use the "syncing" phase to indicate dual activity.
        // This prevents flickering and provides a clean global state for panels.
        if (showPull && showCloud && !pullFinished && (incomingPhase === "pull" || incomingPhase === "cloud")) {
            effectivePhase = "syncing";
        }

        const phasePct = p.percentage || 0;
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
        resetSessionState();
        resetExecutorState();

        if (showPull && showCloud) {
            // ASYNC STREAMING MODE: Pull and Cloud run in parallel
            Logger.info("SYNC", "Starting Parallel Sync (Streaming Mode)");
            const queue = new StreamingFileQueue();

            await Promise.all([
                runPullPhase(config, wrapProgress, queue).then(() => {
                    Logger.info("SYNC", "Pull phase finished, marking queue complete");
                    queue.markComplete();
                }),
                runStreamingCloudPhase(config, wrapProgress, queue)
            ]);
        } else {
            // SEQUENTIAL MODE: Either one or the other
            if (showPull) {
                await runPullPhase(config, wrapProgress);
            }

            if (showCloud) {
                await runCloudPhase(config, wrapProgress);
            }
        }

        wrapProgress({
            phase: "done",
            description: "MISSION ACCOMPLISHED. SYSTEM RESILIENT.",
            percentage: 100,
            isPaused: false
        });

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
        Logger.error("SYNC", `Sync failed: ${err instanceof Error ? err.stack : String(err)}`);
        wrapProgress({
            phase: "error",
            description: `Sync Failed: ${err instanceof Error ? err.message : String(err)}`,
            percentage: 0
        });
    }
}
