import React, { useMemo } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { type PortalConfig } from "../lib/config";
import type { SyncProgress } from "../lib/sync";
import { useTheme } from "../lib/theme";
import { Hotkey } from "./Hotkey";

interface SyncPortalProps {
    config: PortalConfig;
    progress: SyncProgress;
    isRunning: boolean;
    onStop: () => void;
    onStart: () => void;
    configLoaded: boolean;
    focusArea: "body" | "footer";
    onFocusChange: (area: "body" | "footer") => void;
}

export function SyncPortal({ config, progress, isRunning, onStop, onStart, configLoaded, focusArea, onFocusChange }: SyncPortalProps) {
    const { width } = useTerminalDimensions();
    const { colors } = useTheme();

    // ... (rest of logic stays same)
    const isPull = progress.phase === "pull";
    const isClean = progress.phase === "clean";
    const isCloud = progress.phase === "cloud";
    const isError = progress.phase === "error";
    const isDone = progress.phase === "done";

    // Progress Bar Logic (Global)
    const progressBarWidth = useMemo(() => Math.max(20, Math.min(width - 30, 80)), [width]);
    const completedWidth = Math.round((progress.percentage / 100) * progressBarWidth);
    const remainingWidth = progressBarWidth - completedWidth;

    const barColor = useMemo(() => {
        if (isError) return colors.danger;
        if (isDone) return colors.success;
        if (isCloud) return colors.accent;
        if (isClean) return colors.setup;
        return colors.primary;
    }, [isError, isDone, isCloud, isClean, colors]);

    // Dynamic Labels from Config (One SSoT)
    const showSource = config.source_provider !== "none";
    const showDest = config.upsync_enabled && config.backup_provider !== "none";

    const sourceType = config.source_provider === "copyparty" ? "CopyParty" : (config.source_provider?.toUpperCase() || "SOURCE");
    const destType = config.backup_provider?.toUpperCase() || "BACKUP";

    const isBodyFocused = focusArea === "body";

    return (
        <box flexDirection="column" padding={1} gap={1} width="100%">

            {/* === PIPELINE STATUS === */}
            <box flexDirection="row" gap={1} justifyContent="center" alignItems="center" height={8} border borderStyle="single" borderColor={barColor}>
                {showSource && (
                    <box flexDirection="column" width={24} padding={1} alignItems="center" gap={1} borderColor={isPull ? colors.primary : colors.dim} border borderStyle={isPull ? "double" : "single"}>
                        <text attributes={TextAttributes.BOLD} fg={isPull ? colors.primary : colors.dim}>{'\ueac2'} {sourceType}</text>
                        {isPull ? (
                            <box flexDirection="column" alignItems="center">
                                <text fg={colors.fg} attributes={TextAttributes.BOLD}>{'\ueac2'} DOWNLOADING...</text>
                                {progress.transferSpeed ? <text fg={colors.dim}>{progress.transferSpeed}</text> : null}
                                {progress.eta ? <text fg={colors.dim} attributes={TextAttributes.ITALIC}>ETA: {progress.eta}</text> : null}
                            </box>
                        ) : (
                            <text fg={colors.dim}>Idle</text>
                        )}
                    </box>
                )}
                {showSource && (
                    <box alignItems="center"><text fg={isPull ? colors.success : colors.dim} attributes={TextAttributes.BOLD}> {isPull ? ">>>" : "➜"} </text></box>
                )}
                <box flexDirection="column" width={30} padding={1} alignItems="center" gap={1} borderColor={isClean ? colors.setup : colors.dim} border borderStyle="single">
                    <text attributes={TextAttributes.BOLD} fg={isClean ? colors.setup : colors.fg}>{'\uebdf'} LOCAL</text>
                    {isClean ? (
                        <box flexDirection="column" alignItems="center">
                            <text fg={colors.setup} attributes={TextAttributes.BOLD}>🛡️ SCANNING</text>
                            <text fg={colors.dim}>Verifying Integrity...</text>
                        </box>
                    ) : (
                        <text fg={colors.success} attributes={TextAttributes.BOLD}>ACTIVE</text>
                    )}
                </box>
                {showDest && (
                    <box alignItems="center"><text fg={isCloud ? colors.primary : colors.dim} attributes={TextAttributes.BOLD}> {isCloud ? ">>>" : "➜"} </text></box>
                )}
                {showDest && (
                    <box flexDirection="column" width={24} padding={1} alignItems="center" gap={1} borderColor={isCloud ? colors.accent : colors.dim} border borderStyle={isCloud ? "double" : "single"}>
                        <text attributes={TextAttributes.BOLD} fg={isCloud ? colors.accent : colors.dim}>{'\ueac3'} {destType}</text>
                        {isCloud ? (
                            <box flexDirection="column" alignItems="center">
                                <text fg={colors.accent} attributes={TextAttributes.BOLD}>{'\ueac3'} UPLOADING...</text>
                                {progress.transferSpeed ? <text fg={colors.dim}>{progress.transferSpeed}</text> : null}
                                <text fg={colors.dim}>Syncing Changes</text>
                            </box>
                        ) : (
                            <text fg={colors.dim}>Idle</text>
                        )}
                    </box>
                )}
            </box>

            {/* === GLOBAL PROGRESS === */}
            <box flexDirection="column" alignItems="center" gap={1}>
                <text fg={barColor} attributes={TextAttributes.BOLD}>{progress.description}</text>
                <box flexDirection="row" alignItems="center" gap={1}>
                    <box flexDirection="row">
                        <text fg={barColor}>[</text>
                        <text fg={barColor}>{"█".repeat(completedWidth)}</text>
                        <text fg={colors.dim}>{"░".repeat(remainingWidth)}</text>
                        <text fg={barColor}>]</text>
                        <text> </text>
                        <text fg={colors.fg} attributes={TextAttributes.BOLD}>{progress.percentage}%</text>
                    </box>
                </box>
                {(progress.filesTransferred || progress.bytesTransferred) && (
                    <text fg={colors.dim}>
                        {progress.filesTransferred ? `Files: ${progress.filesTransferred}` : ""}
                        {progress.totalFiles ? ` / ${progress.totalFiles}` : ""}
                        {progress.bytesTransferred ? `  |  Size: ${progress.bytesTransferred}` : ""}
                    </text>
                )}
            </box>

            {/* === ACTIONS === */}
            <box flexDirection="row" gap={2} justifyContent="center" marginTop={1}>
                {!isRunning ? (
                    <box
                        border={isBodyFocused && configLoaded}
                        borderStyle="single"
                        borderColor={(isBodyFocused && configLoaded) ? colors.success : colors.dim}
                        paddingLeft={1}
                        paddingRight={1}
                    >
                        <Hotkey
                            keyLabel="return"
                            label={isDone ? "Sync Again" : "Start Sync"}
                            layout="prefix"
                            isFocused={isBodyFocused && configLoaded}
                        />
                    </box>
                ) : (
                    <box
                        border={isBodyFocused}
                        borderStyle="single"
                        borderColor={isBodyFocused ? colors.danger : colors.dim}
                        paddingLeft={1}
                        paddingRight={1}
                    >
                        <Hotkey
                            keyLabel="?"
                            label="STOP (TBD)"
                            layout="prefix"
                            isFocused={isBodyFocused}
                        />
                    </box>
                )}
            </box>
        </box>
    );
}
