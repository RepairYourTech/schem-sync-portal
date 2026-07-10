/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import type { PortalProvider } from "../../lib/config.ts";
import { Hotkey } from "../Hotkey";
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
    back
}: WizardStepProps) => {
    const allOptions = getOptions();
    const backIdx = allOptions.findIndex(o => o.type === "back");
    const isBackFocused = selectedIndex === backIdx && focusArea === "body";
    const menuOptions = allOptions.filter(o => o.type !== "back");

    return (
        <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {String(getCurrentStepNumber())}: Source Provider</text>
            <text fg={colors.fg}>Select your Source of Truth:</text>
            <box flexDirection="column" gap={0} alignItems="flex-start">
                {menuOptions.map((opt, i) => {
                    const meta = getProviderMetadata(opt.value as PortalProvider);
                    const isSelected = i === selectedIndex && focusArea === "body";
                    return (
                        <box
                            key={i}
                            onMouseOver={() => {
                                onFocusChange("body");
                                setSelectedIndex(i);
                            }}
                            onMouseDown={() => confirmSelection(opt)}
                            paddingLeft={1}
                            paddingRight={1}
                            border
                            borderStyle="single"
                            borderColor={isSelected ? colors.success : "transparent"}
                            flexShrink={0}
                        >
                            <Hotkey
                                keyLabel={(i + 1).toString()}
                                label={meta.label}
                                isFocused={isSelected}
                                layout="prefix"
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
                        paddingLeft={1}
                        paddingRight={1}
                        border
                        borderStyle="single"
                        borderColor={isBackFocused ? colors.success : "transparent"}
                        alignItems="center"
                    >
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
SourceChoice.displayName = "SourceChoice";
