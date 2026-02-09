/** @jsxImportSource @opentui/react */
import React from "react";
import { type PortalConfig, isConfigComplete, isConfigEmpty } from "../lib/config";
import { useTheme } from "../lib/theme";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "./Hotkey";
import { Logger } from "../lib/logger";
import type { FocusArea } from "../hooks/useAppState";

interface DashboardProps {
    config: PortalConfig;
    isFocused: boolean;
    selectedIndex: number;
    onSelectionChange?: (idx: number) => void;
    onFocusChange?: (area: FocusArea) => void;
    onAction?: (key: string) => void;
}

export const Dashboard = React.memo(({ config, isFocused, selectedIndex, onSelectionChange, onFocusChange, onAction }: DashboardProps) => {
    const { colors } = useTheme();
    const complete = isConfigComplete(config);
    const empty = isConfigEmpty(config);
    const health = Logger.getHealthReport();

    const getResilienceColor = (status: string) => {
        if (status === "RESILIENT") return colors.success;
        if (status === "VULNERABLE") return colors.setup; // yellow-ish
        return colors.danger;
    };

    return (
        <box flexDirection="column" gap={1} width="100%" alignItems="center" flexShrink={0}>
            {/* === CONFIGURATION SUMMARY (Static) === */}
            <box flexDirection="column" padding={1} border borderStyle="single" borderColor={colors.border} width="90%" flexShrink={0}>
                <box flexDirection="row" width="100%" justifyContent="center">
                    <text attributes={TextAttributes.BOLD} fg={colors.fg}>{String("STATUS REPORT")}</text>
                </box>

                <box flexDirection="row" width="100%" justifyContent="center" gap={6} marginTop={1}>
                    {/* Source */}
                    <box flexDirection="column" gap={0} alignItems="center">
                        <box flexDirection="row">
                            <text fg="#3a7af5">{'\ueac2'} Source</text>
                        </box>
                        <text fg={!!(config.source_provider !== 'none' && config.source_provider !== 'unconfigured') ? colors.success : colors.primary}>
                            {String((config.source_provider === 'none' || config.source_provider === 'unconfigured') ? "NOT CONFIGURED" : config.source_provider.toUpperCase())}
                        </text>
                    </box>

                    {/* Local */}
                    <box flexDirection="column" gap={0} alignItems="center">
                        <box flexDirection="row">
                            <text fg="#3a7af5">{'\uebdf'} Local Directory</text>
                        </box>
                        <text fg={!!(config.local_dir && config.local_dir !== "" && config.local_dir !== "none") ? colors.success : colors.primary}>
                            {String((config.local_dir && config.local_dir !== "" && config.local_dir !== "none") ? config.local_dir : "NOT CONFIGURED")}
                        </text>
                    </box>

                    {/* Backup */}
                    <box flexDirection="column" gap={0} alignItems="center">
                        <box flexDirection="row">
                            <text fg="#3a7af5">{'\ueac3'} Backup Destination</text>
                        </box>
                        <text fg={!!(config.backup_provider !== 'none' && config.backup_provider !== 'unconfigured') ? colors.success : colors.primary}>
                            {String((config.backup_provider === 'none' || config.backup_provider === 'unconfigured')
                                ? "NOT CONFIGURED"
                                : `${config.backup_provider.toUpperCase()}${config.enable_malware_shield ? " (+🛡️)" : ""}${config.upsync_enabled ? "" : " (OFF)"}`)}
                        </text>
                    </box>

                    {/* Resilience */}
                    {config.debug_mode ? (
                        <box flexDirection="row" gap={1} alignItems="center">
                            <text fg={colors.warning}>[DEBUG]</text>
                            <text fg={colors.dim}>API: {String(config.copyparty_method || "none")}</text>
                        </box>
                    ) : (
                        <box flexDirection="column" gap={0} alignItems="center">
                            <text fg="#3a7af5">Resilience</text>
                            <text fg={getResilienceColor(health.status)}>
                                {String(health.status)}
                            </text>
                        </box>
                    )}
                </box>

                {(config.last_sync_stats || config.last_shield_stats) ? (
                    <box flexDirection="column" gap={0} marginTop={1} paddingTop={1} border borderStyle="single" borderColor={colors.border} width="100%">
                        <box flexDirection="row" justifyContent="center">
                            <text fg={colors.dim} attributes={TextAttributes.ITALIC | TextAttributes.BOLD}>LIFETIME INTELLIGENCE</text>
                        </box>
                        <box flexDirection="row" justifyContent="space-around" marginTop={0}>
                            {config.last_sync_stats ? (
                                <box flexDirection="row" gap={1}>
                                    <text fg={colors.dim}>Files Processed:</text>
                                    <text fg={colors.success} attributes={TextAttributes.BOLD}>{String(config.last_sync_stats.files_processed)}</text>
                                </box>
                            ) : null}
                            {config.last_shield_stats ? (
                                <box flexDirection="row" gap={1}>
                                    <text fg={colors.dim}>Threats Neutralized:</text>
                                    <text fg={colors.danger} attributes={TextAttributes.BOLD}>{String(config.last_shield_stats.riskyPatternCount)}</text>
                                </box>
                            ) : null}
                        </box>
                    </box>
                ) : null}
            </box>

            {/* === STATUS TEXT === */}
            <box flexDirection="column" alignItems="center" marginTop={1}>
                {empty ? (
                    <text fg={colors.dim}>{String("System is empty. Please run setup.")}</text>
                ) : !complete ? (
                    <text fg={colors.setup}>{String("Configuration incomplete.")}</text>
                ) : (
                    <text fg={colors.success} attributes={TextAttributes.BOLD}>{String("SYSTEM READY. AWAITING COMMAND.")}</text>
                )}
            </box>

            {/* === ACTION BUTTONS === */}
            <box flexDirection="row" alignItems="center" marginTop={1} gap={2} justifyContent="center" height={1}>
                {empty ? (
                    <box
                        onMouseOver={() => {
                            onFocusChange?.("body");
                            onSelectionChange?.(0);
                        }}
                        onMouseDown={() => onAction?.("s")}
                        border={!!(isFocused && selectedIndex === 0)}
                        borderStyle="single"
                        borderColor={(isFocused && selectedIndex === 0) ? colors.success : "transparent"}
                        paddingLeft={1}
                        paddingRight={1}
                        height={1}
                    >
                        <Hotkey keyLabel="s" label="Begin Setup" isFocused={!!(isFocused && selectedIndex === 0)} bold />
                    </box>
                ) : !complete ? (
                    <box flexDirection="row" gap={2} alignItems="center">
                        <box
                            onMouseOver={() => {
                                onFocusChange?.("body");
                                onSelectionChange?.(0);
                            }}
                            onMouseDown={() => onAction?.("c")}
                            border={!!(isFocused && selectedIndex === 0)}
                            borderStyle="single"
                            borderColor={(isFocused && selectedIndex === 0) ? colors.success : "transparent"}
                            paddingLeft={1}
                            paddingRight={1}
                            height={1}
                        >
                            <Hotkey keyLabel="c" label="[C]ontinue Setup" isFocused={!!(isFocused && selectedIndex === 0)} bold />
                        </box>
                        <text fg={colors.dim}>|</text>
                        <box
                            onMouseOver={() => {
                                onFocusChange?.("body");
                                onSelectionChange?.(1);
                            }}
                            onMouseDown={() => onAction?.("s")}
                            border={!!(isFocused && selectedIndex === 1)}
                            borderStyle="single"
                            borderColor={(isFocused && selectedIndex === 1) ? colors.success : "transparent"}
                            paddingLeft={1}
                            paddingRight={1}
                            height={1}
                        >
                            <Hotkey keyLabel="s" label="Restart Setup" isFocused={!!(isFocused && selectedIndex === 1)} />
                        </box>
                    </box>
                ) : (
                    <box
                        onMouseOver={() => {
                            onFocusChange?.("body");
                            onSelectionChange?.(0);
                        }}
                        onMouseDown={() => onAction?.("t")}
                        border={!!(isFocused && selectedIndex === 0)}
                        borderStyle="single"
                        borderColor={(isFocused && selectedIndex === 0) ? colors.success : "transparent"}
                        paddingLeft={1}
                        paddingRight={1}
                        height={1}
                    >
                        <Hotkey keyLabel="t" label="Sync Por[T]al" isFocused={!!(isFocused && selectedIndex === 0)} bold />
                    </box>
                )}
            </box>
        </box>
    );
});
Dashboard.displayName = "Dashboard";
