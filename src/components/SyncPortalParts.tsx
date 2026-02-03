/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { SyncProgress, FileTransferItem } from "../lib/sync";
import { Hotkey } from "./Hotkey";

export interface ThemeColors {
    primary: string;
    success: string;
    warning: string;
    danger: string;
    accent: string;
    setup: string;
    bg: string;
    fg: string;
    border: string;
    dim: string;
}

// --- CLOUD STATS ---
interface CloudStatsProps {
    stats: {
        totalFiles: number;
        updatedFiles: number;
        deletedFiles: number;
    };
    provider: string;
    colors: ThemeColors;
}

export const CloudStatsHeader = React.memo(({ stats, provider, colors }: CloudStatsProps) => (
    <box flexDirection="column" gap={0} paddingLeft={1} paddingRight={1} border borderStyle="single" borderColor={colors.border}>
        <text fg={colors.fg} attributes={TextAttributes.BOLD}>{String(provider)} STATUS</text>
        <box flexDirection="row" gap={2}>
            <text fg={colors.fg}>Total: {String(stats.totalFiles)}</text>
            <text fg={colors.primary}>Updated: {String(stats.updatedFiles)}</text>
            <text fg={colors.danger}>Deleted: {String(stats.deletedFiles)}</text>
        </box>
        {provider === "GDRIVE" ? (
            <text fg={colors.dim} attributes={TextAttributes.ITALIC}>Trash: Disabled (Secure Wipe)</text>
        ) : null}
    </box>
));
CloudStatsHeader.displayName = "CloudStatsHeader";

// =============================================================================
// NEW PANEL-FIRST COMPONENTS (Phase 2: UI Redesign)
// =============================================================================

// --- PANEL HEADER ---
export type PanelStatus = "active" | "idle" | "complete" | "waiting" | "paused" | "error" | "blocked";

interface PanelHeaderProps {
    title: string;
    status: PanelStatus;
    percentage?: number;
    accentColor: string;
    colors: ThemeColors;
    width: number;
    onPause?: () => void;
    onResume?: () => void;
    transfers?: 4 | 6 | 8;
    onRateChange?: (rate: 4 | 6 | 8) => void;
    isFocused?: boolean;
    subFocusIndex?: number;
    onSubFocusIndexChange?: (index: number) => void;
    onFocus?: (keepSubFocus?: boolean) => void;
}

const getStatusDisplay = (status: PanelStatus, colors: ThemeColors): { icon: string; text: string; color: string } => {
    switch (status) {
        case "active": return { icon: "▶", text: "RUNNING", color: colors.primary };
        case "paused": return { icon: "⏸", text: "PAUSED", color: colors.warning };
        case "complete": return { icon: "✓", text: "COMPLETE", color: colors.success };
        case "waiting": return { icon: "○", text: "WAITING", color: colors.dim };
        case "error": return { icon: "✗", text: "ERROR", color: colors.danger };
        case "blocked": return { icon: "⛔", text: "BLOCKED", color: colors.danger };
    }
    return { icon: "○", text: "IDLE", color: colors.dim };
};

interface PerformanceSelectorProps {
    current: 4 | 6 | 8;
    onRateChange: (rate: 4 | 6 | 8) => void;
    colors: ThemeColors;
    isFocused?: boolean;
    subFocusIndex?: number;
    onSubFocusIndexChange?: (index: number) => void;
}

