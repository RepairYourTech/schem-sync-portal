/** @jsxImportSource @opentui/react */
import React, { useState, useCallback, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import { useTheme } from "../lib/theme";
import pkg from "../../package.json";
import { performUpdate, type UpdateStatus } from "../lib/updater";
import { Hotkey } from "./Hotkey";
import { type PortalConfig } from "../lib/config";
import { TextAttributes } from "@opentui/core";

import { Logger } from "../lib/logger";
import { Clipboard } from "../lib/clipboard";

interface OptionsProps {
    onDoctor: () => void;
    onSetup: () => void;
    onReset: () => void;
    onResetShield: () => void;
    onScan: () => void;
    onForensic: () => void;
    onBack: () => void;
    focusArea: "body" | "footer";
    onFocusChange: (area: "body" | "footer") => void;
    tabTransition?: "forward" | "backward" | null;
    config: PortalConfig;
    onUpdateConfig: (config: PortalConfig) => void;
}

export const Options = React.memo(({ onDoctor, onSetup, onReset, onResetShield, onScan, onForensic, onBack, focusArea, onFocusChange, tabTransition, config, onUpdateConfig }: OptionsProps) => {
    const { colors } = useTheme();
    const [subView, setSubView] = useState<"menu" | "about" | "logs">("menu");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [logSelectedIndex, setLogSelectedIndex] = useState(0);
    const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [copyStatus, setCopyStatus] = useState("");

    const options = [
        { label: "SYSTEM DIAGNOSTICS", action: onDoctor, description: "Verify dependencies and system health.", key: "1" },
        { label: "EDIT SETUP", action: onSetup, description: "Jump directly to specific settings without a full restart.", key: "2" },
        {
            label: `DEBUG MODE: [${config.debug_mode ? "ON" : "OFF"}]`,
            action: () => {
                onUpdateConfig({ ...config, debug_mode: !config.debug_mode });
            },
            description: "Enable internal system telemetry and developer view.",
            key: "3"
        },
        {
            label: `LOG LEVEL: [${config.log_level || "NORMAL"}]`,
            action: () => {
                const levels: ("NORMAL" | "DEBUG" | "VERBOSE")[] = ["NORMAL", "DEBUG", "VERBOSE"];
                const current = config.log_level || "NORMAL";
                const next = levels[(levels.indexOf(current) + 1) % levels.length] as ("NORMAL" | "DEBUG" | "VERBOSE");
                onUpdateConfig({ ...config, log_level: next });
            },
            description: "Cycle logging verbosity (NORMAL, DEBUG, VERBOSE).",
            key: "4"
        },
        {
            label: `MALWARE SHIELD: [${config.enable_malware_shield ? (config.backup_provider === "gdrive" ? "MANDATORY" : "ON") : "OFF"}]`,
            action: () => {
                if (config.backup_provider === "gdrive") {
                    Logger.warn("UI", "Shield cannot be disabled for Google Drive backups.");
                    return;
                }
                const options: (false | "purge" | "isolate")[] = [false, "purge", "isolate"];
                const current = config.enable_malware_shield ? config.malware_policy : false;
                const nextIdx = (options.indexOf(current) + 1) % options.length;
                const next = options[nextIdx];

                if (next === false) {
                    onUpdateConfig({ ...config, enable_malware_shield: false });
                } else {
                    onUpdateConfig({ ...config, enable_malware_shield: true, malware_policy: next as "purge" | "isolate" });
                }
            },
            description: config.backup_provider === "gdrive"
                ? "Shield is REQUIRED for Google Drive to prevent account suspension."
                : `Surgical security policy: ${config.enable_malware_shield ? config.malware_policy.toUpperCase() : "DISABLED"}.`,
            key: "6"
        },
        { label: "LOG VIEWER", action: () => { setLogs(Logger.getRecentLogs(25)); setSubView("logs"); }, description: "View or Clear System Logs.", key: "5" },
        { label: "REGENERATE MANIFEST", action: onScan, description: "Full local scan to rebuild the upsync manifest.", key: "m" },
        { label: "FORENSIC SWEEP", action: onForensic, description: "Deep-scan local files & quarantine risks locally.", key: "f" },
        { label: "RESET SHIELD", action: onResetShield, description: "Clear identified threats & revert to defaults.", key: "7" },
        { label: "RESET CONFIGURATION", action: () => { Logger.clearLogs(); onReset(); }, description: "Wipe settings AND logs to start fresh.", key: "8" },
        { label: "SAVE & EXIT", action: onBack, description: "Persist change and return to dashboard.", key: "v" }
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
                setLogSelectedIndex(1); // Refresh (0), Copy (1), or Clear (2)? Let's say Copy.
            }
        }
    }, [focusArea, tabTransition, subView]);

    const handleClearLogs = () => {
        Logger.clearLogs();
        setLogs([]);
    };

    const handleCopyLogs = async () => {
        const content = Logger.getAllLogsContent();
        if (!content) {
            setCopyStatus("No logs to copy");
            setTimeout(() => setCopyStatus(""), 2000);
            return;
        }

        setCopyStatus("Copying...");
        const success = await Clipboard.copy(content);
        if (success) {
            setCopyStatus("✅ Logs copied to clipboard");
        } else {
            const path = Clipboard.fallbackToFile(content);
            setCopyStatus(`📋 Saved to ${path.split("/").pop()}`);
        }
        setTimeout(() => setCopyStatus(""), 4000);
    };

    const handleRefreshLogs = useCallback(() => {
        setLogs(Logger.getRecentLogs(25));
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
                // Hotkeys trigger actions IMMEDIATELY
                const hotkeyMap: Record<string, number> = {
                    "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "m": 5, "f": 6, "7": 7, "8": 8, "v": 9
                };

                const hotkeyIdx = hotkeyMap[e.name];
                if (hotkeyIdx !== undefined && options[hotkeyIdx]) {
                    setSelectedIndex(hotkeyIdx);
                    options[hotkeyIdx].action();
                    return;
                }

                if (e.name === "b") {
                    onBack();
                    return;
                }

                if (e.name === "a") {
                    setSubView("about");
                    return;
                }

                if (e.name === "up") {
                    setSelectedIndex(prev => (prev > 0 ? prev - 1 : options.length));
                } else if (e.name === "down") {
                    setSelectedIndex(prev => (prev < options.length ? prev + 1 : 0));
                } else if (e.name === "return") {
                    if (selectedIndex === options.length) {
                        onBack();
                    } else {
                        const selectedOpt = options[selectedIndex];
                        if (selectedOpt) selectedOpt.action();
                    }
                } else if (e.name === "escape") {
                    // index.tsx handles the 2-step ESC logic usually, 
                    // but we'll let this be a shortcut to focusing the footer.
                    onFocusChange("footer");
                }
            } else if (subView === "logs" && focusArea === "body") {
                if (e.name === "left") {
                    setLogSelectedIndex(prev => (prev > 0 ? prev - 1 : 2));
                } else if (e.name === "right") {
                    setLogSelectedIndex(prev => (prev < 2 ? prev + 1 : 0));
                } else if (e.name === "r") {
                    setLogSelectedIndex(0);
                    handleRefreshLogs();
                } else if (e.name === "y") {
                    setLogSelectedIndex(1);
                    handleCopyLogs();
                } else if (e.name === "c") {
                    setLogSelectedIndex(2);
                    handleClearLogs();
                } else if (e.name === "return") {
                    if (logSelectedIndex === 0) handleRefreshLogs();
                    else if (logSelectedIndex === 1) handleCopyLogs();
                    else if (logSelectedIndex === 2) handleClearLogs();
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
                        logs.map((L, i) => <text key={i} fg={L.includes("ERROR") ? colors.danger : colors.fg}>{String(L)}</text>)}
                </box>

                <box border borderStyle="single" borderColor={colors.border} padding={1} marginTop="auto" flexDirection="row" gap={2}>
                    <box
                        onMouseOver={() => {
                            onFocusChange("body");
                            setLogSelectedIndex(0);
                        }}
                        onMouseDown={handleRefreshLogs}
                        border={!!(logSelectedIndex === 0 && focusArea === "body")}
                        borderStyle="single"
                        borderColor={(logSelectedIndex === 0 && focusArea === "body") ? colors.success : "transparent"}
                        paddingLeft={1}
                        paddingRight={1}
                    >
                        <Hotkey keyLabel="r" label="Refresh" isFocused={!!(logSelectedIndex === 0 && focusArea === "body")} />
                    </box>
                    <box
                        onMouseOver={() => {
                            onFocusChange("body");
                            setLogSelectedIndex(1);
                        }}
                        onMouseDown={handleCopyLogs}
                        border={!!(logSelectedIndex === 1 && focusArea === "body")}
                        borderStyle="single"
                        borderColor={(logSelectedIndex === 1 && focusArea === "body") ? colors.success : "transparent"}
                        paddingLeft={1}
                        paddingRight={1}
                    >
                        <Hotkey
                            keyLabel="y"
                            label="Copy Logs"
                            isFocused={!!(logSelectedIndex === 1 && focusArea === "body")}
                        />
                    </box>
                    <box
                        onMouseOver={() => {
                            onFocusChange("body");
                            setLogSelectedIndex(2);
                        }}
                        onMouseDown={handleClearLogs}
                        border={!!(logSelectedIndex === 2 && focusArea === "body")}
                        borderStyle="single"
                        borderColor={(logSelectedIndex === 2 && focusArea === "body") ? colors.success : "transparent"}
                        paddingLeft={1}
                        paddingRight={1}
                    >
                        <Hotkey keyLabel="c" label="Clear Logs" isFocused={!!(logSelectedIndex === 2 && focusArea === "body")} />
                    </box>
                    {copyStatus ? (
                        <box marginLeft={2} alignItems="center">
                            <text fg={colors.primary}>{String(copyStatus)}</text>
                        </box>
                    ) : null}
                </box>
            </box>
        );
    }

    if (subView === "about") {
        const isUpdateActionFocused = focusArea === "body" && !isUpdating;
        return (
            <box flexDirection="column" padding={1} border borderStyle="double" borderColor={colors.primary} title="[ ABOUT & UPDATES ]" gap={1}>
                <box flexDirection="column" gap={0} marginBottom={1}>
                    <text fg={colors.fg} attributes={TextAttributes.BOLD}>Schematic Sync Portal v{String(pkg.version)}</text>
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
                                {String(updateStatus.success ? "✅ " : "❌ ")}{String(updateStatus.message)}
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
                            border={isSelected}
                            borderStyle="single"
                            borderColor={isSelected ? colors.success : "transparent"}
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
            <box marginTop="auto" flexDirection="column" gap={1}>
                <box padding={1} border borderStyle="single" borderColor={colors.border}>
                    <text fg={focusArea === "body" ? colors.fg : colors.dim}>{String(options[selectedIndex]?.description || "")}</text>
                </box>

                <box
                    onMouseOver={() => {
                        onFocusChange("body");
                        setSelectedIndex(options.length); // Special index for Back
                    }}
                    onMouseDown={onBack}
                    paddingLeft={2}
                    border={focusArea === "body" && selectedIndex === options.length}
                    borderStyle="single"
                    borderColor={(focusArea === "body" && selectedIndex === options.length) ? colors.success : "transparent"}
                    height={3}
                    alignItems="center"
                >
                    <Hotkey keyLabel="b" label="BACK TO DASHBOARD" isFocused={focusArea === "body" && selectedIndex === options.length} />
                </box>
            </box>

        </box>
    );
});
Options.displayName = "Options";
