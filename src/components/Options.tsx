import React, { useState, useCallback } from "react";
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
    config: PortalConfig;
    onUpdateConfig: (config: PortalConfig) => void;
}

export function Options({ onDoctor, onSetup, onReset, onForensic, onBack, focusArea, onFocusChange, config, onUpdateConfig }: OptionsProps) {
    const { colors } = useTheme();
    const [subView, setSubView] = useState<"menu" | "about" | "logs">("menu");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);

    const options = [
        { label: "System Diagnostics (Doctor)", action: onDoctor, description: "Verify dependencies and system health.", key: "1" },
        { label: "Edit Settings (Setup Wizard)", action: onSetup, description: "Re-run the configuration wizard.", key: "2" },
        {
            label: `Log Level: [${Logger.getLevel()}]`,
            action: () => {
                const levels: ("NORMAL" | "DEBUG" | "VERBOSE")[] = ["NORMAL", "DEBUG", "VERBOSE"];
                const current = Logger.getLevel();
                const next = levels[(levels.indexOf(current) + 1) % levels.length] as ("NORMAL" | "DEBUG" | "VERBOSE");
                Logger.setLevel(next);
                onUpdateConfig({ ...config, debug_mode: next !== "NORMAL" });
            },
            description: "Cycle logging verbosity (NORMAL, DEBUG, VERBOSE).",
            key: "3"
        },
        { label: "Log Viewer", action: () => { setLogs(Logger.getRecentLogs(25)); setSubView("logs"); }, description: "View or Clear System Logs.", key: "4" },
        { label: "Force Forensic Sweep", action: onForensic, description: "Deep-scan local files & quarantine risks locally.", key: "5" },
        { label: "Reset Configuration", action: () => { Logger.clearLogs(); onReset(); }, description: "Wipe settings AND logs to start fresh.", key: "6" },
        { label: "Back", action: onBack, description: "Return to the previous screen.", key: "b" }
    ];

    const handleUpdate = useCallback(async () => {
        setIsUpdating(true);
        setUpdateStatus(null);
        const status = await performUpdate();
        setUpdateStatus(status);
        setIsUpdating(false);
    }, []);

    const handleClearLogs = useCallback(() => {
        Logger.clearLogs();
        setLogs(["Logs cleared."]);
    }, []);

    useKeyboard((e) => {
        // Universal TAB cycling is handled by index.tsx
        if (e.name === "tab") return;

        if (subView === "menu" && focusArea === "body") {
            if (e.name === "1") setSelectedIndex(0);
            else if (e.name === "2") setSelectedIndex(1);
            else if (e.name === "3") setSelectedIndex(2);
            else if (e.name === "4") setSelectedIndex(3);
            else if (e.name === "5") setSelectedIndex(4);
            else if (e.name === "6") setSelectedIndex(5);
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
            if (e.name === "c") {
                handleClearLogs();
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
    });

    if (subView === "logs") {
        const isFocusedOnClear = focusArea === "body";
        return (
            <box flexDirection="column" padding={1} border borderStyle="double" borderColor={colors.primary} title="[ SYSTEM LOGS ]" gap={1}>
                <box flexDirection="column" gap={0} marginBottom={1} height={12}>
                    {logs.length === 0 ? <text fg={colors.dim}>Empty.</text> :
                        logs.map((L, i) => <text key={i} fg={L.includes("ERROR") ? colors.danger : colors.fg}>{L}</text>)}
                </box>

                <box border borderStyle="single" borderColor={colors.border} padding={1} marginTop="auto" flexDirection="row" gap={2}>
                    <box border={isFocusedOnClear} borderStyle="single" borderColor={isFocusedOnClear ? colors.success : "transparent"} paddingLeft={1} paddingRight={1}>
                        <Hotkey keyLabel="c" label="Clear Logs" isFocused={isFocusedOnClear} />
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
}