const PerformanceSelector = React.memo(({ current, onRateChange, colors, isFocused, subFocusIndex, onSubFocusIndexChange, onFocus }: PerformanceSelectorProps & { onFocus?: (keepSubFocus?: boolean) => void }) => {
    useKeyboard((key) => {
        if (!isFocused) return;
        if (key.name === "4") onRateChange(4);
        if (key.name === "6") onRateChange(6);
        if (key.name === "8") onRateChange(8);
    });

    return (
        <box flexDirection="row" gap={1} paddingLeft={1} paddingRight={1} alignItems="center">
            <box flexDirection="row" alignItems="center" onMouseOver={() => {/* Capture event, prevent bubbling to panel */ }}>
                <text fg={colors.fg}>SPEED: </text>
                <text fg={colors.fg} marginLeft={1}>{String(current)}</text>
            </box>
            <box
                onMouseOver={() => {
                    if (onFocus) onFocus(true);
                    if (onSubFocusIndexChange) onSubFocusIndexChange(1);
                }}
                onMouseDown={() => {
                    onRateChange(4);
                }}
                paddingLeft={1}
                paddingRight={1}
                border={!!(isFocused && subFocusIndex === 1)}
                borderStyle="single"
                borderColor={!!(isFocused && subFocusIndex === 1) ? colors.success : "transparent"}
            >
                <Hotkey keyLabel="4" isFocused={!!(isFocused && subFocusIndex === 1)} />
            </box>
            <box
                onMouseOver={() => {
                    if (onFocus) onFocus(true);
                    if (onSubFocusIndexChange) onSubFocusIndexChange(2);
                }}
                onMouseDown={() => {
                    onRateChange(6);
                }}
                paddingLeft={1}
                paddingRight={1}
                border={!!(isFocused && subFocusIndex === 2)}
                borderStyle="single"
                borderColor={!!(isFocused && subFocusIndex === 2) ? colors.success : "transparent"}
            >
                <Hotkey keyLabel="6" isFocused={!!(isFocused && subFocusIndex === 2)} />
            </box>
            <box
                onMouseOver={() => {
                    if (onFocus) onFocus(true);
                    if (onSubFocusIndexChange) onSubFocusIndexChange(3);
                }}
                onMouseDown={() => {
                    onRateChange(8);
                }}
                paddingLeft={1}
                paddingRight={1}
                border={!!(isFocused && subFocusIndex === 3)}
                borderStyle="single"
                borderColor={!!(isFocused && subFocusIndex === 3) ? colors.success : "transparent"}
            >
                <Hotkey keyLabel="8" isFocused={!!(isFocused && subFocusIndex === 3)} />
            </box>
        </box>
    );
});
PerformanceSelector.displayName = "PerformanceSelector";

// --- PANEL PROGRESS BAR ---
interface ProgressBarProps {
    percentage?: number;
    colors: ThemeColors;
    width: number;
    isFocused: boolean;
}

export const PanelProgressBar = React.memo(({ percentage, colors, width, isFocused }: ProgressBarProps) => {
    if (percentage === undefined) return null;
    const barWidth = Math.max(2, width - 10);
    const filled = Math.max(0, Math.round((percentage / 100) * barWidth));
    const empty = Math.max(0, barWidth - filled);
    const progressBar = `[${"█".repeat(filled)}${"░".repeat(empty)}] ${percentage}%`;

    return (
        <box paddingLeft={1} paddingRight={1} height={1}>
            <text fg={isFocused ? colors.fg : colors.dim}>{String(progressBar)}</text>
        </box>
    );
});
PanelProgressBar.displayName = "PanelProgressBar";

// --- PANEL CONTROLS ---
interface PanelControlsProps {
    onPause?: () => void;
    onResume?: () => void;
    transfers?: 4 | 6 | 8;
    onRateChange?: (rate: 4 | 6 | 8) => void;
    colors: ThemeColors;
    isFocused: boolean;
    subFocusIndex: number;
    onSubFocusIndexChange?: (index: number) => void;
    onFocus?: (keepSubFocus?: boolean) => void;
}

export const PanelControls = React.memo(({
    onPause,
    onResume,
    transfers,
    onRateChange,
    colors,
    isFocused,
    subFocusIndex,
    onSubFocusIndexChange,
    onFocus
}: PanelControlsProps) => {
    const isActionFocused = isFocused && subFocusIndex === 0;

    return (
        <box flexDirection="column" gap={0} border borderStyle="single" borderColor={isFocused ? colors.primary : colors.dim + "33"} padding={0} marginTop={1}>
            <box flexDirection="row" justifyContent="space-between" alignItems="center" height={1}>
                {/* Pause/Resume Action */}
                <box
                    onMouseOver={() => onFocus?.(true)}
                    onMouseDown={() => {
                        (onPause || onResume)?.();
                        onFocus?.(true);
                    }}
                    paddingLeft={1}
                    paddingRight={1}
                    border={isActionFocused}
                    borderStyle="single"
                    borderColor={isActionFocused ? colors.success : "transparent"}
                    height={1}
                >
                    {onPause ? <Hotkey keyLabel="p" label="PAUSE" isFocused={isActionFocused} /> : null}
                    {onResume ? <Hotkey keyLabel="r" label="RESUME" isFocused={isActionFocused} color={colors.success} /> : null}
                    {!onPause && !onResume ? <text fg={colors.dim}>[ READY ]</text> : null}
                </box>

                {/* Speed Selector */}
                {onRateChange ? (
                    <PerformanceSelector
                        current={transfers || 4}
                        onRateChange={onRateChange}
                        colors={colors}
                        isFocused={isFocused}
                        subFocusIndex={subFocusIndex}
                        onSubFocusIndexChange={onSubFocusIndexChange}
                        onFocus={onFocus}
                    />
                ) : null}
            </box>
        </box>
    );
});
PanelControls.displayName = "PanelControls";

