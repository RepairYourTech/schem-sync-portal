/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import type { SyncProgress } from "../../lib/sync";
import {
    PanelHeader,
    PanelControls,
    type ThemeColors,
    type PanelStatus
} from "../SyncPortalParts";

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
    const isActive = progress.phase !== "done" && progress.phase !== "error";
    const isGlobalPaused = progress.isPaused;

    const status: PanelStatus = !shieldEnabled ? "idle" :
        isGlobalPaused ? "paused" :
            isActive ? "active" :
                progress.phase === "pull" ? "waiting" :
                    (progress.phase === "cloud" || progress.phase === "done") ? "complete" : "idle";

    const stats = progress.cleanupStats;

    return (
        <box
            flexDirection="column"
            gap={0}
            border
            borderStyle="single"
            borderColor={isFocused ? colors.success : "transparent"}
            title="[ LOCAL SHIELD ]"
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
                title="LOCAL SHIELD"
                status={status}
                accentColor={colors.setup}
                colors={colors}
                isFocused={isFocused}
            />

            {/* Shield Stats Body */}
            <box flexDirection="column" gap={0} marginTop={1} flexGrow={1} flexShrink={1}>
                {/* Visual Status Indicator */}
                <box flexDirection="row" alignItems="center" gap={1} height={1} paddingLeft={1} paddingRight={1}>
                    <text fg={status === 'active' ? colors.setup : (status === 'complete' ? colors.success : colors.dim)} flexShrink={0}>
                        {String(status === 'active' ? '\ueb72' : (status === 'complete' ? '\uf058' : '\ueb9c'))}
                    </text>
                    <box flexShrink={1}>
                        <text fg={colors.fg} attributes={TextAttributes.BOLD}>
                            {String((() => {
                                const text = status === 'active' ? 'SWEEPING' : (status === 'complete' ? 'VERIFIED' : 'STANDBY');
                                return text.length > width - 6 ? text.substring(0, width - 9) + '...' : text;
                            })())}
                        </text>
                    </box>
                </box>

                <box flexDirection="row" justifyContent="space-between" height={1} paddingLeft={1} paddingRight={1}>
                    <box flexDirection="row" gap={1}>
                        <text fg={colors.dim}>Found:</text>
                        <text fg={colors.fg} attributes={TextAttributes.BOLD}>{String(stats?.totalArchives || 0)}</text>
                    </box>
                    <box flexDirection="row" gap={1}>
                        <text fg={colors.dim}>Threats:</text>
                        <text fg={!!(stats?.riskyPatternCount && stats.riskyPatternCount > 0) ? colors.danger : colors.success} attributes={TextAttributes.BOLD}>
                            {String(stats?.riskyPatternCount || 0)}
                        </text>
                    </box>
                </box>

                <box flexDirection="row" justifyContent="space-between" height={1} paddingLeft={1} paddingRight={1}>
                    <text fg={colors.dim} flexShrink={0}>Target:</text>
                    <box flexShrink={1}>
                        <text fg={status === 'active' ? colors.setup : colors.dim} attributes={status === 'active' ? TextAttributes.BOLD : 0}>
                            {String(stats?.currentArchive ? (stats.currentArchive.length > width - 12 ? '...' + stats.currentArchive.substring(stats.currentArchive.length - (width - 15)) : stats.currentArchive) : (status === 'complete' ? 'CLEAN' : 'IDLE'))}
                        </text>
                    </box>
                </box>

                <box flexDirection="row" justifyContent="space-between" height={1} paddingLeft={1} paddingRight={1}>
                    <box flexDirection="row" gap={1}>
                        <text fg={colors.dim}>Cleaned:</text>
                        <text fg={colors.success} attributes={TextAttributes.BOLD}>{String(stats?.extractedFiles || 0)}</text>
                    </box>
                    {!!(stats?.riskyPatternCount && stats.riskyPatternCount > 0) ? (
                        <text fg={colors.danger} attributes={TextAttributes.BOLD}>[ {String(stats.riskyPatternCount)} ]</text>
                    ) : null}
                </box>

            </box>

            {/* ACTION BAR (Bottom-docked) */}
            <box marginTop="auto" flexShrink={0}>
                <PanelControls
                    onPause={(isActive && !isGlobalPaused) ? onPause : undefined}
                    onResume={isGlobalPaused ? onResume : undefined}
                    colors={colors}
                    width={width}
                    isFocused={isFocused}
                    subFocusIndex={subFocusIndex}
                    onSubFocusIndexChange={_onSubFocusIndexChange}
                    onFocus={onFocus}
                />
            </box>
        </box>
    );
});
LocalShieldPanel.displayName = "LocalShieldPanel";
