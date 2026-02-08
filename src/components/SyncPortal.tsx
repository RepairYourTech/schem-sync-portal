/** @jsxImportSource @opentui/react */
import React, { useMemo, useEffect, useRef, useCallback } from "react";
import { TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import type { SyncProgress } from "../lib/sync";
import type { PortalConfig } from "../lib/config";
import { useTheme } from "../lib/theme";
import { DownsyncPanel } from "./panels/DownsyncPanel";
import { LocalShieldPanel } from "./panels/LocalShieldPanel";
import { UpsyncPanel } from "./panels/UpsyncPanel";
import { Hotkey } from "./Hotkey";
import { getProviderDisplayName } from "../lib/providerUtils";

import type { FocusArea } from "../hooks/useAppState";

interface SyncPortalProps {
    config: PortalConfig;
    progress: SyncProgress;
    isRunning: boolean;
    onStop: () => void;
    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    onPausePull?: () => void;
    onResumePull?: () => void;
    onPauseShield?: () => void;
    onResumeShield?: () => void;
    onPauseCloud?: () => void;
    onResumeCloud?: () => void;
    isPhasePaused?: (phase: 'pull' | 'shield' | 'cloud') => boolean;
    configLoaded: boolean;
    focusArea: FocusArea;
    onFocusChange: (area: FocusArea) => void;
    focusIndex: number;
    onFocusIndexChange: (index: number) => void;
    subFocusIndex: number;
    onSubFocusIndexChange: (index: number) => void;
    onUpdateConfig: (newConfig: PortalConfig) => void;
}

export const SyncPortal = React.memo(({
    config,
    progress,
    isRunning,
    onStop: _onStop,
    onStart: _onStart,
    onPause,
    onResume,
    onPausePull,
    onResumePull,
    onPauseShield,
    onResumeShield,
    onPauseCloud,
    onResumeCloud,
    isPhasePaused,
    configLoaded,
    focusArea,
    onFocusChange,
    focusIndex,
    onFocusIndexChange,
    subFocusIndex,
    onSubFocusIndexChange,
    onUpdateConfig
}: SyncPortalProps) => {
    const { width } = useTerminalDimensions();
    const { colors } = useTheme();

    const isPull = progress.phase === "pull";
    const isCloud = progress.phase === "cloud";
    const isClean = progress.phase === "clean";
    const isError = progress.phase === "error";
    const isDone = progress.phase === "done";

    const sourceType = getProviderDisplayName(config.source_provider);
    const destType = getProviderDisplayName(config.backup_provider);

    const showSource = config.source_provider !== "none";
    const showShield = config.enable_malware_shield === true;
    const showDest = config.upsync_enabled && config.backup_provider !== "none";

    // Forced stop on unmount logic
    const isRunningRef = useRef(isRunning);
    isRunningRef.current = isRunning;
    useEffect(() => {
        return () => {
            if (isRunningRef.current) {
                _onStop();
            }
        };
    }, [_onStop]);

    const statusText = useMemo(() => {
        if (isError) return "❌ ERROR";
        if (isDone && progress.percentage === 100) return "✓ SYNC COMPLETE";
        if (isDone) return "● STOPPED";
        if (progress.phase === "syncing") return "🔄 SYNCING (PULL + CLOUD)...";
        if (isCloud) return "☁️ UPLOADING TO CLOUD...";
        if (isClean) return "🛡️ MALWARE SHIELD ACTIVE";
        if (isPull) return "⬇️ DOWNLOADING...";
        return "● READY";
    }, [isError, isDone, isCloud, isClean, isPull, progress.phase, progress.percentage]);

    const statusColor = useMemo(() => {
        if (isError) return colors.danger;
        if (isDone) return colors.success;
        if (progress.phase === "syncing") return colors.accent;
        if (isCloud) return colors.accent;
        if (isClean) return colors.setup;
        if (isPull) return colors.primary;
        return colors.dim;
    }, [isError, isDone, isCloud, isClean, isPull, progress.phase, colors]);

    // Focus Management
    const isBodyFocused = focusArea === "body";
    const isHeaderFocused = focusArea === "header";

    const visiblePanels = useMemo(() => {
        const panels: ("source" | "shield" | "dest")[] = [];
        if (showSource) panels.push("source");
        if (showShield) panels.push("shield");
        if (showDest) panels.push("dest");
        return panels;
    }, [showSource, showShield, showDest]);

    const visiblePanelCount = visiblePanels.length;

    // Focus Debouncing: Use a ref to prevent "render storms" (30ms debounce)
    const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const debouncedFocus = useCallback((area: FocusArea, index: number, subIndex: number = 0, keepSubFocus: boolean = false) => {
        // Smart check: only skip if EXACT same state to prevent unnecessary re-renders
        if (focusArea === area && focusIndex === index && (keepSubFocus || subFocusIndex === subIndex)) {
            return;
        }

        if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
        focusTimeoutRef.current = setTimeout(() => {
            onFocusChange(area);
            onFocusIndexChange(index);
            if (!keepSubFocus) onSubFocusIndexChange(subIndex);
            focusTimeoutRef.current = null;
        }, 30);
    }, [focusArea, focusIndex, subFocusIndex, onFocusChange, onFocusIndexChange, onSubFocusIndexChange]);

    useEffect(() => {
        return () => { if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current); };
    }, []);

    const handleRateChangeSource = useCallback((rate: 4 | 6 | 8) => {
        onUpdateConfig({ ...config, downsync_transfers: rate });
    }, [config, onUpdateConfig]);

    const handleRateChangeDest = useCallback((rate: 4 | 6 | 8) => {
        onUpdateConfig({ ...config, upsync_transfers: rate });
    }, [config, onUpdateConfig]);

    // Tiered Responsive Layout Logic
    const MIN_PANEL_WIDTH = 40;
    const gapSize = 1;
    const paddingOffset = 6; // Borders + Padding

    const canFit3 = width >= (3 * MIN_PANEL_WIDTH + 2 * gapSize + paddingOffset);
    const canFit2 = width >= (2 * MIN_PANEL_WIDTH + 1 * gapSize + paddingOffset);

    // Calculate dynamic widths for the panels based on the current responsive tier
    const getPanelWidth = (idx: number, total: number) => {
        if (total === 1) return width - paddingOffset;
        if (total === 2) {
            return canFit2
                ? Math.floor((width - paddingOffset - gapSize) / 2)
                : width - paddingOffset;
        }
        if (total === 3) {
            if (canFit3) return Math.floor((width - paddingOffset - 2 * gapSize) / 3);
            if (canFit2) {
                // Tier 2: First two panels side-by-side, third panel full-width below
                return idx < 2
                    ? Math.floor((width - paddingOffset - gapSize) / 2)
                    : width - paddingOffset;
            }
            return width - paddingOffset;
        }
        return width - paddingOffset;
    };

    const panelWidth = (idx: number) => getPanelWidth(idx, visiblePanelCount);

    // Adaptive height calculation to prevent overflow
    const { height: termHeight } = useTerminalDimensions();
    const headerHeight = 5;
    const APP_FOOTER_HEIGHT = 10;
    const PORTAL_FIXED_OVERHEAD = paddingOffset + 2; // Portal border/padding (6) + spacing (2)
    const availableHeight = termHeight - headerHeight - APP_FOOTER_HEIGHT - PORTAL_FIXED_OVERHEAD;

    // In stage B (2+1), top panels share height, bottom is full. 
    // In stage A (3 side-by-side), all share height.
    const getDynamicHeight = (idx: number, type: "source" | "shield" | "dest") => {
        // Shield panel MUST stay compact (approx 10-11 rows for ultra-condensed stats + controls)
        if (type === "shield") return 11;

        if (visiblePanelCount <= 1) return Math.max(12, availableHeight);
        if (visiblePanelCount === 2) {
            return canFit2 ? Math.max(12, availableHeight) : Math.max(10, Math.floor(availableHeight / 2));
        }
        if (visiblePanelCount === 3) {
            if (canFit3) return Math.max(12, availableHeight);
            if (canFit2) {
                // Top row (0,1) share half height, bottom panel (2) gets other half
                return idx < 2 ? Math.max(10, Math.floor(availableHeight / 2)) : Math.max(10, Math.floor(availableHeight / 2));
            }
            return Math.max(8, Math.floor(availableHeight / 3));
        }
        return 12;
    };

    // Dynamic Row Budgeting for Files
    const PANEL_OVERHEAD = {
        source: width < 38 ? 12 : 11,  // Header(1) + Label(1) + Controls(3-4) + Stats(2-3) + Gaps(3-4)
        shield: width < 38 ? 13 : 12,
        dest: width < 38 ? 12 : 11
    };

    const getMaxFiles = (panelHeight: number, type: keyof typeof PANEL_OVERHEAD) => {
        return Math.max(2, panelHeight - PANEL_OVERHEAD[type]);
    };

    return (
        <box flexDirection="column" gap={1} height={availableHeight + headerHeight + gapSize + paddingOffset} border borderStyle="double" borderColor={colors.primary} title="[ SYNC PORTAL ]" padding={1} overflow="hidden">
            {/* === GLOBAL HEADER === */}
            <box
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
                paddingLeft={1}
                paddingRight={1}
                height={5}
                onMouseOver={() => debouncedFocus("header", 0, 0)}
                border={isHeaderFocused}
                borderStyle="single"
                borderColor={isHeaderFocused ? colors.success : "transparent"}
            >
                <box flexDirection="column" gap={0}>
                    <text fg={colors.fg} attributes={TextAttributes.BOLD}>SYNC PORTAL</text>
                    <text fg={statusColor}>{String(statusText)}</text>
                </box>

                <box flexDirection="row" gap={2} alignItems="center">
                    {!isRunning ? (
                        <box
                            onMouseOver={() => debouncedFocus("header", 0, 0)}
                            onMouseDown={() => {
                                // If already focused, trigger. If not, focus first.
                                if (isHeaderFocused) {
                                    if (configLoaded) _onStart();
                                } else {
                                    debouncedFocus("header", 0, 0);
                                }
                            }}
                            paddingLeft={1}
                            paddingRight={1}
                            border={isHeaderFocused}
                            borderStyle="single"
                            borderColor={isHeaderFocused ? colors.success : "transparent"}
                        >
                            <Hotkey
                                keyLabel="t"
                                label="START SYNC"
                                isFocused={isHeaderFocused}
                                bold
                            />
                        </box>
                    ) : (
                        <box
                            onMouseOver={() => debouncedFocus("header", 0, 0)}
                            onMouseDown={() => {
                                // If already focused, trigger. If not, focus first.
                                if (isHeaderFocused) {
                                    _onStop();
                                } else {
                                    debouncedFocus("header", 0, 0);
                                }
                            }}
                            paddingLeft={1}
                            paddingRight={1}
                            border={isHeaderFocused}
                            borderStyle="single"
                            borderColor={isHeaderFocused ? colors.primary : "transparent"}
                        >
                            <Hotkey
                                keyLabel="t"
                                label="STOP SYNC"
                                isFocused={isHeaderFocused}
                                bold
                                hardened={true}
                                color={isHeaderFocused ? colors.primary : colors.danger}
                            />
                        </box>
                    )}
                </box>
            </box>

            {/* === PANELS LAYOUT === */}
            <box
                flexDirection="row"
                flexWrap="wrap"
                gap={1}
                flexGrow={1}
                alignItems="flex-start"
                overflow="hidden"
            >
                {showSource ? (
                    <box flexBasis={panelWidth(0)} minWidth={panelWidth(0)} flexShrink={0}>
                        <DownsyncPanel
                            progress={progress}
                            sourceType={sourceType}
                            colors={colors}
                            width={panelWidth(0) - 2}
                            onPause={onPausePull || onPause}
                            onResume={onResumePull || onResume}
                            isPhasePaused={isPhasePaused}
                            height={getDynamicHeight(0, "source")}
                            maxFiles={getMaxFiles(getDynamicHeight(0, "source"), "source")}
                            transfers={config.downsync_transfers}
                            onRateChange={handleRateChangeSource}
                            isFocused={!!(isBodyFocused && focusIndex === (visiblePanels.indexOf("source") + 1))}
                            onFocus={(keep) => debouncedFocus("body", visiblePanels.indexOf("source") + 1, 0, keep)}
                            subFocusIndex={subFocusIndex}
                            onSubFocusIndexChange={onSubFocusIndexChange}
                        />
                    </box>
                ) : null}

                {showShield ? (
                    <box flexBasis={panelWidth(showSource ? 1 : 0)} minWidth={panelWidth(showSource ? 1 : 0)} flexShrink={0}>
                        {(() => {
                            const shieldIdx = showSource ? 1 : 0;
                            const baseHeight = getDynamicHeight(shieldIdx, "shield");
                            const shieldHeight = baseHeight;
                            return (
                                <LocalShieldPanel
                                    progress={progress}
                                    colors={colors}
                                    width={panelWidth(shieldIdx) - 2}
                                    shieldEnabled={true}
                                    onPause={onPauseShield || onPause}
                                    onResume={onResumeShield || onResume}
                                    isPhasePaused={isPhasePaused}
                                    isFocused={!!(isBodyFocused && focusIndex === (visiblePanels.indexOf("shield") + 1))}
                                    onFocus={(keep) => debouncedFocus("body", visiblePanels.indexOf("shield") + 1, 0, keep)}
                                    subFocusIndex={subFocusIndex}
                                    onSubFocusIndexChange={onSubFocusIndexChange}
                                    height={shieldHeight}
                                    isRunning={isRunning}
                                />
                            );
                        })()}
                    </box>
                ) : null}

                {showDest ? (
                    <box flexBasis={panelWidth(visiblePanelCount - 1)} minWidth={panelWidth(visiblePanelCount - 1)} flexShrink={0}>
                        <UpsyncPanel
                            progress={progress}
                            destType={destType}
                            colors={colors}
                            width={panelWidth(visiblePanelCount - 1) - 2}
                            upsyncEnabled={true}
                            onPause={onPauseCloud || onPause}
                            onResume={onResumeCloud || onResume}
                            isPhasePaused={isPhasePaused}
                            height={getDynamicHeight(visiblePanelCount - 1, "dest")}
                            maxFiles={getMaxFiles(getDynamicHeight(visiblePanelCount - 1, "dest"), "dest")}
                            transfers={config.upsync_transfers}
                            onRateChange={handleRateChangeDest}
                            isFocused={!!(isBodyFocused && focusIndex === (visiblePanels.indexOf("dest") + 1))}
                            onFocus={(keep) => debouncedFocus("body", visiblePanels.indexOf("dest") + 1, 0, keep)}
                            subFocusIndex={subFocusIndex}
                            onSubFocusIndexChange={onSubFocusIndexChange}
                        />
                    </box>
                ) : null}
            </box>

            {/* === GLOBAL PROGRESS === */}
            {/* Global progress removed - individual panel phase progress bars provide sufficient feedback */}
        </box>
    );
});
SyncPortal.displayName = "SyncPortal";