export const PanelHeader = React.memo(({
    title,
    status,
    accentColor,
    colors,
    isFocused = false,
}: Partial<PanelHeaderProps>) => {
    const statusDisplay = getStatusDisplay(status || "idle", colors!);

    return (
        <box flexDirection="row" justifyContent="space-between" alignItems="center" paddingLeft={1} paddingRight={1} height={1}>
            <box flexDirection="row" gap={1}>
                <text fg={isFocused ? colors!.primary : colors!.dim}>{String(isFocused ? "▶" : " ")}</text>
                <text fg={isFocused ? colors!.primary : accentColor!} attributes={TextAttributes.BOLD}>
                    {String(title)}
                </text>
            </box>
            <text fg={statusDisplay.color} attributes={TextAttributes.BOLD}>
                {String(statusDisplay.icon)} {String(statusDisplay.text)}
            </text>
        </box>
    );
});
PanelHeader.displayName = "PanelHeader";

// --- FILE QUEUE ---
interface FileQueueProps {
    files: FileTransferItem[];
    colors: ThemeColors;
    maxHeight: number;
    width: number;
    phase?: SyncProgress["phase"];
}

export const FileQueue = React.memo(({ files, colors, maxHeight, width, phase }: FileQueueProps) => {
    if (files.length === 0) {
        // Show initializing state during active pull phase
        if (phase === "pull") {
            return (
                <box paddingLeft={2} paddingTop={1} height={maxHeight}>
                    <text fg={colors.dim} attributes={TextAttributes.ITALIC}>Waiting for rclone data...</text>
                </box>
            );
        }
        return (
            <box paddingLeft={2} paddingTop={1} height={maxHeight}>
                <text fg={colors.dim} attributes={TextAttributes.ITALIC}>QUEUE EMPTY</text>
            </box>
        );
    }

    return (
        <box flexDirection="column" gap={0} paddingLeft={1} paddingRight={1} height={maxHeight}>
            {files.slice(0, maxHeight).map((f, i) => {
                const isItemDone = f.status === "completed" || f.percentage === 100;
                const maxFileNameWidth = Math.max(10, width - 12);
                const displayName = f.filename.length > maxFileNameWidth
                    ? f.filename.substring(0, maxFileNameWidth - 3) + "..."
                    : f.filename;

                return (
                    <box key={`${f.filename}-${i}`} flexDirection="row" justifyContent="space-between" height={1}>
                        <text fg={isItemDone ? colors.success : colors.dim}>{String(isItemDone ? "✓" : "→")}</text>
                        <text fg={colors.fg} flexShrink={1}> {String(displayName)}</text>
                        <text fg={colors.dim}>{String(f.percentage || 0)}%</text>
                    </box>
                );
            })}
        </box>
    );
});
FileQueue.displayName = "FileQueue";

// --- DOWNSYNC PANEL ---
interface DownsyncPanelProps {
    progress: SyncProgress;
    sourceType: string;
    colors: ThemeColors;
    width: number;
    onPause?: () => void;
    onResume?: () => void;
    height?: number;
    maxFiles?: number;
    transfers?: 4 | 6 | 8;
    onRateChange?: (rate: 4 | 6 | 8) => void;
    isFocused?: boolean;
    onFocus?: (keepSubFocus?: boolean) => void;
    subFocusIndex?: number;
    onSubFocusIndexChange?: (index: number) => void;
}

