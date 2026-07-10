/** @jsxImportSource @opentui/react */
import React, { useState, useEffect } from "react";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "../../Hotkey";
import type { WizardStepProps } from "../StepProps";
import { NTFY_ROW } from "../types";
import { installDaemon, uninstallDaemon, getDaemonStatus, type DaemonStatus } from "../../../lib/daemon";
import { Logger } from "../../../lib/logger";

type TestResult = "idle" | "testing" | "success" | "failed" | "timeout";

export const NtfyConfigStep = ({
    colors,
    focusArea,
    onFocusChange,
    getCurrentStepNumber,
    updateConfig,
    config,
    ntfy_config_index = 0,
    set_ntfy_config_index = () => { },
    next,
    back,
    ntfyActions
}: WizardStepProps) => {
    const daemonEnabled = config.ntfy_daemon_enabled ?? false;
    const hasUrl = !!(config.ntfy_url && config.ntfy_url.trim().length > 0);

    const [testResult, setTestResult] = useState<TestResult>("idle");
    const [testMessage, setTestMessage] = useState("");
    const [daemonStatus, setDaemonStatus] = useState<DaemonStatus>("not_installed");
    const [daemonLoading, setDaemonLoading] = useState(false);

    useEffect(() => {
        try {
            setDaemonStatus(getDaemonStatus());
        } catch {
            setDaemonStatus("not_installed");
        }
    }, [daemonEnabled]);

    const testConnection = async () => {
        if (!hasUrl) return;
        setTestResult("testing");
        setTestMessage("Connecting...");

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        try {
            const url = config.ntfy_url!.replace(/\/+$/, "") + "/json?poll=1&since=5m";
            const resp = await fetch(url, {
                signal: controller.signal,
                headers: { "Accept": "application/x-ndjson" }
            });
            clearTimeout(timeout);

            if (resp.ok) {
                const body = await resp.text();
                const msgCount = body.trim().split("\n").filter(l => l.trim()).length;
                setTestResult("success");
                setTestMessage(`Connected (HTTP ${resp.status}) — ${msgCount} recent message${msgCount !== 1 ? "s" : ""}`);
            } else {
                setTestResult("failed");
                setTestMessage(`Server returned HTTP ${resp.status}`);
            }
        } catch (err) {
            clearTimeout(timeout);
            if (controller.signal.aborted) {
                setTestResult("timeout");
                setTestMessage("Connection timed out (8s)");
            } else {
                setTestResult("failed");
                setTestMessage(err instanceof Error ? err.message : String(err));
            }
        }
    };

    const toggleDaemon = async (enable: boolean) => {
        if (!hasUrl && enable) return;
        setDaemonLoading(true);
        try {
            if (enable) {
                await installDaemon();
                Logger.info("NTFY", "Background daemon installed");
            } else {
                await uninstallDaemon();
                Logger.info("NTFY", "Background daemon removed");
            }
            updateConfig(prev => ({ ...prev, ntfy_daemon_enabled: enable }));
            setDaemonStatus(getDaemonStatus());
        } catch (err) {
            Logger.error("NTFY", "Daemon toggle failed", err);
            setTestMessage(`Daemon error: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setDaemonLoading(false);
        }
    };

    // Expose the real handlers to the container's keyboard path. Without this, pressing
    // left/right on the daemon row flipped the config flag without installing anything,
    // which silently disabled notifications.
    useEffect(() => {
        if (!ntfyActions) return;
        ntfyActions.current = { test: () => { void testConnection(); }, toggle: (enable) => { void toggleDaemon(enable); } };
        return () => { ntfyActions.current = null; };
    });

    const getTestColor = () => {
        if (testResult === "success") return colors.success;
        if (testResult === "failed" || testResult === "timeout") return colors.danger;
        if (testResult === "testing") return colors.setup;
        return colors.dim;
    };

    const getDaemonColor = () => {
        if (daemonStatus === "running") return colors.success;
        if (daemonStatus === "stopped") return colors.warning;
        return colors.dim;
    };

    return (
        <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {String(getCurrentStepNumber())}: Notification Settings</text>

            {/* NTFY Topic URL */}
            <box flexDirection="column" gap={0} onMouseDown={() => { onFocusChange("body"); set_ntfy_config_index(NTFY_ROW.URL); }}>
                <text fg={ntfy_config_index === NTFY_ROW.URL ? colors.primary : colors.fg}>{"\uf0f3"} ntfy Topic URL:</text>
                <input
                    focused={focusArea === "body" && ntfy_config_index === NTFY_ROW.URL}
                    placeholder="https://ntfy.example.com/topic"
                    value={config.ntfy_url || ""}
                    onChange={(val) => {
                        updateConfig(prev => ({ ...prev, ntfy_url: val || undefined }));
                        setTestResult("idle");
                        setTestMessage("");
                    }}
                    onKeyDown={(e) => {
                        if (e.name === "return" || e.name === "down") set_ntfy_config_index(NTFY_ROW.TEST);
                    }}
                />
                <text fg={colors.dim} attributes={TextAttributes.ITALIC}>  Push notifications auto-trigger sync when files change</text>
            </box>

            {/* TEST CONNECTION */}
            <box
                marginTop={0}
                onMouseOver={() => { onFocusChange("body"); set_ntfy_config_index(NTFY_ROW.TEST); }}
                onMouseDown={() => testConnection()}
                border={ntfy_config_index === NTFY_ROW.TEST}
                borderStyle="single"
                borderColor={ntfy_config_index === NTFY_ROW.TEST ? colors.primary : "transparent"}
                paddingLeft={1}
                paddingRight={1}
                height={1}
                alignItems="center"
                alignSelf="flex-start"
            >
                <Hotkey
                    keyLabel="ENTER"
                    label={testResult === "testing" ? "TESTING..." : "TEST CONNECTION"}
                    isFocused={ntfy_config_index === NTFY_ROW.TEST}
                />
            </box>

            {/* Test result feedback */}
            {testResult !== "idle" ? (
                <box flexDirection="row" gap={1}>
                    <text fg={getTestColor()}>
                        {String(
                            testResult === "success" ? "✓" :
                                testResult === "testing" ? "⟳" :
                                    "✗"
                        )}
                    </text>
                    <text fg={getTestColor()}>{String(testMessage)}</text>
                </box>
            ) : null}

            {/* Background Daemon Toggle */}
            <box flexDirection="column" gap={1} marginTop={1}>
                <text fg={ntfy_config_index === NTFY_ROW.DAEMON ? colors.primary : colors.fg}>{"\uf013"} Background Daemon:</text>
                <box flexDirection="row" gap={2}>
                    {[
                        { name: "Enable", value: true },
                        { name: "Disable", value: false }
                    ].map((m, i) => {
                        const isSelected = daemonEnabled === m.value;
                        const isFocused = ntfy_config_index === NTFY_ROW.DAEMON && ((daemonEnabled && i === 0) || (!daemonEnabled && i === 1));
                        const isDisabled = !hasUrl && m.value === true;
                        return (
                            <box
                                key={i}
                                onMouseOver={() => set_ntfy_config_index(NTFY_ROW.DAEMON)}
                                onMouseDown={() => { if (!isDisabled) toggleDaemon(m.value); }}
                                paddingLeft={1}
                                paddingRight={1}
                                border
                                borderStyle="single"
                                borderColor={isFocused ? colors.success : (isSelected ? colors.primary : "transparent")}
                            >
                                <text fg={isDisabled ? colors.dim : (isSelected ? colors.success : colors.dim)}>
                                    {isSelected ? "● " : "○ "}
                                </text>
                                <text fg={isDisabled ? colors.dim : (isFocused ? colors.fg : (isSelected ? colors.fg : colors.dim))}>
                                    {String(m.name)}
                                </text>
                            </box>
                        );
                    })}
                </box>
                {/* Daemon status line */}
                <box flexDirection="row" gap={1}>
                    <text fg={colors.dim} attributes={TextAttributes.ITALIC}>
                        {String(daemonLoading ? "  Installing..." : `  Service: ${daemonStatus.toUpperCase()}`)}
                    </text>
                    {daemonStatus !== "not_installed" ? (
                        <text fg={getDaemonColor()} attributes={TextAttributes.BOLD}>
                            {String(daemonStatus === "running" ? "●" : "○")}
                        </text>
                    ) : null}
                </box>
                {!hasUrl ? (
                    <text fg={colors.dim} attributes={TextAttributes.ITALIC}>  Enter a URL above to enable background listening</text>
                ) : null}
            </box>

            {/* CONTINUE BUTTON */}
            <box
                marginTop={1}
                onMouseOver={() => { onFocusChange("body"); set_ntfy_config_index(NTFY_ROW.DONE); }}
                onMouseDown={() => next()}
                border={ntfy_config_index === NTFY_ROW.DONE}
                borderStyle="double"
                borderColor={ntfy_config_index === NTFY_ROW.DONE ? colors.success : "transparent"}
                paddingLeft={1}
                paddingRight={1}
                height={1}
                alignItems="center"
                alignSelf="flex-start"
            >
                <Hotkey keyLabel="ENTER" label={hasUrl ? "SAVE & CONTINUE" : "SKIP NOTIFICATIONS"} isFocused={ntfy_config_index === NTFY_ROW.DONE} />
            </box>

            {/* BACK BUTTON */}
            <box
                onMouseOver={() => { onFocusChange("body"); set_ntfy_config_index(NTFY_ROW.BACK); }}
                onMouseDown={() => back()}
                border={ntfy_config_index === NTFY_ROW.BACK}
                borderStyle="single"
                borderColor={ntfy_config_index === NTFY_ROW.BACK ? colors.success : "transparent"}
                paddingLeft={1}
                paddingRight={1}
                height={1}
                alignItems="center"
                alignSelf="flex-start"
            >
                <Hotkey keyLabel="b" label="Back" isFocused={ntfy_config_index === NTFY_ROW.BACK} />
            </box>
        </box>
    );
};
NtfyConfigStep.displayName = "NtfyConfigStep";
