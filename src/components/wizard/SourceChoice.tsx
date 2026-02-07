/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import type { PortalProvider } from "../../lib/config.ts";
import { Hotkey } from "../Hotkey";
import { ProviderIcon } from "../ProviderIcon";
import type { WizardStepProps } from "./StepProps";
import { getProviderMetadata } from "../../lib/providers";

export const SourceChoice = ({
    colors,
    selectedIndex,
    focusArea,
    onFocusChange,
    setSelectedIndex,
    getCurrentStepNumber,
    getOptions,
    confirmSelection,
    config,
    back
}: WizardStepProps) => {
    const fontVersion = config.nerd_font_version || 2;

    const allOptions = getOptions();
    const backIdx = allOptions.findIndex(o => o.type === "back");
    const isBackFocused = selectedIndex === backIdx && focusArea === "body";

    return (
        <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {String(getCurrentStepNumber())}: Source Provider</text>
            <text fg={colors.fg}>🔗 Select your "Source of Truth":</text>
            <box flexDirection="column" gap={0} marginTop={1}>
                {allOptions.filter(o => o.type !== "back").map((opt, i) => {
                    const meta = getProviderMetadata(opt.value as PortalProvider);
                    const isFocused = selectedIndex === i && focusArea === "body";
                    return (
                        <box
                            key={i}
                            onMouseOver={() => {
                                onFocusChange("body");
                                setSelectedIndex(i);
                            }}
                            onMouseDown={() => confirmSelection(opt)}
                            paddingLeft={2}
                            border
                            borderStyle="single"
                            borderColor={isFocused ? colors.success : "transparent"}
                            flexDirection="row"
                            alignItems="center"
                            gap={1}
                        >
                            <text fg={isFocused ? colors.primary : colors.dim}>{String(isFocused ? "▶ " : "  ")}</text>
                            <ProviderIcon provider={opt.value as string} version={fontVersion} color={colors.primary} />
                            <Hotkey
                                keyLabel={(i + 1).toString()}
                                label={meta.label}
                                isFocused={isFocused}
                            />
                        </box>
                    );
                })}

                {/* BACK BUTTON */}
                {backIdx !== -1 && (
                    <box
                        marginTop={1}
                        onMouseOver={() => {
                            onFocusChange("body");
                            setSelectedIndex(backIdx);
                        }}
                        onMouseDown={() => back()}
                        paddingLeft={2}
                        border
                        borderStyle="single"
                        borderColor={isBackFocused ? colors.success : "transparent"}
                        flexDirection="row"
                        alignItems="center"
                    >
                        <text fg={isBackFocused ? colors.primary : colors.dim}>{String(isBackFocused ? "▶ " : "  ")}</text>
                        <Hotkey
                            keyLabel="b"
                            label="Back"
                            isFocused={isBackFocused}
                        />
                    </box>
                )}
            </box>
        </box>
    );
};
