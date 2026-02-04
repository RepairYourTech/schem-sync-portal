/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import type { SyncProgress } from "../../lib/sync";
import {
    PanelHeader,
    PanelControls,
    FileQueue,
    type ThemeColors,
    type PanelStatus
} from "../SyncPortalParts";

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
            borderColor={isFocused ? colors.success : "transparent"}
            title={`[ ${String(destType).toUpperCase()} ]`}
            onMouseOver={() => onFocus?.(true)}
            onMouseDown={(e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                if (e.currentTarget === e.target) {
                    onFocus?.(false);
                }
            }}
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
