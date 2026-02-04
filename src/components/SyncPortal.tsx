/** @jsxImportSource @opentui/react */
import React, { useMemo, useEffect, useRef } from "react";
import { TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import type { SyncProgress } from "../lib/sync";
import type { PortalConfig } from "../lib/config";
import { useTheme } from "../lib/theme";
import { DownsyncPanel } from "./panels/DownsyncPanel";
import { LocalShieldPanel } from "./panels/LocalShieldPanel";
import { UpsyncPanel } from "./panels/UpsyncPanel";
import { Hotkey } from "./Hotkey";

interface SyncPortalProps {
    config: PortalConfig;
    progress: SyncProgress;
    isRunning: boolean;
    onStop: () => void;
    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    configLoaded: boolean;
    focusArea: "body" | "footer";
    onFocusChange: (area: "body" | "footer") => void;
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

    const sourceType = config.source_provider === "copyparty" ? "SERVER" : "CLOUD";
    const destType = config.backup_provider === "copyparty" ? "SERVER" : "CLOUD";

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
    const isGlobalFocused = isBodyFocused && focusIndex === 0;

    const visiblePanels: ("source" | "shield" | "dest")[] = [];
    if (showSource) visiblePanels.push("source");
    if (showShield) visiblePanels.push("shield");
    if (showDest) visiblePanels.push("dest");

    const visiblePanelCount = visiblePanels.length;

    const getPanelFocus = (type: "source" | "shield" | "dest") => {
        if (!isBodyFocused) return false;
        const idx = visiblePanels.indexOf(type);
        return focusIndex === idx + 1;
    };

    const handleFocus = (type: "global" | "source" | "shield" | "dest", keepSubFocus = false) => {
        onFocusChange("body");
        if (type === "global") onFocusIndexChange(0);
        else {
            const idx = visiblePanels.indexOf(type);
            if (idx !== -1) {
                onFocusIndexChange(idx + 1);
                if (!keepSubFocus) onSubFocusIndexChange(0);
            }
        }
    };

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
    const footerHeight = 2; // Approximate footer space
    const spacing = (visiblePanelCount > 2 && !canFit3) ? (gapSize * 2) : gapSize;
    const availableHeight = termHeight - headerHeight - footerHeight - (paddingOffset * 2) - spacing;

    // In stage B (2+1), top panels share height, bottom is full. 
    // In stage A (3 side-by-side), all share height.
    const getDynamicHeight = (idx: number) => {
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
        source: width < 38 ? 10 : 9,  // Extra row for wrapped controls
        shield: width < 38 ? 11 : 10,
        dest: width < 38 ? 10 : 9
    };

    const getMaxFiles = (panelHeight: number, type: keyof typeof PANEL_OVERHEAD) => {
        return Math.max(2, panelHeight - PANEL_OVERHEAD[type]);
    };

    return (
        <box flexDirection="column" gap={1} height="100%" border borderStyle="double" borderColor={colors.primary} title="[ SYNC PORTAL ]" padding={1}>
            {/* === GLOBAL HEADER === */}
            <box
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
                paddingLeft={1}
                paddingRight={1}
                height={5}
                border
                borderStyle="single"
                borderColor={isGlobalFocused ? colors.primary : colors.dim + "33"}
                onMouseOver={() => handleFocus("global")}
            >
                <box flexDirection="column" gap={0}>
                    <text fg={colors.fg} attributes={TextAttributes.BOLD}>SYNC PORTAL</text>
                    <text fg={statusColor}>{String(statusText)}</text>
                </box>

                <box flexDirection="row" gap={2} alignItems="center">
                    {!isRunning ? (
                        <box
                            onMouseOver={() => handleFocus("global")}
                            onMouseDown={() => { if (configLoaded) _onStart(); }}
                            paddingLeft={1}
                            paddingRight={1}
                            border={isGlobalFocused}
                            borderStyle="single"
                            borderColor={isGlobalFocused ? colors.success : "transparent"}
                        >
                            <Hotkey
                                keyLabel="t"
                                label="START SYNC"
                                isFocused={isGlobalFocused}
                                bold
                            />
                        </box>
                    ) : (
                        <box
                            onMouseOver={() => handleFocus("global")}
                            onMouseDown={() => { _onStop(); }}
                            paddingLeft={1}
                            paddingRight={1}
                            border={isGlobalFocused}
                            borderStyle="single"
                            borderColor={isGlobalFocused ? colors.primary : colors.dim + "33"}
                        >
                            <Hotkey
                                keyLabel="t"
                                label="STOP SYNC"
                                isFocused={isGlobalFocused}
                                bold
                                hardened={true}
                                color={isGlobalFocused ? colors.primary : colors.danger}
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
                            onPause={onPause}
                            onResume={onResume}
                            height={isRunning ? getDynamicHeight(0) : 12}
                            maxFiles={getMaxFiles(getDynamicHeight(0), "source")}
                            transfers={config.downsync_transfers}
                            onRateChange={(rate: 4 | 6 | 8) => onUpdateConfig({ ...config, downsync_transfers: rate })}
                            isFocused={getPanelFocus("source")}
                            onFocus={(keep) => handleFocus("source", keep)}
                            subFocusIndex={subFocusIndex}
                            onSubFocusIndexChange={onSubFocusIndexChange}
                        />
                    </box>
                ) : null}

                {showShield ? (
                    <box flexBasis={panelWidth(showSource ? 1 : 0)} minWidth={panelWidth(showSource ? 1 : 0)} flexShrink={0}>
                        <LocalShieldPanel
                            progress={progress}
                            colors={colors}
                            width={panelWidth(showSource ? 1 : 0) - 2}
                            shieldEnabled={true}
                            onPause={onPause}
                            onResume={onResume}
                            isFocused={getPanelFocus("shield")}
                            onFocus={(keep) => handleFocus("shield", keep)}
                            subFocusIndex={subFocusIndex}
                            onSubFocusIndexChange={onSubFocusIndexChange}
                            height={isRunning ? getDynamicHeight(showSource ? 1 : 0) : 12}
                            isRunning={isRunning}
                        />
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
                            onPause={onPause}
                            onResume={onResume}
                            height={isRunning ? getDynamicHeight(visiblePanelCount - 1) : 12}
                            maxFiles={getMaxFiles(getDynamicHeight(visiblePanelCount - 1), "dest")}
                            transfers={config.upsync_transfers}
                            onRateChange={(rate: 4 | 6 | 8) => onUpdateConfig({ ...config, upsync_transfers: rate })}
                            isFocused={getPanelFocus("dest")}
                            onFocus={(keep) => handleFocus("dest", keep)}
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
