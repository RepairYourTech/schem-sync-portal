import React from "react";
import { TextAttributes } from "@opentui/core";
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
        <text fg={colors.fg} attributes={TextAttributes.BOLD}>{provider} STATUS</text>
        <box flexDirection="row" gap={2}>
            <text fg={colors.fg}>Total: {stats.totalFiles}</text>
            <text fg={colors.primary}>Updated: {stats.updatedFiles}</text>
            <text fg={colors.danger}>Deleted: {stats.deletedFiles}</text>
        </box>
        {provider === "GDRIVE" && (
            <text fg={colors.dim} attributes={TextAttributes.ITALIC}>Trash: Disabled (Secure Wipe)</text>
        )}
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
    onPause?: () => void;
    onResume?: () => void;
    subFocusIndex?: number;
    onSubFocusIndexChange?: (index: number) => void;
}

const getStatusDisplay = (status: PanelStatus, colors: ThemeColors): { icon: string; text: string; color: string } => {
    switch (status) {
        case "active": return { icon: "▶", text: "RUNNING", color: colors.success };
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
}

const PerformanceSelector = React.memo(({ current, onRateChange, colors, isFocused, subFocusIndex }: PerformanceSelectorProps) => {
    return (
        <box flexDirection="row" gap={1} paddingLeft={1} paddingRight={1} alignItems="center">
            <text fg={colors.dim}>SPEED: </text>
            <box
                onMouseDown={() => onRateChange(4)}
                paddingLeft={1}
                paddingRight={1}
                border={isFocused && subFocusIndex === 1}
                borderStyle="single"
                borderColor={(isFocused && subFocusIndex === 1) ? colors.success : "transparent"}
            >
                <Hotkey keyLabel="4" color={current === 4 ? colors.success : undefined} isFocused={isFocused && subFocusIndex === 1} />
            </box>
            <box
                onMouseDown={() => onRateChange(6)}
                paddingLeft={1}
                paddingRight={1}
                border={isFocused && subFocusIndex === 2}
                borderStyle="single"
                borderColor={(isFocused && subFocusIndex === 2) ? colors.success : "transparent"}
            >
                <Hotkey keyLabel="6" color={current === 6 ? colors.success : undefined} isFocused={isFocused && subFocusIndex === 2} />
            </box>
            <box
                onMouseDown={() => onRateChange(8)}
                paddingLeft={1}
                paddingRight={1}
                border={isFocused && subFocusIndex === 3}
                borderStyle="single"
                borderColor={(isFocused && subFocusIndex === 3) ? colors.success : "transparent"}
            >
                <Hotkey keyLabel="8" color={current === 8 ? colors.success : undefined} isFocused={isFocused && subFocusIndex === 3} />
            </box>
        </box>
    );
});
PerformanceSelector.displayName = "PerformanceSelector";

export const PanelHeader = React.memo(({
    title,
    status,
    percentage,
    accentColor,
    colors,
    onPause,
    onResume,
    transfers = 4,
    onRateChange,
    isFocused = false,
    subFocusIndex
}: PanelHeaderProps & { transfers?: 4 | 6 | 8; onRateChange?: (rate: 4 | 6 | 8) => void; isFocused?: boolean }) => {
    const statusDisplay = getStatusDisplay(status, colors);
    const barWidth = 20;
    const filled = percentage !== undefined ? Math.round((percentage / 100) * barWidth) : 0;
    const progressBar = percentage !== undefined
        ? `[${"█".repeat(filled)}${"░".repeat(barWidth - filled)}] ${percentage}%`
        : "";

    const isPauseResumeFocused = isFocused && subFocusIndex === 0;

    return (
        <box flexDirection="column" gap={0}>
            {/* Row 1: Title and Status */}
            <box flexDirection="row" justifyContent="space-between" alignItems="center" paddingLeft={1} paddingRight={1} height={1}>
                <text fg={isFocused ? colors.fg : accentColor} attributes={TextAttributes.BOLD}>
                    {isFocused ? "▶ " : "◈ "}{title}
                </text>
                <text fg={statusDisplay.color} attributes={TextAttributes.BOLD}>
                    {statusDisplay.icon} {statusDisplay.text}
                </text>
            </box>

            {/* Row 2: Controls and Phase Progress */}
            <box flexDirection="row" justifyContent="space-between" alignItems="center" paddingLeft={1} paddingRight={1} height={1}>
                <box flexDirection="row" gap={1}>
                    {(onPause || onResume) && (
                        <box
                            onMouseDown={onResume || onPause}
                            border={isPauseResumeFocused}
                            borderStyle="single"
                            borderColor={isPauseResumeFocused ? colors.success : "transparent"}
                            paddingLeft={1}
                            paddingRight={1}
                        >
                            {onPause && <Hotkey keyLabel="P" label="Pause" isFocused={isPauseResumeFocused} />}
                            {onResume && <Hotkey keyLabel="R" label="Resume" isFocused={isPauseResumeFocused} color={colors.success} />}
                        </box>
                    )}
                </box>
                {progressBar && <text fg={isFocused ? colors.fg : colors.dim}>{progressBar}</text>}
            </box>

            {/* Row 3: Performance Selector */}
            {onRateChange && (
                <box height={1}>
                    <PerformanceSelector
                        current={transfers}
                        onRateChange={onRateChange}
                        colors={colors}
                        isFocused={isFocused}
                        subFocusIndex={subFocusIndex}
                    />
                </box>
            )}
        </box>
    );
});
PanelHeader.displayName = "PanelHeader";

// --- FILE QUEUE ---
interface FileQueueProps {
    files: FileTransferItem[];
    colors: ThemeColors;
    maxHeight: number;
}

export const FileQueue = React.memo(({ files, colors, maxHeight }: FileQueueProps) => {
    if (files.length === 0) {
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
                return (
                    <box key={`${f.filename}-${i}`} flexDirection="row" justifyContent="space-between" height={1}>
                        <text fg={isItemDone ? colors.success : colors.fg}>
                            {isItemDone ? "✓" : "→"} {f.filename.length > 40 ? f.filename.substring(0, 37) + "..." : f.filename}
                        </text>
                        <text fg={colors.dim}>{f.percentage || 0}%</text>
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
    onFocus?: () => void;
    subFocusIndex?: number;
    onSubFocusIndexChange?: (index: number) => void;
}

export const DownsyncPanel = React.memo(({
    progress,
    sourceType,
    colors,
    width: _width,
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
    const displayPercentage = isActive ? progress.percentage : undefined;

    return (
        <box
            flexDirection="column"
            gap={0}
            border
            borderStyle="single"
            borderColor={isFocused ? colors.fg : (isActive ? colors.primary : colors.border)}
            onMouseDown={onFocus}
            height={panelHeight}
        >
            <PanelHeader
                title={`DOWNSYNC: ${sourceType}`}
                status={status}
                percentage={displayPercentage}
                accentColor={colors.primary}
                colors={colors}
                onPause={(isActive && !isGlobalPaused) ? onPause : undefined}
                onResume={isGlobalPaused ? onResume : undefined}
                transfers={transfers}
                onRateChange={onRateChange}
                isFocused={isFocused}
                subFocusIndex={subFocusIndex}
            />

            <box flexDirection="column" gap={0} marginTop={1} flexGrow={1}>
                <text fg={colors.dim} paddingLeft={1} attributes={TextAttributes.BOLD}>DOWNLOAD QUEUE</text>
                <FileQueue files={downloadQueue} colors={colors} maxHeight={maxFilesToShow} />
            </box>

            {/* Footer Stats */}
            <box flexDirection="column" gap={0} paddingLeft={1} paddingRight={1}>
                {progress.manifestStats && (
                    <box flexDirection="row" gap={2} height={1}>
                        <text fg={colors.dim}>Remote: {progress.manifestStats.remoteFileCount}</text>
                        <text fg={colors.dim}>Local: {progress.manifestStats.localFileCount}</text>
                        <text fg={colors.dim}>Missing: {progress.manifestStats.missingFileCount}</text>
                    </box>
                )}
                <box flexDirection="row" justifyContent="space-between" height={1}>
                    <text fg={colors.dim}>
                        {progress.transferSpeed || "0 B/s"} | ETA: {progress.eta || "--"}
                    </text>
                    <text fg={colors.dim}>
                        {progress.filesTransferred || 0}/{progress.totalFiles || 0} files
                    </text>
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
    onFocus?: () => void;
    height?: number;
    isRunning?: boolean;
    subFocusIndex?: number;
    onSubFocusIndexChange?: (index: number) => void;
}

export const LocalShieldPanel = React.memo(({
    progress,
    colors,
    width: _width,
    shieldEnabled,
    onPause,
    onResume,
    isFocused = false,
    onFocus,
    height = 12,
    isRunning = false,
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

    const displayPercentage = isActive ? progress.percentage : undefined;
    const stats = progress.cleanupStats;

    return (
        <box
            flexDirection="column"
            gap={0}
            border
            borderStyle="single"
            borderColor={isFocused ? colors.fg : (isActive ? colors.setup : colors.border)}
            onMouseDown={onFocus}
            height={isActive || isRunning ? height : 12}
        >
            <PanelHeader
                title="LOCAL SHIELD"
                status={status}
                percentage={displayPercentage}
                accentColor={colors.setup}
                colors={colors}
                onPause={(isActive && !isGlobalPaused) ? onPause : undefined}
                onResume={isGlobalPaused ? onResume : undefined}
                isFocused={isFocused}
                subFocusIndex={subFocusIndex}
            />

            {/* Shield Stats */}
            <box flexDirection="column" gap={0} marginTop={1} paddingLeft={1} paddingRight={1}>
                <box flexDirection="row" justifyContent="space-between">
                    <text fg={colors.fg}>Archives Found:</text>
                    <text fg={colors.primary}>{stats?.totalArchives || 0}</text>
                </box>
                <box flexDirection="row" justifyContent="space-between">
                    <text fg={colors.fg}>Scanning:</text>
                    <text fg={colors.warning}>{stats?.currentArchive ? (stats.currentArchive.length > 30 ? stats.currentArchive.substring(0, 27) + "..." : stats.currentArchive) : "READY"}</text>
                </box>
                <box flexDirection="row" justifyContent="space-between">
                    <text fg={colors.fg}>Flagged:</text>
                    <text fg={colors.danger} attributes={(stats?.riskyPatternCount && stats.riskyPatternCount > 0) ? TextAttributes.BOLD : undefined}>
                        {stats?.riskyPatternCount || 0}
                    </text>
                </box>
            </box>

            {isActive && stats?.riskyPatternCount && stats.riskyPatternCount > 0 && (
                <box marginTop={1} paddingLeft={1}>
                    <text fg={colors.danger} attributes={TextAttributes.BLINK}>⚠️ THREATS DETECTED</text>
                </box>
            )}
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
    onFocus?: () => void;
    subFocusIndex?: number;
    onSubFocusIndexChange?: (index: number) => void;
}

export const UpsyncPanel = React.memo(({
    progress,
    destType,
    colors,
    width: _width,
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
    onSubFocusIndexChange: _onSubFocusIndexChange
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
    const displayPercentage = isActive ? progress.percentage : undefined;
    const stats = progress.cloudStats;

    return (
        <box
            flexDirection="column"
            gap={0}
            border
            borderStyle="single"
            borderColor={isFocused ? colors.fg : (isActive ? colors.accent : colors.border)}
            onMouseDown={onFocus}
            height={panelHeight}
        >
            <PanelHeader
                title={`UPSYNC: ${destType}`}
                status={status}
                percentage={displayPercentage}
                accentColor={colors.accent}
                colors={colors}
                onPause={(isActive && !isGlobalPaused) ? onPause : undefined}
                onResume={isGlobalPaused ? onResume : undefined}
                transfers={transfers}
                onRateChange={onRateChange}
                isFocused={isFocused}
                subFocusIndex={subFocusIndex}
            />

            <box flexDirection="column" gap={0} marginTop={1} flexGrow={1}>
                <text fg={colors.dim} paddingLeft={1} attributes={TextAttributes.BOLD}>UPLOAD QUEUE</text>
                <FileQueue files={uploadQueue} colors={colors} maxHeight={maxFilesToShow} />
            </box>

            {/* Cloud Stats Row */}
            <box flexDirection="row" gap={2} paddingLeft={1} paddingRight={1} height={1}>
                <text fg={colors.dim}>Sent: {stats?.updatedFiles || progress.filesTransferred || 0}</text>
                <text fg={colors.dim}>Speed: {progress.transferSpeed || "0 B/s"}</text>
            </box>
        </box>
    );
});
UpsyncPanel.displayName = "UpsyncPanel";
