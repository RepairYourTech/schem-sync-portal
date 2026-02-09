/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "../../Hotkey";
import type { WizardStepProps } from "../StepProps";

export const CopypartyConfigStep = ({
    colors,
    focusArea,
    onFocusChange,
    getCurrentStepNumber,
    wizardInputs,
    updateInput,
    refs,
    copyparty_config_index = 0,
    set_copyparty_config_index = () => { },
    updateConfig,
    config,
    selectedIndex,
    setSelectedIndex,
    handleAuth,
    authStatus,
    isAuthLoading,
    back
}: WizardStepProps) => {
    return (
        <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {String(getCurrentStepNumber())}: CopyParty Source Configuration</text>

            {/* URL */}
            <box flexDirection="column" gap={0} onMouseDown={() => { onFocusChange("body"); set_copyparty_config_index(0); }}>
                <text fg={copyparty_config_index === 0 ? colors.primary : colors.fg}>🌐 URL/IP:</text>
                <input
                    focused={focusArea === "body" && copyparty_config_index === 0}
                    placeholder="http://192.168.1.5:3911"
                    value={wizardInputs.url}
                    onChange={(val) => updateInput("url", val, refs.urlRef!)}
                    onKeyDown={(e) => {
                        if (e.name === "return") set_copyparty_config_index(1);
                        if (e.name === "down") set_copyparty_config_index(1);
                    }}
                />
            </box>

            {/* USER */}
            <box flexDirection="column" gap={0} onMouseDown={() => { onFocusChange("body"); set_copyparty_config_index(1); }}>
                <text fg={copyparty_config_index === 1 ? colors.primary : colors.fg}>👤 Username:</text>
                <input
                    focused={focusArea === "body" && copyparty_config_index === 1}
                    placeholder="Username"
                    value={wizardInputs.user}
                    onChange={(val) => updateInput("user", val, refs.userRef!)}
                    onKeyDown={(e) => {
                        if (e.name === "return") set_copyparty_config_index(2);
                        if (e.name === "down") set_copyparty_config_index(2);
                        if (e.name === "up") set_copyparty_config_index(0);
                    }}
                />
            </box>

            {/* PASS */}
            <box flexDirection="column" gap={0} onMouseDown={() => { onFocusChange("body"); set_copyparty_config_index(2); }}>
                <text fg={copyparty_config_index === 2 ? colors.primary : colors.fg}>🔑 Password:</text>
                <input
                    focused={focusArea === "body" && copyparty_config_index === 2}
                    placeholder="Password"
                    value={wizardInputs.pass}
                    onChange={(val) => updateInput("pass", val, refs.passRef!)}
                    onKeyDown={(e) => {
                        if (e.name === "return") set_copyparty_config_index(3);
                        if (e.name === "down") set_copyparty_config_index(3);
                        if (e.name === "up") set_copyparty_config_index(1);
                    }}
                />
            </box>

            {/* METHOD */}
            <box flexDirection="column" gap={1} marginTop={1}>
                <text fg={copyparty_config_index === 3 ? colors.primary : colors.fg}>🛡️ Connection Method:</text>
                <box flexDirection="row" gap={2}>
                    {[
                        { name: "WebDAV", value: "webdav" },
                        { name: "HTTP", value: "http" }
                    ].map((m, i) => {
                        const isSelected = (config.copyparty_method || "webdav") === m.value;
                        const isFocused = copyparty_config_index === 3 && selectedIndex === i;
                        return (
                            <box
                                key={i}
                                onMouseOver={() => {
                                    setSelectedIndex(i);
                                    set_copyparty_config_index(3);
                                }}
                                onMouseDown={() => {
                                    updateConfig(prev => ({ ...prev, copyparty_method: m.value as "webdav" | "http" }));
                                }}
                                paddingLeft={1}
                                paddingRight={1}
                                border
                                borderStyle="single"
                                borderColor={isFocused ? colors.success : (isSelected ? colors.primary : "transparent")}
                            >
                                <text fg={isSelected ? colors.success : colors.dim}>{isSelected ? "● " : "○ "}</text>
                                <text fg={isFocused ? colors.fg : (isSelected ? colors.fg : colors.dim)}>{String(m.name)}</text>
                            </box>
                        );
                    })}
                </box>
            </box>

            {/* CONNECT BUTTON */}
            <box
                marginTop={1}
                onMouseOver={() => { onFocusChange("body"); set_copyparty_config_index(4); }}
                onMouseDown={() => handleAuth && handleAuth()}
                border
                borderStyle="double"
                borderColor={copyparty_config_index === 4 ? colors.success : colors.dim}
                paddingLeft={1}
                paddingRight={1}
                alignItems="center"
            >
                <Hotkey keyLabel="ENTER" label={isAuthLoading ? "CONNECTING..." : "TEST & CONNECT"} isFocused={copyparty_config_index === 4} />
            </box>

            {/* BACK BUTTON */}
            <box
                marginTop={1}
                onMouseOver={() => { onFocusChange("body"); set_copyparty_config_index(5); }}
                onMouseDown={() => back()}
                border
                borderStyle="single"
                borderColor={copyparty_config_index === 5 ? colors.success : "transparent"}
                paddingLeft={1}
                paddingRight={1}
                alignItems="center"
            >
                <Hotkey keyLabel="b" label="Back" isFocused={copyparty_config_index === 5} />
            </box>

            {!!authStatus && (
                <text marginTop={1} fg={authStatus.includes("✅") ? colors.success : (authStatus.includes("⚠️") || authStatus.includes("❌") || authStatus.includes("💥") ? colors.danger : colors.primary)}>
                    {String(authStatus)}
                </text>
            )}
        </box>
    );
};
CopypartyConfigStep.displayName = "CopypartyConfigStep";
