import React, { useState, useCallback, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import { useTheme } from "../lib/theme";
import { performUpdate, type UpdateStatus } from "../lib/updater";
import { Hotkey } from "./Hotkey";
import { type PortalConfig } from "../lib/config";
import { TextAttributes } from "@opentui/core";

import { Logger } from "../lib/logger";

interface OptionsProps {
    onDoctor: () => void;
    onSetup: () => void;
    onReset: () => void;
    onForensic: () => void;
    onBack: () => void;
    focusArea: "body" | "footer";
    onFocusChange: (area: "body" | "footer") => void;
    tabTransition?: "forward" | "backward" | null;
    config: PortalConfig;
    onUpdateConfig: (config: PortalConfig) => void;
}

export const Options = React.memo(({ onDoctor, onSetup, onReset, onForensic, onBack, focusArea, onFocusChange, tabTransition, config, onUpdateConfig }: OptionsProps) => {
    const { colors } = useTheme();
    const [subView, setSubView] = useState<"menu" | "about" | "logs">("menu");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [logSelectedIndex, setLogSelectedIndex] = useState(0);
    const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);

    const options = [
        { label: "System Diagnostics ([1])", action: onDoctor, description: "Verify dependencies and system health.", key: "1" },
        { label: "Edit [S]ettings", action: onSetup, description: "Jump directly to specific settings without a full restart.", key: "2" },
        {
            label: `Debug Mode: [${config.debug_mode ? "ON" : "OFF"}] ([3])`,
            action: () => {
                onUpdateConfig({ ...config, debug_mode: !config.debug_mode });
            },
            description: "Enable internal system telemetry and developer view.",
            key: "3"
        },
        {
            label: `Log Level: [${config.log_level || "NORMAL"}] ([4])`,
            action: () => {
                const levels: ("NORMAL" | "DEBUG" | "VERBOSE")[] = ["NORMAL", "DEBUG", "VERBOSE"];
                const current = config.log_level || "NORMAL";
                const next = levels[(levels.indexOf(current) + 1) % levels.length] as ("NORMAL" | "DEBUG" | "VERBOSE");
                onUpdateConfig({ ...config, log_level: next });
            },
            description: "Cycle logging verbosity (NORMAL, DEBUG, VERBOSE).",
            key: "4"
        },
        { label: "Log [V]iewer", action: () => { setLogs(Logger.getRecentLogs(25)); setSubView("logs"); }, description: "View or Clear System Logs.", key: "5" },
        { label: "Force Forensic [S]weep", action: onForensic, description: "Deep-scan local files & quarantine risks locally.", key: "6" },
        { label: "Reset [C]onfiguration", action: () => { Logger.clearLogs(); onReset(); }, description: "Wipe settings AND logs to start fresh.", key: "7" },
        { label: "[B]ack", action: onBack, description: "Return to the previous screen.", key: "b" }
    ];

    const handleUpdate = useCallback(async () => {
        setIsUpdating(true);
        setUpdateStatus(null);
        const status = await performUpdate();
        setUpdateStatus(status);
        setIsUpdating(false);
    }, []);

    useEffect(() => {
        if (focusArea === "body" && tabTransition) {
            if (tabTransition === "forward") {
                setSelectedIndex(0);
                setLogSelectedIndex(0);
            } else {
                setSelectedIndex(options.length - 1);
                setLogSelectedIndex(1); // Refresh (0) or Clear (1)? Let's say Clear.
            }
        }
    }, [focusArea, tabTransition, subView]);

    const handleRefreshLogs = useCallback(() => {
        setLogs(Logger.getRecentLogs(25));
    }, []);

    const handleClearLogs = useCallback(() => {
        Logger.clearLogs();
        setLogs(["Logs cleared."]);
    }, []);

    useKeyboard((e) => {
        if (focusArea === "body") {
            if (e.name === "tab") {
                if (subView === "menu") {
                    if (e.shift) {
                        if (selectedIndex === 0) onFocusChange("footer");
                        else setSelectedIndex(prev => prev - 1);
                    } else {
                        if (selectedIndex === options.length - 1) onFocusChange("footer");
                        else setSelectedIndex(prev => prev + 1);
                    }
                } else if (subView === "logs") {
                    if (logSelectedIndex === 0 && !e.shift) setLogSelectedIndex(1);
                    else if (logSelectedIndex === 1 && e.shift) setLogSelectedIndex(0);
                    else onFocusChange("footer");
                } else {
                    // About view (1 interaction: Back)
                    onFocusChange("footer");
                }
                return;
            }

            if (subView === "menu" && focusArea === "body") {
                if (e.name === "1") setSelectedIndex(0);
                else if (e.name === "2") setSelectedIndex(1);
                else if (e.name === "3") setSelectedIndex(2);
                else if (e.name === "4") setSelectedIndex(3);
                else if (e.name === "5") setSelectedIndex(4);
                else if (e.name === "6") setSelectedIndex(5);
                else if (e.name === "7") setSelectedIndex(6);
                else if (e.name === "b") onBack();
                else if (e.name === "a") setSubView("about");
                else if (e.name === "up") {
                    setSelectedIndex(prev => (prev > 0 ? prev - 1 : options.length - 1));
                } else if (e.name === "down") {
                    setSelectedIndex(prev => (prev < options.length - 1 ? prev + 1 : 0));
                } else if (e.name === "return") {
                    const selectedOpt = options[selectedIndex];
                    if (selectedOpt) selectedOpt.action();
                } else if (e.name === "escape") {
                    // index.tsx handles the 2-step ESC logic usually, 
                    // but we'll let this be a shortcut to focusing the footer.
                    onFocusChange("footer");
                }
            } else if (subView === "logs" && focusArea === "body") {
                if (e.name === "left") {
                    setLogSelectedIndex(0);
                } else if (e.name === "right") {
                    setLogSelectedIndex(1);
                } else if (e.name === "r") {
                    setLogSelectedIndex(0);
                } else if (e.name === "c") {
                    setLogSelectedIndex(1);
                } else if (e.name === "return") {
                    if (logSelectedIndex === 0) handleRefreshLogs();
                    else if (logSelectedIndex === 1) handleClearLogs();
                } else if (e.name === "escape" || e.name === "backspace") {
                    setSubView("menu");
                }
            } else {
                // About view
                if (e.name === "escape" || e.name === "backspace" || (e.name === "b" && !isUpdating)) {
                    setSubView("menu");
                    setUpdateStatus(null);
                }
                if (e.name === "u" && !isUpdating) {
                    handleUpdate();
                }
            }
        }
    });

    if (subView === "logs") {
        return (
            <box flexDirection="column" padding={1} border borderStyle="double" borderColor={colors.primary} title="[ SYSTEM LOGS ]" gap={1}>
                <box flexDirection="column" gap={0} marginBottom={1} height={12}>
                    {logs.length === 0 ? <text fg={colors.dim}>Empty.</text> :
                        logs.map((L, i) => <text key={i} fg={L.includes("ERROR") ? colors.danger : colors.fg}>{L}</text>)}
                </box>

                <box border borderStyle="single" borderColor={colors.border} padding={1} marginTop="auto" flexDirection="row" gap={2}>
                    <box
                        onMouseOver={() => {
                            onFocusChange("body");
                            setLogSelectedIndex(0);
                        }}
                        onMouseDown={handleRefreshLogs}
                        border={logSelectedIndex === 0 && focusArea === "body"}
                        borderStyle="single"
                        borderColor={logSelectedIndex === 0 && focusArea === "body" ? colors.success : "transparent"}
                        paddingLeft={1}
                        paddingRight={1}
                    >
                        <Hotkey keyLabel="r" label="Refresh" isFocused={logSelectedIndex === 0 && focusArea === "body"} />
                    </box>
                    <box
                        onMouseOver={() => {
                            onFocusChange("body");
                            setLogSelectedIndex(1);
                        }}
                        onMouseDown={handleClearLogs}
                        border={logSelectedIndex === 1 && focusArea === "body"}
                        borderStyle="single"
                        borderColor={logSelectedIndex === 1 && focusArea === "body" ? colors.success : "transparent"}
                        paddingLeft={1}
                        paddingRight={1}
                    >
                        <Hotkey keyLabel="c" label="Clear Logs" isFocused={logSelectedIndex === 1 && focusArea === "body"} />
                    </box>
                </box>
            </box>
        );
    }

    if (subView === "about") {
        const isUpdateActionFocused = focusArea === "body" && !isUpdating;
        return (
            <box flexDirection="column" padding={1} border borderStyle="double" borderColor={colors.primary} title="[ ABOUT & UPDATES ]" gap={1}>
                <box flexDirection="column" gap={0} marginBottom={1}>
                    <text fg={colors.fg} attributes={TextAttributes.BOLD}>Schematic Sync Portal v2.0.0</text>
                    <text fg={colors.dim}>Universal Sync Client for CopyParty</text>
                </box>

                <box flexDirection="column" gap={0}>
                    <text fg={colors.primary}>REPO:</text>
                    <text fg={colors.fg}>https://github.com/opentui/schem-sync-portal</text>
                </box>

                <box flexDirection="column" gap={0} marginTop={1}>
                    <text fg={colors.primary}>CREDITS:</text>
                    <text fg={colors.fg}>• OpenTUI Engineering Team</text>
                    <text fg={colors.fg}>• DeepMind Advanced Agentic Coding (AAC)</text>
                </box>

                <box border borderStyle="single" borderColor={colors.border} padding={1} marginTop={1} flexDirection="column" gap={1}>
                    <text fg={colors.fg}>Update application code (Non-Destructive):</text>
                    <box flexDirection="row" gap={2}>
                        <box
                            onMouseOver={() => onFocusChange("body")}
                            onMouseDown={() => !isUpdating && handleUpdate()}
                            border={isUpdateActionFocused}
                            borderStyle="single"
                            borderColor={isUpdateActionFocused ? colors.success : "transparent"}
                            paddingLeft={1}
                            paddingRight={1}
                        >
                            <Hotkey
                                keyLabel="u"
                                label={isUpdating ? "UPDATING..." : "Check for Updates"}
                                isFocused={isUpdateActionFocused}
                            />
                        </box>
                    </box>
                    {updateStatus ? (
                        <box marginTop={0}>
                            <text fg={updateStatus.success ? colors.success : colors.danger}>
                                {updateStatus.success ? "✅ " : "❌ "}{updateStatus.message}
                            </text>
                        </box>
                    ) : null}
                </box>
            </box>
        );
    }

    return (
        <box flexDirection="column" flexGrow={1} padding={1} border borderStyle="double" borderColor={colors.primary} title="[ PORTAL OPTIONS ]" gap={1}>
            <box flexDirection="column" gap={0} flexGrow={1}>
                {options.map((opt, i) => {
                    const isSelected = i === selectedIndex && focusArea === "body";
                    return (
                        <box
                            key={i}
                            onMouseOver={() => {
                                onFocusChange("body");
                                setSelectedIndex(i);
                            }}
                            onMouseDown={() => opt.action()}
                            paddingLeft={2}
                            border
                            borderStyle="single"
                            borderColor={isSelected ? colors.success : colors.dim + "33"}
                        >
                            <Hotkey
                                keyLabel={opt.key}
                                label={opt.label}
                                isFocused={isSelected}
                            />
                        </box>
                    );
                })}
            </box>
            <box marginTop="auto" padding={1} border borderStyle="single" borderColor={colors.border}>
                <text fg={focusArea === "body" ? colors.fg : colors.dim}>{options[selectedIndex]?.description || ""}</text>
            </box>

        </box>
    );
});
Options.displayName = "Options";