export const DownsyncPanel = React.memo(({
    progress,
    sourceType,
    colors,
    width,
    onPause,
    onResume,
    height = 10,
    maxFiles = 5,
    transfers = 4,
    onRateChange,
    isFocused = false,
    onFocus,
    subFocusIndex = 0,
    onSubFocusIndexChange: _onSubFocusIndexChange
}: DownsyncPanelProps) => {
    const isActive = progress.phase === "pull";
    const isGlobalPaused = progress.isPaused;

    const status: PanelStatus = isGlobalPaused ? "paused" :
        isActive ? "active" :
            (progress.phase === "cloud" || progress.phase === "done" || progress.phase === "clean") ? "complete" : "idle";

    const downloadQueue = progress.downloadQueue || [];
    const panelHeight = height;
    const maxFilesToShow = maxFiles;

    return (
        <box
            flexDirection="column"
            gap={0}
            border
            borderStyle="single"
            borderColor={isFocused ? colors.primary : (isActive ? colors.primary : colors.dim + "33")}
            title={`[ ${String(sourceType).toUpperCase()} ]`}
            onMouseOver={() => onFocus?.(true)}
            onMouseDown={() => onFocus?.(true)}
            height={panelHeight}
            width={width}
        >
            <PanelHeader
                title={`DOWNSYNC: ${sourceType}`}
                status={status}
                accentColor={colors.primary}
                colors={colors}
                isFocused={isFocused}
            />

            {/* DOWNLOAD QUEUE */}
            <box flexDirection="column" gap={0} marginTop={1}>
                <text fg={colors.dim} paddingLeft={1} attributes={TextAttributes.BOLD}>DOWNLOAD QUEUE</text>
                <FileQueue files={downloadQueue} colors={colors} maxHeight={maxFilesToShow} width={width} phase={progress.phase} />
            </box>

            {/* ACTION BAR (Bottom-docked) */}
            <box marginTop="auto">
                <PanelControls
                    onPause={(isActive && !isGlobalPaused) ? onPause : undefined}
                    onResume={isGlobalPaused ? onResume : undefined}
                    transfers={transfers}
                    onRateChange={onRateChange}
                    colors={colors}
                    isFocused={isFocused}
                    subFocusIndex={subFocusIndex}
                    onSubFocusIndexChange={_onSubFocusIndexChange}
                    onFocus={onFocus}
                />
            </box>

            {/* Footer Stats */}
            <box flexDirection="column" gap={0} paddingLeft={1} paddingRight={1} marginTop={1}>
                <box flexDirection="row" gap={2} height={1}>
                    {progress.manifestStats ? (
                        <>
                            <text fg={colors.dim}>Rem: {String(progress.manifestStats.remoteFileCount)}</text>
                            <text fg={colors.dim}>Loc: {String(progress.manifestStats.localFileCount)}</text>
                            <text fg={colors.dim}>Mis: {String(progress.manifestStats.missingFileCount)}</text>
                        </>
                    ) : (
                        <text fg={colors.dim}>Files: {String(progress.filesTransferred || 0)}/{String(progress.totalFiles || "?")}</text>
                    )}
                </box>
                <box flexDirection="row" justifyContent="space-between" height={1}>
                    <text fg={colors.dim}>
                        {String(progress.transferSpeed || "0 B/s")} | {String(progress.eta || "--")}
                    </text>
                    {progress.manifestStats ? (
                        <text fg={colors.dim}>
                            {String(progress.filesTransferred || 0)}/{String(progress.totalFiles || 0)}
                        </text>
                    ) : null}
                </box>
            </box>
        </box>
    );
});
DownsyncPanel.displayName = "DownsyncPanel";

// --- LOCAL SHIELD PANEL ---
interface LocalShieldPanelProps {
    progress: SyncProgress;
    colors: ThemeColors;
    width: number;
    shieldEnabled: boolean;
    onPause?: () => void;
    onResume?: () => void;
    isFocused?: boolean;
    onFocus?: (keepSubFocus?: boolean) => void;
    height?: number;
    isRunning?: boolean;
    subFocusIndex?: number;
    onSubFocusIndexChange?: (index: number) => void;
}

