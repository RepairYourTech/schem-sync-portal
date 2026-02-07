/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { formatBytes } from "../../lib/sync/utils";
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
    isPhasePaused?: (phase: 'pull' | 'shield' | 'cloud') => boolean;
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
    isPhasePaused,
    height: _height = 10,
    maxFiles = 5,
    transfers = 4,
    onRateChange,
    isFocused = false,
    onFocus,
    subFocusIndex = 0,
    onSubFocusIndexChange
}: UpsyncPanelProps) => {
    const isActive = progress.phase !== "done" && progress.phase !== "error";
    const isGlobalPaused = progress.isPaused;
    const isCloudPaused = isPhasePaused?.('cloud') ?? isGlobalPaused;
    const isShieldPaused = isPhasePaused?.('shield') ?? false;

    const status: PanelStatus = !upsyncEnabled ? "idle" :
        isShieldPaused ? "blocked" :
            isCloudPaused ? "paused" :
                isActive ? "active" :
                    (progress.phase === "pull" || progress.phase === "clean") ? "waiting" :
                        progress.phase === "done" ? "complete" : "idle";

    const uploadQueue = progress.uploadQueue || [];
    const maxFilesToShow = maxFiles;

    return (
        <box
            flexDirection="column"
            gap={0}
            border
            borderStyle="single"
            borderColor={isFocused ? colors.success : "transparent"}
            title={destType}
            onMouseOver={() => onFocus?.(true)}
            onMouseDown={(e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                if (!e || e.currentTarget === e.target) {
                    onFocus?.(false);
                }
            }}
            width={width}
            height={_height}
            overflow="hidden"
        >
            <PanelHeader
                title={`Backup: ${destType}`}
                status={status}
                accentColor={colors.accent}
                colors={colors}
                isFocused={isFocused}
            />

            {/* UPLOAD QUEUE AREA (Scrollable) */}
            <box flexDirection="column" gap={0} marginTop={1} flexGrow={1} overflow="hidden">
                <text fg={colors.dim} paddingLeft={1} attributes={TextAttributes.BOLD}>UPLOAD QUEUE</text>
                <FileQueue files={uploadQueue} colors={colors} maxHeight={maxFilesToShow} width={width} phase={progress.phase} isUpsync={true} />
            </box>

            {/* FIXED FOOTER (Controls + Stats) */}
            <box flexDirection="column" gap={0} flexShrink={0} marginTop="auto">
                {/* ACTION BAR */}
                <PanelControls
                    onPause={(isActive && !isCloudPaused) ? onPause : undefined}
                    onResume={isCloudPaused ? onResume : undefined}
                    transfers={transfers}
                    onRateChange={onRateChange}
                    colors={colors}
                    width={width}
                    isFocused={isFocused}
                    subFocusIndex={subFocusIndex}
                    onSubFocusIndexChange={onSubFocusIndexChange}
                    onFocus={onFocus}
                />

                {/* Footer Stats Row */}
                <box flexDirection="column" gap={0} paddingLeft={1} paddingRight={1} marginTop={1}>
                    <box flexDirection="column" gap={0}>
                        <box flexDirection="row" gap={2} height={1}>
                            <box flexDirection="row">
                                <text fg={colors.dim}>Sent: </text>
                                <text fg={colors.accent}>
                                    {String(progress.uploadStats?.bytesTransferred ||
                                        (progress.uploadStats?.rawBytesTransferred !== undefined ?
                                            `${formatBytes(progress.uploadStats.rawBytesTransferred)}/${formatBytes(progress.uploadStats.rawTotalBytes || 0)}` :
                                            `${progress.filesTransferred || 0}/${progress.totalFiles || 0}`))}
                                </text>
                            </box>
                            <box flexDirection="row">
                                <text fg={colors.dim}>Spd: </text>
                                <text fg={colors.accent}>{String(progress.uploadStats?.transferSpeed || progress.transferSpeed || "0 B/s")}</text>
                            </box>
                            <box flexDirection="row">
                                <text fg={colors.dim}>ETA: </text>
                                <text fg={colors.accent}>{String(progress.uploadStats?.eta || progress.eta || "--")}</text>
                            </box>
                        </box>

                        {!!isActive && (
                            <box flexDirection="row" gap={2} height={1}>
                                <box flexDirection="row">
                                    <text fg={colors.dim}>Dest: </text>
                                    <text fg={colors.accent}>{String(destType)}</text>
                                </box>
                            </box>
                        )}
                    </box>
                </box>
            </box>
        </box>
    );
});
UpsyncPanel.displayName = "UpsyncPanel";
