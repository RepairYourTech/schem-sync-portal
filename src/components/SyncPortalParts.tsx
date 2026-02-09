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

export interface PanelHeaderProps {
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
    width: number;
    isFocused?: boolean;
    subFocusIndex?: number;
    onSubFocusIndexChange?: (index: number) => void;
}

const PerformanceSelector = React.memo(({ current, onRateChange, colors, width, isFocused, subFocusIndex, onSubFocusIndexChange, onFocus }: PerformanceSelectorProps & { onFocus?: (keepSubFocus?: boolean) => void }) => {
    useKeyboard((key) => {
        if (!isFocused) return;
        if (key.name === "4") onRateChange(4);
        if (key.name === "6") onRateChange(6);
        if (key.name === "8") onRateChange(8);
    });

    const isCompact = width < 38;

    return (
        <>
            <box flexDirection="row" alignItems="center" flexShrink={0} marginLeft={1}>
                <text fg={colors.fg}>{isCompact ? "SPD:" : "SPEED:"} </text>
                {!isCompact && <text fg={colors.fg} marginLeft={1}>{String(current)}</text>}
            </box>
            <box
                onMouseOver={() => { if (onFocus) onFocus(true); if (onSubFocusIndexChange) onSubFocusIndexChange(1); }}
                onMouseDown={() => {
                    onRateChange(4);
                    if (onFocus) onFocus(true);
                    if (onSubFocusIndexChange) onSubFocusIndexChange(1);
                }}
                paddingLeft={1}
                paddingRight={1}
                flexShrink={0}
                flexDirection="row"
                border={!!(isFocused && subFocusIndex === 1) || current === 4}
                borderStyle="single"
                borderColor={!!(isFocused && subFocusIndex === 1) ? colors.success : (current === 4 ? colors.primary : "transparent")}
                alignSelf="flex-start"
            >
                <Hotkey keyLabel="4" isFocused={!!(isFocused && subFocusIndex === 1)} hardened={true} />
            </box>
            <box
                onMouseOver={() => { if (onFocus) onFocus(true); if (onSubFocusIndexChange) onSubFocusIndexChange(2); }}
                onMouseDown={() => {
                    onRateChange(6);
                    if (onFocus) onFocus(true);
                    if (onSubFocusIndexChange) onSubFocusIndexChange(2);
                }}
                paddingLeft={1}
                paddingRight={1}
                flexShrink={0}
                flexDirection="row"
                border={!!(isFocused && subFocusIndex === 2) || current === 6}
                borderStyle="single"
                borderColor={!!(isFocused && subFocusIndex === 2) ? colors.success : (current === 6 ? colors.primary : "transparent")}
                alignSelf="flex-start"
            >
                <Hotkey keyLabel="6" isFocused={!!(isFocused && subFocusIndex === 2)} hardened={true} />
            </box>
            <box
                onMouseOver={() => { if (onFocus) onFocus(true); if (onSubFocusIndexChange) onSubFocusIndexChange(3); }}
                onMouseDown={() => {
                    onRateChange(8);
                    if (onFocus) onFocus(true);
                    if (onSubFocusIndexChange) onSubFocusIndexChange(3);
                }}
                paddingLeft={1}
                paddingRight={1}
                flexShrink={0}
                flexDirection="row"
                border={!!(isFocused && subFocusIndex === 3) || current === 8}
                borderStyle="single"
                borderColor={!!(isFocused && subFocusIndex === 3) ? colors.success : (current === 8 ? colors.primary : "transparent")}
                alignSelf="flex-start"
            >
                <Hotkey keyLabel="8" isFocused={!!(isFocused && subFocusIndex === 3)} hardened={true} />
            </box>
        </>
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
    width: number;
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
    onFocus,
    width
}: PanelControlsProps) => {
    const isActionFocused = isFocused && subFocusIndex === 0;

    return (
        <box flexDirection="row" gap={1} alignItems="flex-start" flexShrink={0}>
            {/* Pause/Resume Action */}
            <box
                flexDirection="row"
                onMouseOver={() => {
                    if (onFocus) onFocus(true);
                    if (onSubFocusIndexChange) onSubFocusIndexChange(0);
                }}
                onMouseDown={() => {
                    // Trigger immediately AND focus
                    (onPause || onResume)?.();
                    if (onFocus) onFocus(true);
                    if (onSubFocusIndexChange) onSubFocusIndexChange(0);
                }}
                paddingLeft={1}
                paddingRight={1}
                flexShrink={0}
                border={isActionFocused}
                borderStyle="single"
                borderColor={isActionFocused ? colors.success : "transparent"}
                alignSelf="flex-start"
            >
                {onPause ? <Hotkey keyLabel="p" label="PAUSE" isFocused={isActionFocused} hardened={true} /> : null}
                {onResume ? <Hotkey keyLabel="r" label="RESUME" isFocused={isActionFocused} color={colors.success} hardened={true} /> : null}
                {!onPause && !onResume ? <text fg={colors.dim} flexShrink={0}>[ READY ]</text> : null}
            </box>

            {onRateChange ? (
                <PerformanceSelector
                    current={transfers || 4}
                    onRateChange={onRateChange}
                    colors={colors}
                    width={width}
                    isFocused={isFocused}
                    subFocusIndex={subFocusIndex}
                    onSubFocusIndexChange={onSubFocusIndexChange}
                    onFocus={onFocus}
                />
            ) : null}
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
            <box flexDirection="row" gap={1} flexShrink={1}>
                <text fg={isFocused ? colors!.primary : colors!.dim} flexShrink={0}>{String(isFocused ? "▶" : " ")}</text>
                <text fg={isFocused ? colors!.primary : accentColor!} attributes={TextAttributes.BOLD} flexShrink={1}>
                    {String(title)}
                </text>
            </box>
            <text fg={statusDisplay.color} attributes={TextAttributes.BOLD} flexShrink={0}>
                {String(statusDisplay.icon)} {String(statusDisplay.text)}
            </text>
        </box>
    );
});
PanelHeader.displayName = "PanelHeader";

export const getStatusDisplayIcon = getStatusDisplay;

// --- FILE QUEUE ---
interface FileQueueProps {
    files: FileTransferItem[];
    colors: ThemeColors;
    maxHeight: number;
    width: number;
    phase?: SyncProgress["phase"];
    isUpsync?: boolean;
}

export const FileQueue = React.memo(({ files, colors, maxHeight, width, phase, isUpsync }: FileQueueProps) => {
    if (files.length === 0) {
        // Show initializing state during active pull phase
        if (phase === "pull" || phase === "syncing" || phase === "clean") {
            const msg = (phase === "pull") ? "Waiting for rclone data..." :
                (isUpsync ? "Waiting for shield..." : "Waiting for rclone...");
            return (
                <box paddingLeft={2} paddingTop={1} height={maxHeight}>
                    <text fg={colors.dim}>{String(msg)}</text>
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
                        <text fg={isItemDone ? colors.success : colors.dim} flexShrink={0}>{String(isItemDone ? "✓" : "→")}</text>
                        <text fg={colors.fg} flexShrink={1}> {String(displayName)}</text>
                        <box flexShrink={0} marginLeft={1}>
                            <text fg={colors.dim}>{String(f.percentage || 0)}%</text>
                        </box>
                    </box>
                );
            })}
        </box>
    );
});
FileQueue.displayName = "FileQueue";

// Re-export modular panels to preserve legacy API
export { DownsyncPanel } from "./panels/DownsyncPanel";
export { LocalShieldPanel } from "./panels/LocalShieldPanel";
export { UpsyncPanel } from "./panels/UpsyncPanel";