export const LocalShieldPanel = React.memo(({
    progress,
    colors,
    width,
    shieldEnabled,
    onPause,
    onResume,
    isFocused = false,
    onFocus,
    height: _height = 12,
    isRunning: _isRunning = false,
    subFocusIndex = 0,
    onSubFocusIndexChange: _onSubFocusIndexChange
}: LocalShieldPanelProps) => {
    const isActive = progress.phase === "clean";
    const isGlobalPaused = progress.isPaused;

    const status: PanelStatus = !shieldEnabled ? "idle" :
        isGlobalPaused ? "paused" :
            isActive ? "active" :
                progress.phase === "pull" ? "waiting" :
                    (progress.phase === "cloud" || progress.phase === "done") ? "complete" : "idle";

    const stats = progress.cleanupStats;
    const panelHeight = _height;

    return (
        <box
            flexDirection="column"
            gap={0}
            border
            borderStyle="single"
            borderColor={isFocused ? colors.primary : (isActive ? colors.setup : colors.dim + "33")}
            title="[ LOCAL SHIELD ]"
            onMouseOver={() => onFocus?.(true)}
            onMouseDown={() => onFocus?.(true)}
            height={panelHeight}
            width={width}
        >
            <PanelHeader
                title="LOCAL SHIELD"
                status={status}
                accentColor={colors.setup}
                colors={colors}
                isFocused={isFocused}
            />

            {/* Shield Stats Body */}
            <box flexDirection="column" gap={0} marginTop={1} paddingLeft={1} paddingRight={1} flexGrow={1}>
                {/* Visual Status Indicator */}
                <box flexDirection="row" alignItems="center" gap={1} height={1} marginBottom={1}>
                    <text fg={status === 'active' ? colors.setup : (status === 'complete' ? colors.success : colors.dim)}>
                        {String(status === 'active' ? '\ueb72' : (status === 'complete' ? '\uf058' : '\ueb9c'))}
                    </text>
                    <text fg={colors.fg} attributes={TextAttributes.BOLD}>
                        {String(status === 'active' ? 'SWEEPING ARCHIVES' : (status === 'complete' ? 'PROTECTION VERIFIED' : 'SHIELD STANDBY'))}
                    </text>
                </box>

                <box flexDirection="row" justifyContent="space-between" height={1}>
                    <text fg={colors.dim}>Found:</text>
                    <text fg={colors.fg} attributes={TextAttributes.BOLD}>{String(stats?.totalArchives || 0)}</text>
                </box>

                <box flexDirection="column" gap={0} height={2} marginTop={1}>
                    <text fg={colors.dim}>Current Target:</text>
                    <text fg={status === 'active' ? colors.setup : colors.dim} attributes={status === 'active' ? TextAttributes.BOLD : 0}>
                        {String(stats?.currentArchive ? (stats.currentArchive.length > width - 4 ? '...' + stats.currentArchive.substring(stats.currentArchive.length - (width - 7)) : stats.currentArchive) : (status === 'complete' ? '--- ALL SYSTEMS CLEAN ---' : 'IDLE'))}
                    </text>
                </box>

                <box flexDirection="row" justifyContent="space-between" height={1} marginTop={1}>
                    <text fg={colors.dim}>Risky Patterns:</text>
                    <text fg={!!(stats?.riskyPatternCount && stats.riskyPatternCount > 0) ? colors.danger : colors.success} attributes={TextAttributes.BOLD}>
                        {String(stats?.riskyPatternCount || 0)}
                    </text>
                </box>

                <box flexDirection="row" justifyContent="space-between" height={1}>
                    <text fg={colors.dim}>Safely Extracted:</text>
                    <text fg={colors.success} attributes={TextAttributes.BOLD}>{String(stats?.extractedFiles || 0)}</text>
                </box>

                {(stats?.riskyPatternCount && stats.riskyPatternCount > 0) ? (
                    <box marginTop={1} padding={1} border borderStyle="single" borderColor={colors.danger} alignItems="center">
                        <text fg={colors.danger} attributes={TextAttributes.BOLD | TextAttributes.BLINK}>⚠️ {String(stats.riskyPatternCount)} THREATS NEUTRALIZED</text>
                    </box>
                ) : null}
            </box>

            {/* ACTION BAR (Bottom-docked) */}
            <box marginTop="auto">
                <PanelControls
                    onPause={(isActive && !isGlobalPaused) ? onPause : undefined}
                    onResume={isGlobalPaused ? onResume : undefined}
                    colors={colors}
                    isFocused={isFocused}
                    subFocusIndex={subFocusIndex}
                    onSubFocusIndexChange={_onSubFocusIndexChange}
                    onFocus={onFocus}
                />
            </box>

            {/* Footer Stats Row */}
            <box flexDirection="column" gap={0} paddingLeft={1} paddingRight={1} marginTop={1}>
                <box flexDirection="row" gap={2} height={1}>
                    <box flexDirection="row">
                        <text fg={colors.dim}>Spd: </text>
                        <text fg={colors.accent}>{String(progress.transferSpeed || "0 B/s")}</text>
                    </box>
                    <box flexDirection="row">
                        <text fg={colors.dim}>ETA: </text>
                        <text fg={colors.accent}>{String(progress.eta || "--")}</text>
                    </box>
                </box>
            </box>
        </box>
    );
});
LocalShieldPanel.displayName = "LocalShieldPanel";

