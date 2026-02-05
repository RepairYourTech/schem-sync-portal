import { useState, useCallback, useRef } from "react";
import type { PortalConfig } from "../lib/config";
import { runSync, stopSync, pauseSync, resumeSync, clearSyncSession, getIsSyncPaused, type SyncProgress } from "../lib/sync";

type Phase = 'pull' | 'shield' | 'cloud';

export function useSync() {
    const [progress, setProgress] = useState<SyncProgress>({
        phase: "done",
        description: "Ready to sync.",
        percentage: 0,
    });
    const [isRunning, setIsRunning] = useState(false);
    const stopRequested = useRef(false);

    const updateProgress = useCallback((p: Partial<SyncProgress>) => {
        setProgress(prev => ({
            ...prev,
            ...p
        }));
    }, []);

    const start = useCallback(async (config: PortalConfig) => {
        setIsRunning(true);
        stopRequested.current = false;
        try {
            await runSync(config, (p) => {
                setProgress(prev => ({
                    ...prev,
                    ...p
                }));
            });
            // Clear session state after successful completion
            clearSyncSession();
        } catch (err) {
            setProgress({
                phase: "error",
                description: `Error: ${err instanceof Error ? err.message : String(err)}`,
                percentage: 0,
            });
        } finally {
            setIsRunning(false);
        }
    }, []);

    const stop = useCallback(() => {
        stopRequested.current = true;
        stopSync();
        setIsRunning(false);
        setProgress({
            phase: "done",
            description: "Sync stopped by user.",
            percentage: 0,
        });
    }, []);

    const pause = useCallback(() => {
        pauseSync(p => setProgress(prev => ({ ...prev, ...p })));
    }, []);

    const resume = useCallback(() => {
        resumeSync(p => setProgress(prev => ({ ...prev, ...p })));
    }, []);

    const pausePhase = useCallback((phase: Phase) => {
        pauseSync(p => setProgress(prev => ({ ...prev, ...p })), phase);
    }, []);

    const resumePhase = useCallback((phase: Phase) => {
        resumeSync(p => setProgress(prev => ({ ...prev, ...p })), phase);
    }, []);

    const isPhasePaused = useCallback((phase: Phase): boolean => {
        return getIsSyncPaused(phase);
    }, [progress]); // Recalculate when progress changes

    return {
        progress,
        isRunning,
        start,
        stop,
        pause,
        resume,
        pausePhase,
        resumePhase,
        isPhasePaused,
        updateProgress
    };
}
