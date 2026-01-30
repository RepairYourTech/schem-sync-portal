import { useState, useCallback, useRef } from "react";
import type { PortalConfig } from "../lib/config";
import { runSync, stopSync, type SyncProgress } from "../lib/sync";

export function useSync() {
    const [progress, setProgress] = useState<SyncProgress>({
        phase: "done",
        description: "Ready to sync.",
        percentage: 0,
    });
    const [isRunning, setIsRunning] = useState(false);
    const stopRequested = useRef(false);

    const start = useCallback(async (config: PortalConfig) => {
        setIsRunning(true);
        stopRequested.current = false;
        try {
            await runSync(config, (p) => {
                setProgress(p);
            });
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

    return {
        progress,
        isRunning,
        start,
        stop,
    };
}