// --- UPSYNC PANEL ---
interface UpsyncPanelProps {
    progress: SyncProgress;
    destType: string;
    colors: ThemeColors;
    width: number;
    upsyncEnabled: boolean;
    onPause?: () => void;
    onResume?: () => void;
    height?: number;
    maxFiles?: number;
    transfers?: 4 | 6 | 8;
    onRateChange?: (rate: 4 | 6 | 8) => void;
    isFocused?: boolean;
    onFocus?: (keepSubFocus?: boolean) => void;
    subFocusIndex?: number;
    onSubFocusIndexChange?: (index: number) => void;
}

export const UpsyncPanel = React.memo(({
    progress,
    destType,
    colors,
    width,
    upsyncEnabled,
    onPause,
    onResume,
    height = 10,
    maxFiles = 5,
    transfers = 4,
    onRateChange,
    isFocused = false,
    onFocus,
    subFocusIndex = 0,
    onSubFocusIndexChange
}: UpsyncPanelProps) => {
    const isActive = progress.phase === "cloud";
    const isGlobalPaused = progress.isPaused;

    const status: PanelStatus = !upsyncEnabled ? "idle" :
        isGlobalPaused ? "paused" :
            isActive ? "active" :
                (progress.phase === "pull" || progress.phase === "clean") ? "waiting" :
                    progress.phase === "done" ? "complete" : "idle";

    const uploadQueue = progress.uploadQueue || [];
    const panelHeight = height;
    const maxFilesToShow = maxFiles;
    const stats = progress.cloudStats;

    return (
        <box
            flexDirection="column"
            gap={0}
            border
            borderStyle="single"
            borderColor={isFocused ? colors.primary : (isActive ? colors.accent : colors.dim + "33")}
            title={`[ ${String(destType).toUpperCase()} ]`}
            onMouseOver={() => onFocus?.(true)}
            onMouseDown={() => onFocus?.(true)}
            height={panelHeight}
            width={width}
        >
            <PanelHeader
                title={`UPSYNC: ${destType}`}
                status={status}
                accentColor={colors.accent}
                colors={colors}
                isFocused={isFocused}
            />

            {/* UPLOAD QUEUE */}
            <box flexDirection="column" gap={0} marginTop={1}>
                <text fg={colors.dim} paddingLeft={1} attributes={TextAttributes.BOLD}>UPLOAD QUEUE</text>
                <FileQueue files={uploadQueue} colors={colors} maxHeight={maxFilesToShow} width={width} phase={progress.phase} />
            </box>

            {/* ACTION BAR (Bottom-docked) */}
            <box marginTop="auto">
                <PanelControls
                    onPause={(isActive && !isGlobalPaused) ? onPause : undefined}
                    onResume={isGlobalPaused ? onResume : undefined}
                    transfers={transfers}
                    onRateChange={onRateChange}
                    colors={colors}
                    isFocused={isFocused}
                    subFocusIndex={subFocusIndex}
                    onSubFocusIndexChange={onSubFocusIndexChange}
                    onFocus={onFocus}
                />
            </box>

            {/* Footer Stats Row */}
            <box flexDirection="column" gap={0} paddingLeft={1} paddingRight={1} marginTop={1}>
                <box flexDirection="row" gap={2} height={1}>
                    <text fg={colors.dim}>Sent: {String(stats?.updatedFiles || progress.filesTransferred || 0)}</text>
                    <box flexDirection="row">
                        <text fg={colors.dim}>Spd: </text>
                        <text fg={colors.accent}>{String(progress.transferSpeed || "0 B/s")}</text>
                    </box>
                    <box flexDirection="row">
                        <text fg={colors.dim}>ETA: </text>
                        <text fg={colors.accent}>{String(progress.eta || "--")}</text>
                    </box>
                </box>
            </box>
        </box>
    );
});
UpsyncPanel.displayName = "UpsyncPanel";
