import { type PortalConfig, isConfigComplete, isConfigEmpty } from "../lib/config";
import { useTheme } from "../lib/theme";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "./Hotkey";
import { Logger } from "../lib/logger";

interface DashboardProps {
    config: PortalConfig;
    isFocused: boolean;
    selectedIndex: number;
}

export function Dashboard({ config, isFocused, selectedIndex }: DashboardProps) {
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
                    <text attributes={TextAttributes.BOLD} fg={colors.fg}>STATUS REPORT</text>
                </box>

                <box flexDirection="row" width="100%" justifyContent="center" gap={6} marginTop={1}>


                    {/* Source */}
                    <box flexDirection="column" gap={0} alignItems="center">
                        <text fg="#3a7af5">{'\ueac2'} Source</text>
                        <text fg={config.source_provider !== 'none' ? colors.success : colors.primary}>
                            {config.source_provider === 'none' ? "NOT CONFIGURED" : `${config.source_provider.toUpperCase()}`}
                        </text>
                    </box>

                    {/* Local */}
                    <box flexDirection="column" gap={0} alignItems="center">
                        <text fg="#3a7af5">{'\uebdf'} Local Directory</text>
                        <text fg={config.local_dir && config.local_dir !== "none" ? colors.success : colors.primary}>
                            {config.local_dir && config.local_dir !== "none" ? config.local_dir : "NOT CONFIGURED"}
                        </text>
                    </box>

                    {/* Backup */}
                    <box flexDirection="column" gap={0} alignItems="center">
                        <text fg="#3a7af5">{'\ueac3'} Backup Destination</text>
                        <text fg={config.upsync_enabled && config.backup_provider !== 'none' ? colors.success : colors.primary}>
                            {config.upsync_enabled && config.backup_provider !== 'none'
                                ? `${config.backup_provider.toUpperCase()}${config.enable_malware_shield ? " (+🛡️)" : ""}`
                                : "NOT CONFIGURED"}
                        </text>
                    </box>

                    {/* Resilience */}
                    {config.debug_mode && (
                        <box flexDirection="column" gap={0} alignItems="center">
                            <text fg="#3a7af5">Resilience</text>
                            <text fg={getResilienceColor(health.status)}>
                                {health.status}
                            </text>
                        </box>
                    )}
                </box>
            </box>

            {/* === STATUS TEXT === */}
            <box flexDirection="column" alignItems="center" marginTop={1}>
                {empty ? (
                    <text fg={colors.dim}>System is empty. Please run setup.</text>
                ) : !complete ? (
                    <text fg={colors.setup}>Configuration incomplete.</text>
                ) : (
                    <text fg={colors.success} attributes={TextAttributes.BOLD}>SYSTEM READY. AWAITING COMMAND.</text>
                )}
            </box>

            {/* === ACTION BUTTONS === */}
            <box flexDirection="row" alignItems="center" marginTop={1} gap={2} justifyContent="center" height={1}>
                {empty ? (
                    <box
                        border={isFocused && selectedIndex === 0}
                        borderStyle="single"
                        borderColor={(isFocused && selectedIndex === 0) ? colors.success : "transparent"}
                        paddingLeft={1}
                        paddingRight={1}
                    >
                        <Hotkey keyLabel="s" label="Begin Setup" layout="prefix" isFocused={isFocused && selectedIndex === 0} bold />
                    </box>
                ) : !complete ? (
                    <box flexDirection="row" gap={2} alignItems="center">
                        <box
                            border={isFocused && selectedIndex === 0}
                            borderStyle="single"
                            borderColor={(isFocused && selectedIndex === 0) ? colors.success : "transparent"}
                            paddingLeft={1}
                            paddingRight={1}
                        >
                            <Hotkey keyLabel="c" label="Continue Setup" layout="prefix" isFocused={isFocused && selectedIndex === 0} bold />
                        </box>
                        <text fg={colors.dim}>|</text>
                        <box
                            border={isFocused && selectedIndex === 1}
                            borderStyle="single"
                            borderColor={(isFocused && selectedIndex === 1) ? colors.success : "transparent"}
                            paddingLeft={1}
                            paddingRight={1}
                        >
                            <Hotkey keyLabel="s" label="Restart Setup" layout="prefix" isFocused={isFocused && selectedIndex === 1} />
                        </box>
                    </box>
                ) : (
                    <box
                        border={isFocused && selectedIndex === 0}
                        borderStyle="single"
                        borderColor={(isFocused && selectedIndex === 0) ? colors.success : "transparent"}
                        paddingLeft={1}
                        paddingRight={1}
                    >
                        <Hotkey keyLabel="p" label="Sync Portal" layout="prefix" isFocused={isFocused && selectedIndex === 0} bold />
                    </box>
                )}
            </box>
        </box>
    );
}
