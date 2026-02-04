import { Logger } from "../logger";
import { saveConfig } from "../config";
import type { PortalConfig } from "../config";
import type { SyncProgress } from "./types";
import { runPullPhase } from "./pullPhase";
import { runCleanPhase } from "./cleanPhase";
import { runCloudPhase } from "./cloudPhase";
import { resetSessionState, resetSessionCompletions, parseJsonLog } from "./progress";

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
    const showClean = config.enable_malware_shield;
    const showCloud = config.upsync_enabled && config.backup_provider !== "none" && config.backup_provider !== "unconfigured";

    const weights = { pull: showPull ? 45 : 0, clean: showClean ? 10 : 0, cloud: showCloud ? 45 : 0 };
    const totalWeight = weights.pull + weights.clean + weights.cloud;
    const scale = totalWeight > 0 ? 100 / totalWeight : 1;

    const wrapProgress = (p: Partial<SyncProgress>) => {
        const phase = p.phase || "pull";
        const phasePct = p.percentage || 0;
        let baseWeight = 0;
        if (phase === "clean") baseWeight = weights.pull;
        if (phase === "cloud") baseWeight = weights.pull + weights.clean;
        if (phase === "done") baseWeight = totalWeight;

        const currentPhaseWeight = weights[phase as keyof typeof weights] || 0;
        const globalPercentage = Math.min(100, Math.round((baseWeight + (phasePct * currentPhaseWeight / 100)) * scale));

        const full: SyncProgress = {
            ...currentProgress,
            ...p,
            phase: phase as SyncProgress["phase"],
            description: p.description || "",
            percentage: phasePct,
            globalPercentage
        };
        currentProgress = full;
        lastProgressRef.current = full;
        onProgress(full);
    };

    try {
        resetSessionState();
        resetExecutorState();

        // --- PULL PHASE ---
        if (showPull) {
            await runPullPhase(config, wrapProgress);
        }

        // --- CLEAN PHASE ---
        if (showClean) {
            await runCleanPhase(config, wrapProgress);
        }

        // --- CLOUD PHASE ---
        if (showCloud) {
            await runCloudPhase(config, wrapProgress);
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
        Logger.error("SYNC", "Sync failed", err);
        wrapProgress({
            phase: "error",
            description: `Sync Failed: ${err instanceof Error ? err.message : String(err)}`,
            percentage: 0
        });
    }
}
