/** @jsxImportSource @opentui/react */
import React, { useState, useCallback, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import { useTheme } from "../lib/theme";
import { type UpdateInfo } from "../lib/versionChecker";
import { AboutView } from "./AboutView";
import { Hotkey } from "./Hotkey";
import { type PortalConfig } from "../lib/config";
import { Logger } from "../lib/logger";
import { Clipboard } from "../lib/clipboard";
import { performUpdate, type UpdateStatus } from "../lib/updater";
import type { FocusArea } from "../hooks/useAppState";

interface OptionsProps {
    onDoctor: () => void;
    onSetup: () => void;
    onReset: () => void;
    onResetShield: () => void;
    onScan: () => void;
    onForensic: () => void;
    onBack: () => void;
    focusArea: FocusArea;
    onFocusChange: (area: FocusArea) => void;
    tabTransition?: "forward" | "backward" | null;
    config: PortalConfig;
    onUpdateConfig: (config: PortalConfig) => void;
    updateCheck: {
        updateInfo: UpdateInfo | null;
        isChecking: boolean;
        error: string | null;
        refresh: () => void;
    };
}

export const Options = React.memo(({ onDoctor, onSetup, onReset, onResetShield, onScan, onForensic, onBack, focusArea, onFocusChange, tabTransition, config, onUpdateConfig, updateCheck }: OptionsProps) => {
    const { colors } = useTheme();
    const [subView, setSubView] = useState<"menu" | "about" | "logs" | "debug" | "shield">("menu");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [logSelectedIndex, setLogSelectedIndex] = useState(0);
    const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [copyStatus, setCopyStatus] = useState("");
    const [logScrollOffset, setLogScrollOffset] = useState(0);
    const [totalLogCount, setTotalLogCount] = useState(0);

    const debugOptions = [
        {
            label: `DEBUG MODE: [${config.debug_mode ? "ON" : "OFF"}]`,
            action: () => {
                onUpdateConfig({ ...config, debug_mode: !config.debug_mode });
            },
            description: "Enable internal system telemetry and developer view.",
            key: "1"
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
            key: "2"
        },
        { label: "LOG VIEWER", action: () => { setLogs(Logger.getRecentLogs(25)); setSubView("logs"); }, description: "View or Clear System Logs.", key: "3" },
    ];

    const shieldOptions = [
        {
            label: `SHIELD POLICY: [${config.enable_malware_shield ? config.malware_policy.toUpperCase() : "OFF"}]`,
            action: () => {
                if ((config.backup_provider as string) === "gdrive") {
                    Logger.warn("UI", "Shield cannot be disabled for Google Drive backups.");
                }
                const baseOptions: (false | "purge" | "isolate" | "extract")[] = [false, "purge", "isolate", "extract"];
                const options = (config.backup_provider as string) === "gdrive"
                    ? baseOptions.filter(o => o !== false && o !== "extract")
                    : baseOptions;

                const current = config.enable_malware_shield ? config.malware_policy : false;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const currentIndex = options.indexOf(current as any);
                const nextIdx = (currentIndex + 1) % options.length;
                const next = options[nextIdx];

                if (next === false) {
                    onUpdateConfig({ ...config, enable_malware_shield: false });
                } else {
                    onUpdateConfig({ ...config, enable_malware_shield: true, malware_policy: next as "purge" | "isolate" | "extract" });
                }
            },
            description: config.backup_provider === "gdrive"
                ? "Shield is REQUIRED for Google Drive to prevent account suspension."
                : `Security policy: ${config.enable_malware_shield ? config.malware_policy.toUpperCase() : "DISABLED"}.`,
            key: "1"
        },
        { label: "FORENSIC SWEEP", action: onForensic, description: "Deep-scan local files & quarantine risks locally.", key: "2" },
        { label: "RESET SHIELD", action: onResetShield, description: "Clear identified threats & revert to defaults.", key: "3" },
    ];

    const mainOptions = [
        { label: "SYSTEM DIAGNOSTICS", action: onDoctor, description: "Verify dependencies and system health.", key: "1" },
        { label: "EDIT SETUP", action: onSetup, description: "Jump directly to specific settings without a full restart.", key: "2" },
        { label: "LOCAL SHIELD...", action: () => { setSubView("shield"); setSelectedIndex(0); }, description: "Manage security policies and forensic scanning.", key: "3" },
        { label: "DEBUG TOOLS...", action: () => { setSubView("debug"); setSelectedIndex(0); }, description: "Access internal telemetry and logs.", key: "4" },
        { label: "REGENERATE MANIFEST", action: onScan, description: "Full local scan to rebuild the upsync manifest.", key: "5" },
        { label: "ABOUT PORTAL", action: () => { setSubView("about"); setSelectedIndex(0); }, description: "View version, repo, and credits.", key: "6" },
        { label: "RESET CONFIGURATION", action: () => { Logger.clearLogs(); onReset(); }, description: "Wipe settings AND logs to start fresh.", key: "7" },
    ];

    const options = subView === "menu" ? mainOptions : (subView === "debug" ? debugOptions : (subView === "shield" ? shieldOptions : []));

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
                setSelectedIndex(options.length); // Back button index
                setLogSelectedIndex(1);
            }
        }
    }, [focusArea, tabTransition, subView, options.length]);


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
        const allLogs = Logger.getAllLogsContent()
            .split("\n")
            .filter(l => l.trim() !== "");
        setTotalLogCount(allLogs.length);
        setLogs(allLogs);
        setLogScrollOffset(Math.max(0, allLogs.length - 25));
    }, []);

    const handleScrollUp = useCallback(() => {
        setLogScrollOffset(prev => Math.max(0, prev - 5));
    }, []);

    const handleScrollDown = useCallback(() => {
        setLogScrollOffset(prev => Math.min(Math.max(0, totalLogCount - 25), prev + 5));
    }, [totalLogCount]);

    const handleScrollToTop = useCallback(() => {
        setLogScrollOffset(0);
    }, []);

    const handleScrollToBottom = useCallback(() => {
        setLogScrollOffset(Math.max(0, totalLogCount - 25));
    }, [totalLogCount]);

    const handleClearLogsWithReset = useCallback(() => {
        Logger.clearLogs();
        setLogs([]);
        setLogScrollOffset(0);
        setTotalLogCount(0);
    }, []);

    useKeyboard((e) => {
        if (focusArea === "body") {
            if (e.name === "tab") {
                if (subView === "logs") {
                    if (logSelectedIndex === 0 && !e.shift) setLogSelectedIndex(1);
                    else if (logSelectedIndex === 1 && e.shift) setLogSelectedIndex(0);
                    else onFocusChange("footer");
                } else if (subView !== "about") {
                    if (e.shift) {
                        if (selectedIndex === 0) onFocusChange("footer");
                        else setSelectedIndex(prev => prev - 1);
                    } else {
                        if (selectedIndex === options.length) onFocusChange("footer");
                        else setSelectedIndex(prev => prev + 1);
                    }
                } else {
                    onFocusChange("footer");
                }
                return;
            }

            if ((subView === "menu" || subView === "debug" || subView === "shield") && focusArea === "body") {
                // Hotkey triggers for list items
                if (e.name >= "1" && e.name <= "6") {
                    const idx = parseInt(e.name) - 1;
                    if (options[idx]) {
                        setSelectedIndex(idx);
                        options[idx].action();
                        return;
                    }
                }

                if (e.name === "v") {
                    onBack();
                    return;
                }

                if (e.name === "up") {
                    setSelectedIndex(prev => (prev > 0 ? prev - 1 : options.length));
                } else if (e.name === "down") {
                    setSelectedIndex(prev => (prev < options.length ? prev + 1 : 0));
                } else if (e.name === "return") {
                    if (selectedIndex === options.length) {
                        if (subView === "menu") onBack();
                        else setSubView("menu");
                    } else {
                        const selectedOpt = options[selectedIndex];
                        if (selectedOpt) selectedOpt.action();
                    }
                } else if (e.name === "b") {
                    if (subView !== "menu") setSubView("menu");
                    else onFocusChange("footer");
                }
            } else if (subView === "logs" && focusArea === "body") {
                if (e.name === "left") {
                    setLogSelectedIndex(prev => (prev > 0 ? prev - 1 : 3));
                } else if (e.name === "right") {
                    setLogSelectedIndex(prev => (prev < 3 ? prev + 1 : 0));
                } else if (e.name === "up" || e.name === "k") {
                    handleScrollUp();
                } else if (e.name === "down" || e.name === "j") {
                    handleScrollDown();
                } else if (e.name === "pageup") {
                    setLogScrollOffset(prev => Math.max(0, prev - 25));
                } else if (e.name === "pagedown") {
                    setLogScrollOffset(prev => Math.min(Math.max(0, totalLogCount - 25), prev + 25));
                } else if (e.name === "home") {
                    handleScrollToTop();
                } else if (e.name === "end") {
                    handleScrollToBottom();
                } else if (e.name === "r") {
                    setLogSelectedIndex(0);
                    handleRefreshLogs();
                } else if (e.name === "y") {
                    setLogSelectedIndex(1);
                    handleCopyLogs();
                } else if (e.name === "c") {
                    setLogSelectedIndex(2);
                    handleClearLogsWithReset();
                } else if (e.name === "return") {
                    if (logSelectedIndex === 0) handleRefreshLogs();
                    else if (logSelectedIndex === 1) handleCopyLogs();
                    else if (logSelectedIndex === 2) handleClearLogsWithReset();
                } else if (e.name === "b") {
                    setLogSelectedIndex(3);
                    setSubView("debug");
                }
            } else if (subView === "about" && focusArea === "body") {
                if (e.name === "b" && !isUpdating) {
                    setSubView("menu");
                    setUpdateStatus(null);
                }
                if (e.name === "u" && !isUpdating) {
                    if (updateCheck.updateInfo?.available) {
                        handleUpdate();
                    } else {
                        updateCheck.refresh();
                    }
                }
            }
        }
    });

    if (subView === "logs") {
        const visibleLogs = logs.slice(logScrollOffset, logScrollOffset + 25);
        const showTopIndicator = logScrollOffset > 0;
        const showBottomIndicator = logScrollOffset + 25 < totalLogCount;
        const showScrollHint = totalLogCount > 25;
        return (
            <box flexDirection="column" flexGrow={1} padding={1} border borderStyle="double" borderColor={colors.primary} title="[ SYSTEM LOGS ]" gap={1}>
                <box flexDirection="column" gap={0} marginBottom={1} flexGrow={1}>
                    {logs.length === 0 ? <text fg={colors.dim}>Empty.</text> : (
                        <>
                            {showTopIndicator ? (
                                <text fg={colors.dim}>
                                    ▲ Showing {String(logScrollOffset + 1)}-{String(Math.min(logScrollOffset + 25, totalLogCount))} of {String(totalLogCount)} logs ▲
                                </text>
                            ) : null}
                            {visibleLogs.map((L, i) => (
                                <text key={logScrollOffset + i} fg={L.includes("ERROR") ? colors.danger : colors.fg}>{String(L)}</text>
                            ))}
                            {showBottomIndicator ? (
                                <text fg={colors.dim}>
                                    ▼ {String(totalLogCount - (logScrollOffset + 25))} more logs below ▼
                                </text>
                            ) : null}
                        </>
                    )}
                </box>

                <box marginTop="auto" flexDirection="column" gap={1}>
                    {showScrollHint ? (
                        <box padding={1} border borderStyle="single" borderColor={colors.border}>
                            <text fg={colors.dim}>↑↓ Scroll | PgUp/PgDn Jump | Home/End Edges</text>
                        </box>
                    ) : null}
                    <box border borderStyle="single" borderColor={colors.border} padding={1} flexDirection="row" gap={2}>
                        <box
                            onMouseOver={() => {
                                onFocusChange("body");
                                setLogSelectedIndex(0);
                            }}
                            onMouseDown={handleRefreshLogs}
                            border={logSelectedIndex === 0 && focusArea === "body"}
                            borderStyle="single"
                            borderColor={(logSelectedIndex === 0 && focusArea === "body") ? colors.success : "transparent"}
                            paddingLeft={1}
                            paddingRight={1}
                            height={1}
                        >
                            <Hotkey keyLabel="r" label="Refresh" isFocused={!!(logSelectedIndex === 0 && focusArea === "body")} />
                        </box>
                        <box
                            onMouseOver={() => {
                                onFocusChange("body");
                                setLogSelectedIndex(1);
                            }}
                            onMouseDown={handleCopyLogs}
                            border={logSelectedIndex === 1 && focusArea === "body"}
                            borderStyle="single"
                            borderColor={(logSelectedIndex === 1 && focusArea === "body") ? colors.success : "transparent"}
                            paddingLeft={1}
                            paddingRight={1}
                            height={1}
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
                            onMouseDown={handleClearLogsWithReset}
                            border={logSelectedIndex === 2 && focusArea === "body"}
                            borderStyle="single"
                            borderColor={(logSelectedIndex === 2 && focusArea === "body") ? colors.success : "transparent"}
                            paddingLeft={1}
                            paddingRight={1}
                            height={1}
                        >
                            <Hotkey keyLabel="c" label="Clear Logs" isFocused={!!(logSelectedIndex === 2 && focusArea === "body")} />
                        </box>
                        {copyStatus ? (
                            <box marginLeft={2} alignItems="center">
                                <text fg={colors.primary}>{String(copyStatus)}</text>
                            </box>
                        ) : null}
                    </box>

                    <box onMouseOver={() => { onFocusChange("body"); setLogSelectedIndex(3); }} onMouseDown={() => setSubView("debug")} border={logSelectedIndex === 3 && focusArea === "body"} borderStyle="single" borderColor={(logSelectedIndex === 3 && focusArea === "body") ? colors.success : "transparent"} paddingLeft={1} paddingRight={1} width={20} height={1}>
                        <Hotkey keyLabel="b" label="Back" isFocused={!!(logSelectedIndex === 3 && focusArea === "body")} />
                    </box>
                </box>
            </box>
        );
    }

    if (subView === "about") {
        return (
            <AboutView
                colors={colors}
                updateCheck={updateCheck}
                isUpdating={isUpdating}
                updateStatus={updateStatus}
                selectedIndex={selectedIndex}
                focusArea={focusArea}
                onFocusChange={onFocusChange}
                setSelectedIndex={setSelectedIndex}
                handleUpdate={handleUpdate}
                setSubView={setSubView}
                setUpdateStatus={setUpdateStatus}
            />
        );
    }

    const title = subView === "menu" ? "PORTAL OPTIONS" : (subView === "debug" ? "DEBUG TOOLS" : "LOCAL SHIELD");

    return (
        <box flexDirection="column" flexGrow={1} padding={1} border borderStyle="double" borderColor={colors.primary} title={`[ ${title} ]`} gap={1}>
            <box flexDirection="column" gap={0} alignItems="flex-start" flexGrow={1}>
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
                            paddingLeft={1}
                            paddingRight={1}
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
                {/* Description Context */}
                <box padding={1} border borderStyle="single" borderColor={colors.border}>
                    <text fg={focusArea === "body" ? colors.fg : colors.dim}>
                        {String(selectedIndex === options.length ? "Return to the previous screen." : (options[selectedIndex]?.description || ""))}
                    </text>
                </box>

                {/* Sub-menu / Main Footer */}
                <box flexDirection="row" gap={2} alignItems="center">
                    <box
                        onMouseOver={() => {
                            onFocusChange("body");
                            setSelectedIndex(options.length);
                        }}
                        onMouseDown={() => {
                            if (subView === "menu") onBack();
                            else setSubView("menu");
                        }}
                        paddingLeft={1}
                        paddingRight={1}
                        border={focusArea === "body" && selectedIndex === options.length}
                        borderStyle="single"
                        borderColor={(focusArea === "body" && selectedIndex === options.length) ? colors.success : "transparent"}
                        height={1}
                        alignItems="center"
                    >
                        <Hotkey
                            keyLabel="b"
                            label="Back"
                            isFocused={focusArea === "body" && selectedIndex === options.length}
                        />
                    </box>

                    {subView === "menu" && (
                        <box
                            onMouseOver={() => onFocusChange("body")}
                            onMouseDown={onBack}
                            paddingLeft={1}
                            paddingRight={1}
                            border={focusArea === "body" && selectedIndex === options.length + 1}
                            borderStyle="single"
                            borderColor={(focusArea === "body" && selectedIndex === options.length + 1) ? colors.success : "transparent"}
                            height={1}
                            alignItems="center"
                            marginLeft="auto"
                        >
                            <Hotkey keyLabel="v" label="Save & Exit" isFocused={focusArea === "body" && selectedIndex === options.length + 1} />
                        </box>
                    )}
                </box>
            </box>
        </box>
    );
});
Options.displayName = "Options";
