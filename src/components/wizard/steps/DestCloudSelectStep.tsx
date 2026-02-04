/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "../../Hotkey";
import { ProviderIcon } from "../../ProviderIcon";
import type { WizardStepProps } from "../StepProps";
import type { PortalProvider } from "../../../lib/config";
import { getProviderMetadata } from "../../../lib/providers";

export const DestCloudSelectStep = ({
    colors,
    selectedIndex,
    focusArea,
    onFocusChange,
    setSelectedIndex,
    getCurrentStepNumber,
    getOptions,
    confirmSelection,
    config
}: WizardStepProps) => {
    const fontVersion = config.nerd_font_version || 2;

    return (
        <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD} fg={colors.fg}>
                Step {String(getCurrentStepNumber())}: Backup Provider
            </text>
            <text fg={colors.fg}>☁️  Select your cloud storage provider:</text>
            <box flexDirection="column" gap={0} marginTop={1}>
                {(getOptions() as { value: PortalProvider, type: string }[]).map((opt, i) => {
                    const meta = getProviderMetadata(opt.value);
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
                            <ProviderIcon provider={opt.value} version={fontVersion} color={colors.primary} />
                            <Hotkey
                                keyLabel={(i + 1).toString()}
                                label={meta.label}
                                isFocused={isFocused}
                            />
                            {meta.description ? <text fg={isFocused ? colors.fg : colors.dim}> - {String(meta.description)}</text> : null}
                        </box>
                    );
                })}
            </box>
        </box>
    );
};
