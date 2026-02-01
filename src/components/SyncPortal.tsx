/** @jsxImportSource @opentui/react */
import React, { useMemo, useEffect, useRef } from "react";
import { TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import type { SyncProgress } from "../lib/sync";
import type { PortalConfig } from "../lib/config";
import { useTheme } from "../lib/theme";
import { DownsyncPanel, LocalShieldPanel, UpsyncPanel } from "./SyncPortalParts";
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
        if (isCloud) return "☁️ UPLOADING TO CLOUD...";
        if (isClean) return "🛡️ MALWARE SHIELD ACTIVE";
        if (isPull) return "⬇️ DOWNLOADING...";
        return "● READY";
    }, [isError, isDone, isCloud, isClean, isPull, progress.percentage]);

    const statusColor = useMemo(() => {
        if (isError) return colors.danger;
        if (isDone) return colors.success;
        if (isCloud) return colors.accent;
        if (isClean) return colors.setup;
        if (isPull) return colors.primary;
        return colors.dim;
    }, [isError, isDone, isCloud, isClean, isPull, colors]);

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

    const isWide = width >= 80;

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
                                color={isGlobalFocused ? colors.primary : colors.danger}
                            />
                        </box>
                    )}
                </box>
            </box>

            {/* === PANELS LAYOUT === */}
            {isWide ? (
                // Wide layout: columns side by side
                <box
                    flexDirection="row"
                    gap={1}
                    height={isRunning ? 22 : 12} // Standardize to max height to ensure alignment
                >
                    {showSource ? (
                        <box flexGrow={1}>
                            <DownsyncPanel
                                progress={progress}
                                sourceType={sourceType}
                                colors={colors}
                                width={Math.floor(width / visiblePanelCount) - 2}
                                onPause={onPause}
                                onResume={onResume}
                                height={isRunning ? 22 : 12}
                                maxFiles={(config.downsync_transfers || 4) >= 8 ? 12 : (isPull ? 10 : 5)}
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
                        <box flexGrow={1}>
                            <LocalShieldPanel
                                progress={progress}
                                colors={colors}
                                width={Math.floor(width / visiblePanelCount) - 2}
                                shieldEnabled={true}
                                onPause={onPause}
                                onResume={onResume}
                                isFocused={getPanelFocus("shield")}
                                onFocus={(keep) => handleFocus("shield", keep)}
                                subFocusIndex={subFocusIndex}
                                onSubFocusIndexChange={onSubFocusIndexChange}
                                height={isRunning ? 22 : 12}
                                isRunning={isRunning}
                            />
                        </box>
                    ) : null}

                    {showDest ? (
                        <box flexGrow={1}>
                            <UpsyncPanel
                                progress={progress}
                                destType={destType}
                                colors={colors}
                                width={Math.floor(width / visiblePanelCount) - 2}
                                upsyncEnabled={true}
                                onPause={onPause}
                                onResume={onResume}
                                height={isRunning ? 22 : 12}
                                maxFiles={(config.upsync_transfers || 4) >= 8 ? 12 : (isCloud ? 10 : 5)}
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
            ) : (
                // Narrow layout: single column
                <box flexDirection="column" gap={1} flexGrow={1}>
                    {showSource ? (
                        <DownsyncPanel
                            progress={progress}
                            sourceType={sourceType}
                            colors={colors}
                            width={width - 2}
                            onPause={onPause}
                            onResume={onResume}
                            isFocused={getPanelFocus("source")}
                            onFocus={(keep) => handleFocus("source", keep)}
                            subFocusIndex={subFocusIndex}
                            onSubFocusIndexChange={onSubFocusIndexChange}
                            height={isRunning ? 20 : 10}
                            transfers={config.downsync_transfers}
                            onRateChange={(rate: 4 | 6 | 8) => onUpdateConfig({ ...config, downsync_transfers: rate })}
                        />
                    ) : null}
                    {showShield ? (
                        <LocalShieldPanel
                            progress={progress}
                            colors={colors}
                            width={width - 2}
                            shieldEnabled={true}
                            onPause={onPause}
                            onResume={onResume}
                            isFocused={getPanelFocus("shield")}
                            onFocus={(keep) => handleFocus("shield", keep)}
                            subFocusIndex={subFocusIndex}
                            onSubFocusIndexChange={onSubFocusIndexChange}
                            height={isRunning ? 20 : 10}
                            isRunning={isRunning}
                        />
                    ) : null}
                    {showDest ? (
                        <UpsyncPanel
                            progress={progress}
                            destType={destType}
                            colors={colors}
                            width={width - 2}
                            upsyncEnabled={true}
                            onPause={onPause}
                            onResume={onResume}
                            isFocused={getPanelFocus("dest")}
                            onFocus={(keep) => handleFocus("dest", keep)}
                            subFocusIndex={subFocusIndex}
                            onSubFocusIndexChange={onSubFocusIndexChange}
                            height={isRunning ? 20 : 10}
                            transfers={config.upsync_transfers}
                            onRateChange={(rate: 4 | 6 | 8) => onUpdateConfig({ ...config, upsync_transfers: rate })}
                        />
                    ) : null}
                </box>
            )}

            {/* === GLOBAL PROGRESS === */}
            {/* Global progress removed - individual panel phase progress bars provide sufficient feedback */}
        </box>
    );
});
SyncPortal.displayName = "SyncPortal";
