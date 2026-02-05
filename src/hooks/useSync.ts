import { useState, useCallback, useRef } from "react";
import type { PortalConfig } from "../lib/config";
import { runSync, stopSync, pauseSync, resumeSync, clearSyncSession, getIsSyncPaused, getCurrentSessionId, type SyncProgress } from "../lib/sync";

type Phase = 'pull' | 'shield' | 'cloud';

export function useSync() {
    const [progress, setProgress] = useState<SyncProgress>({
        phase: "done",
        description: "Ready to sync.",
        percentage: 0,
    });
    const [isRunning, setIsRunning] = useState(false);
    const stopRequested = useRef(false);
    const sessionIdRef = useRef<string | null>(null);
    const configRef = useRef<PortalConfig | null>(null);

    const updateProgress = useCallback((p: Partial<SyncProgress>) => {
        setProgress(prev => ({
            ...prev,
            ...p
        }));
    }, []);

    const start = useCallback(async (config: PortalConfig, resumeSessionId?: string) => {
        setIsRunning(true);
        configRef.current = config;
        stopRequested.current = false;

        // Use provided session ID (resume) or generate new one inside runSync
        try {
            await runSync(config, (p) => {
                setProgress(prev => ({
                    ...prev,
                    ...p
                }));
            }, resumeSessionId);

            // On successful completion, clear session
            sessionIdRef.current = null;
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
        sessionIdRef.current = null; // Clear session on full stop
        configRef.current = null;
        setIsRunning(false);
        setProgress({
            phase: "done",
            description: "Sync stopped by user.",
            percentage: 0,
        });
    }, []);

    const pause = useCallback(() => {
        sessionIdRef.current = getCurrentSessionId(); // Capture current session ID on pause
        pauseSync(p => setProgress(prev => ({ ...prev, ...p })));
    }, []);

    const resume = useCallback(() => {
        // If runSync is already running (rclone paused via SIGSTOP), SIGCONT handles it.
        // If runSync exited (e.g. error or previous run), we restart it using the captured session ID.
        if (!isRunning && sessionIdRef.current && configRef.current) {
            start(configRef.current, sessionIdRef.current); // Re-run with captured session info
        } else {
            resumeSync(p => setProgress(prev => ({ ...prev, ...p })));
        }
    }, [isRunning, start]);

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
