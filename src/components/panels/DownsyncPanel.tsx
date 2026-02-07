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

interface DownsyncPanelProps {
    progress: SyncProgress;
    sourceType: string;
    colors: ThemeColors;
    width: number;
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

export const DownsyncPanel = React.memo(({
    progress,
    sourceType,
    colors,
    width,
    onPause,
    onResume,
    height: _height = 10,
    maxFiles = 5,
    transfers = 4,
    onRateChange,
    isFocused = false,
    onFocus,
    subFocusIndex = 0,
    onSubFocusIndexChange: _onSubFocusIndexChange,
    isPhasePaused
}: DownsyncPanelProps) => {
    const isActive = progress.phase !== "done" && progress.phase !== "error";
    const isGlobalPaused = progress.isPaused;

    const isPullPaused = isPhasePaused?.('pull') ?? isGlobalPaused;
    const status: PanelStatus = isPullPaused ? "paused" :
        isActive ? "active" :
            (progress.phase === "cloud" || progress.phase === "done" || progress.phase === "clean") ? "complete" : "idle";

    const downloadQueue = progress.downloadQueue || [];
    const maxFilesToShow = maxFiles;

    return (
        <box
            flexDirection="column"
            gap={0}
            border
            borderStyle="single"
            borderColor={isFocused ? colors.success : "transparent"}
            title={sourceType}
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
                title={`Source: ${sourceType}`}
                status={status}
                accentColor={colors.primary}
                colors={colors}
                isFocused={isFocused}
            />

            {/* DOWNLOAD QUEUE AREA (Scrollable) */}
            <box flexDirection="column" gap={0} marginTop={1} flexGrow={1} overflow="hidden">
                <text fg={colors.dim} paddingLeft={1} attributes={TextAttributes.BOLD}>DOWNLOAD QUEUE</text>
                <FileQueue files={downloadQueue} colors={colors} maxHeight={maxFilesToShow} width={width} phase={progress.phase} isUpsync={false} />
            </box>

            {/* FIXED FOOTER (Controls + Stats) */}
            <box flexDirection="column" gap={0} flexShrink={0} marginTop="auto">
                {/* ACTION BAR */}
                <PanelControls
                    onPause={(isActive && !isPullPaused) ? onPause : undefined}
                    onResume={isPullPaused ? onResume : undefined}
                    transfers={transfers}
                    onRateChange={onRateChange}
                    colors={colors}
                    width={width}
                    isFocused={isFocused}
                    subFocusIndex={subFocusIndex}
                    onSubFocusIndexChange={_onSubFocusIndexChange}
                    onFocus={onFocus}
                />

                {/* Footer Stats */}
                <box flexDirection="column" gap={0} paddingLeft={1} paddingRight={1} marginTop={1}>
                    <box flexDirection="column" gap={0}>
                        {!!progress.manifestStats && (
                            <box flexDirection="row" gap={2} height={1}>
                                <box flexDirection="row">
                                    <text fg={colors.dim}>Rem: </text>
                                    <text fg={colors.accent}>{String(progress.manifestStats.remoteFileCount)}</text>
                                </box>
                                <box flexDirection="row">
                                    <text fg={colors.dim}>Loc: </text>
                                    <text fg={colors.accent}>{String(progress.manifestStats.localFileCount)}</text>
                                </box>
                                <box flexDirection="row">
                                    <text fg={colors.dim}>Mis: </text>
                                    <text fg={colors.accent}>{String(progress.manifestStats.missingFileCount)}</text>
                                </box>
                                {!!progress.manifestStats.leanModeActive ? (
                                    <box flexDirection="row" marginLeft={1}>
                                        <text fg={colors.success} attributes={TextAttributes.BOLD}>[LEAN]</text>
                                    </box>
                                ) : null}
                            </box>
                        )}
                        <box flexDirection="row" gap={2} height={1}>
                            <box flexDirection="row">
                                <text fg={colors.dim}>Recv: </text>
                                <text fg={colors.accent}>
                                    {String(progress.downloadStats?.bytesTransferred ||
                                        (progress.downloadStats?.rawBytesTransferred !== undefined ?
                                            `${formatBytes(progress.downloadStats.rawBytesTransferred)}/${formatBytes(progress.downloadStats.rawTotalBytes || 0)}` :
                                            `${progress.filesTransferred || 0}/${progress.totalFiles || 0}`))}
                                </text>
                            </box>
                            <box flexDirection="row">
                                <text fg={colors.dim}>Spd: </text>
                                <text fg={colors.accent}>{String(progress.downloadStats?.transferSpeed || progress.transferSpeed || "0 B/s")}</text>
                            </box>
                            <box flexDirection="row">
                                <text fg={colors.dim}>ETA: </text>
                                <text fg={colors.accent}>{String(progress.downloadStats?.eta || progress.eta || "--")}</text>
                            </box>
                        </box>
                    </box>
                </box>
            </box>
        </box>
    );
});
DownsyncPanel.displayName = "DownsyncPanel";
