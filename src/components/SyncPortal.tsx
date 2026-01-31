import React, { useMemo, useEffect, useRef } from "react";
import { TextAttributes } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import type { SyncProgress } from "../lib/sync";
import type { PortalConfig } from "../lib/config";
import { DownsyncPanel, LocalShieldPanel, UpsyncPanel, type ThemeColors } from "./SyncPortalParts";

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

export function SyncPortal({
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
}: SyncPortalProps) {
    const { width } = useTerminalDimensions();
    const colors: ThemeColors = {
        primary: "#3b82f6",
        success: "#22c55e",
        warning: "#eab308",
        danger: "#ef4444",
        accent: "#a855f7",
        setup: "#ec4899",
        bg: "#0f172a",
        fg: "#f8fafc",
        border: "#334155",
        dim: "#64748b"
    };

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

    const handleFocus = (type: "global" | "source" | "shield" | "dest") => {
        onFocusChange("body");
        if (type === "global") onFocusIndexChange(0);
        else {
            const idx = visiblePanels.indexOf(type);
            if (idx !== -1) onFocusIndexChange(idx + 1);
        }
    };

    const isWide = width >= 80;

    return (
        <box flexDirection="column" gap={1} height="100%">
            {/* === GLOBAL HEADER === */}
            <box
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
                paddingLeft={1}
                paddingRight={1}
                height={isRunning ? 2 : 3}
                border
                borderStyle="single"
                borderColor={isGlobalFocused ? colors.fg : colors.border}
            >
                <box flexDirection="column" gap={0}>
                    <text fg={colors.fg} attributes={TextAttributes.BOLD}>SYNC PORTAL</text>
                    <text fg={statusColor}>{statusText}</text>
                </box>

                <box flexDirection="row" gap={2} alignItems="center">
                    {!isRunning ? (
                        <box
                            onMouseDown={() => { handleFocus("global"); if (configLoaded) _onStart(); }}
                            paddingLeft={2}
                            paddingRight={2}
                            border
                            borderStyle="single"
                            borderColor={isGlobalFocused ? colors.fg : (configLoaded ? colors.success : colors.dim)}
                        >
                            <text fg={isGlobalFocused ? colors.fg : (configLoaded ? colors.success : colors.dim)} attributes={TextAttributes.BOLD}>
                                {isGlobalFocused ? "▶ START SYNC" : "S[T]ART SYNC"}
                            </text>
                        </box>
                    ) : (
                        <box
                            onMouseDown={() => { handleFocus("global"); _onStop(); }}
                            paddingLeft={2}
                            paddingRight={2}
                            border
                            borderStyle="single"
                            borderColor={isGlobalFocused ? colors.fg : colors.danger}
                        >
                            <text fg={isGlobalFocused ? colors.fg : colors.danger} attributes={TextAttributes.BOLD}>
                                {isGlobalFocused ? "■ STOP SYNC" : "S[T]OP SYNC"}
                            </text>
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
                    height={isRunning ? (Math.max(config.downsync_transfers || 4, config.upsync_transfers || 4) >= 8 ? 22 : 18) : 12}
                >
                    {showSource && (
                        <box flexGrow={1}>
                            <DownsyncPanel
                                progress={progress}
                                sourceType={sourceType}
                                colors={colors}
                                width={Math.floor(width / visiblePanelCount) - 2}
                                onPause={onPause}
                                onResume={onResume}
                                height={isRunning ? ((config.downsync_transfers || 4) >= 8 ? 22 : 18) : 12}
                                maxFiles={(config.downsync_transfers || 4) >= 8 ? 12 : (isPull ? 10 : 5)}
                                transfers={config.downsync_transfers}
                                onRateChange={(rate: 4 | 6 | 8) => onUpdateConfig({ ...config, downsync_transfers: rate })}
                                isFocused={getPanelFocus("source")}
                                onFocus={() => handleFocus("source")}
                                subFocusIndex={subFocusIndex}
                                onSubFocusIndexChange={onSubFocusIndexChange}
                            />
                        </box>
                    )}

                    {showShield && (
                        <box flexGrow={1}>
                            <LocalShieldPanel
                                progress={progress}
                                colors={colors}
                                width={Math.floor(width / visiblePanelCount) - 2}
                                shieldEnabled={true}
                                onPause={onPause}
                                onResume={onResume}
                                isFocused={getPanelFocus("shield")}
                                onFocus={() => handleFocus("shield")}
                                subFocusIndex={subFocusIndex}
                                onSubFocusIndexChange={onSubFocusIndexChange}
                                height={isRunning ? (Math.max(config.downsync_transfers || 4, config.upsync_transfers || 4) >= 8 ? 22 : 18) : 12}
                                isRunning={isRunning}
                            />
                        </box>
                    )}

                    {showDest && (
                        <box flexGrow={1}>
                            <UpsyncPanel
                                progress={progress}
                                destType={destType}
                                colors={colors}
                                width={Math.floor(width / visiblePanelCount) - 2}
                                upsyncEnabled={true}
                                onPause={onPause}
                                onResume={onResume}
                                height={isRunning ? ((config.upsync_transfers || 4) >= 8 ? 22 : 18) : 12}
                                maxFiles={(config.upsync_transfers || 4) >= 8 ? 12 : (isCloud ? 10 : 5)}
                                transfers={config.upsync_transfers}
                                onRateChange={(rate: 4 | 6 | 8) => onUpdateConfig({ ...config, upsync_transfers: rate })}
                                isFocused={getPanelFocus("dest")}
                                onFocus={() => handleFocus("dest")}
                                subFocusIndex={subFocusIndex}
                                onSubFocusIndexChange={onSubFocusIndexChange}
                            />
                        </box>
                    )}
                </box>
            ) : (
                // Narrow layout: single column
                <box flexDirection="column" gap={1} flexGrow={1}>
                    {showSource && (
                        <DownsyncPanel
                            progress={progress}
                            sourceType={sourceType}
                            colors={colors}
                            width={width - 2}
                            onPause={onPause}
                            onResume={onResume}
                            height={isRunning ? ((config.downsync_transfers || 4) >= 8 ? 20 : 15) : 10}
                            transfers={config.downsync_transfers}
                            onRateChange={(rate: 4 | 6 | 8) => onUpdateConfig({ ...config, downsync_transfers: rate })}
                            isFocused={getPanelFocus("source")}
                            onFocus={() => handleFocus("source")}
                            subFocusIndex={subFocusIndex}
                            onSubFocusIndexChange={onSubFocusIndexChange}
                        />
                    )}
                    {showShield && (
                        <LocalShieldPanel
                            progress={progress}
                            colors={colors}
                            width={width - 2}
                            shieldEnabled={true}
                            onPause={onPause}
                            onResume={onResume}
                            isFocused={getPanelFocus("shield")}
                            onFocus={() => handleFocus("shield")}
                            subFocusIndex={subFocusIndex}
                            onSubFocusIndexChange={onSubFocusIndexChange}
                            height={isRunning ? (Math.max(config.downsync_transfers || 4, config.upsync_transfers || 4) >= 8 ? 20 : 15) : 10}
                            isRunning={isRunning}
                        />
                    )}
                    {showDest && (
                        <UpsyncPanel
                            progress={progress}
                            destType={destType}
                            colors={colors}
                            width={width - 2}
                            upsyncEnabled={true}
                            onPause={onPause}
                            onResume={onResume}
                            height={isRunning ? ((config.upsync_transfers || 4) >= 8 ? 20 : 15) : 10}
                            transfers={config.upsync_transfers}
                            onRateChange={(rate: 4 | 6 | 8) => onUpdateConfig({ ...config, upsync_transfers: rate })}
                            isFocused={getPanelFocus("dest")}
                            onFocus={() => handleFocus("dest")}
                            subFocusIndex={subFocusIndex}
                            onSubFocusIndexChange={onSubFocusIndexChange}
                        />
                    )}
                </box>
            )}

            {/* === GLOBAL PROGRESS === */}
            {isRunning && (
                <box flexDirection="column" gap={0} paddingLeft={1} paddingRight={1}>
                    <text fg={colors.dim}>TOTAL PROGRESS</text>
                    <text fg={colors.success} attributes={TextAttributes.BOLD}>
                        {`[${"█".repeat(Math.round(progress.percentage / 4))}${"░".repeat(25 - Math.round(progress.percentage / 4))}] ${progress.percentage}%`}
                    </text>
                    <text fg={colors.dim} attributes={TextAttributes.ITALIC}>
                        {progress.description}
                    </text>
                </box>
            )}
        </box>
    );
}
