import type { PortalConfig } from "../lib/config";
import type { Phase } from "../hooks/useSync";

export interface SyncStateVars {
    config: PortalConfig;
    isRunning: boolean;
    syncFocusIndex: number;
    syncSubFocusIndex: number;
    setSyncFocusIndex: (val: number | ((prev: number) => number)) => void;
    setSyncSubFocusIndex: (val: number | ((prev: number) => number)) => void;
    setConfig: (config: PortalConfig) => void;
    handleStartSync: () => void;
    stop: () => void;
    pausePhase: (phase: Phase) => void;
    resumePhase: (phase: Phase) => void;
    isPhasePaused: (phase: Phase) => boolean;
}

/**
 * Pure logic for sync view keyboard handling.
 * Extracted for regression testing and to keep AppContent.tsx under the line limit.
 */
export function handleSyncKeys(key: { name: string }, state: SyncStateVars): boolean {
    const {
        config, isRunning,
        syncFocusIndex, syncSubFocusIndex,
        setSyncFocusIndex, setSyncSubFocusIndex,
        setConfig, handleStartSync, stop,
        pausePhase, resumePhase, isPhasePaused
    } = state;

    const showSource = config.source_provider !== "none";
    const showShield = config.enable_malware_shield === true;
    const showDest = config.upsync_enabled && config.backup_provider !== "none";
    const panelCount = 1 + (showSource ? 1 : 0) + (showShield ? 1 : 0) + (showDest ? 1 : 0);

    const panelTypes = ["global"];
    if (showSource) panelTypes.push("source");
    if (showShield) panelTypes.push("shield");
    if (showDest) panelTypes.push("dest");

    if (key.name === "t") {
        setSyncFocusIndex(0);
        return true;
    }

    if (key.name === "up" || key.name === "k") {
        const currentPanelType = panelTypes[syncFocusIndex];
        const newPanelIndex = (syncFocusIndex === 0 ? panelCount - 1 : syncFocusIndex - 1);
        const newPanelType = panelTypes[newPanelIndex];

        setSyncFocusIndex(newPanelIndex);
        if (!((currentPanelType === "source" || currentPanelType === "dest") && (newPanelType === "source" || newPanelType === "dest"))) {
            setSyncSubFocusIndex(0);
        }
        return true;
    }

    if (key.name === "down" || key.name === "j") {
        const currentPanelType = panelTypes[syncFocusIndex];
        const newPanelIndex = (syncFocusIndex === panelCount - 1 ? 0 : syncFocusIndex + 1);
        const newPanelType = panelTypes[newPanelIndex];

        setSyncFocusIndex(newPanelIndex);
        if (!((currentPanelType === "source" || currentPanelType === "dest") && (newPanelType === "source" || newPanelType === "dest"))) {
            setSyncSubFocusIndex(0);
        }
        return true;
    }

    if (key.name === "left" || key.name === "right" || key.name === "h" || key.name === "l") {
        if (syncFocusIndex > 0) {
            const currentPanelType = panelTypes[syncFocusIndex];
            const maxSub = (currentPanelType === "source" || currentPanelType === "dest") ? 3 : 0;
            if (key.name === "left" || key.name === "h") setSyncSubFocusIndex((prev: number) => (prev === 0 ? maxSub : prev - 1));
            else setSyncSubFocusIndex((prev: number) => (prev >= maxSub ? 0 : prev + 1));
        }
        return true;
    }

    if (key.name === "p" || key.name === "r") {
        if (syncFocusIndex === 0) {
            setSyncFocusIndex(0);
        } else {
            setSyncSubFocusIndex(0); // Focus Pause/Resume button
        }
        return true;
    }

    if (key.name === "4" || key.name === "6" || key.name === "8") {
        const rateIdx = key.name === "4" ? 1 : key.name === "6" ? 2 : 3;
        const currentPanelType = panelTypes[syncFocusIndex];
        if (currentPanelType === "source" || currentPanelType === "dest") {
            setSyncSubFocusIndex(rateIdx);
        }
        return true;
    }

    if (key.name === "return") {
        if (syncFocusIndex === 0) {
            if (isRunning) stop();
            else handleStartSync();
        } else if (syncFocusIndex > 0) {
            const panelType = panelTypes[syncFocusIndex];

            if (syncSubFocusIndex === 0) {
                if (panelType === "source") {
                    if (isPhasePaused('pull')) resumePhase('pull');
                    else pausePhase('pull');
                } else if (panelType === "shield") {
                    if (isPhasePaused('shield')) resumePhase('shield');
                    else pausePhase('shield');
                } else if (panelType === "dest") {
                    if (isPhasePaused('cloud')) resumePhase('cloud');
                    else pausePhase('cloud');
                }
            } else if (syncSubFocusIndex >= 1 && syncSubFocusIndex <= 3) {
                const rate = (syncSubFocusIndex === 1 ? 4 : syncSubFocusIndex === 2 ? 6 : 8) as 4 | 6 | 8;
                const newConfig = { ...config };
                if (panelType === "source") newConfig.downsync_transfers = rate;
                if (panelType === "dest") newConfig.upsync_transfers = rate;
                setConfig(newConfig);
            }
        }
        return true;
    }

    return false;
}
