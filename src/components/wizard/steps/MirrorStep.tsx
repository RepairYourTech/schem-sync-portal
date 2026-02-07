/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "../../Hotkey";
import type { WizardStepProps } from "../StepProps";

export const MirrorStep = ({
    colors,
    selectedIndex,
    focusArea,
    onFocusChange,
    setSelectedIndex,
    getCurrentStepNumber,
    getOptions,
    confirmSelection
}: WizardStepProps) => {
    const options = [
        { name: "ADDITIVE", description: "Safety First: Never delete local files even if gone from remote", value: false, key: "1" },
        { name: "YES", description: "Mirror Mode: Keep local perfectly synced with remote", value: true, key: "2" }
    ];

    return (
        <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {String(getCurrentStepNumber())}: Sync Strategy</text>
            <text fg={colors.fg}>🔄 Enable Strict Mirroring (Deletion)?</text>
            <box flexDirection="column" gap={0} marginTop={1}>
                {options.map((opt, i) => {
                    const isFocused = selectedIndex === i && focusArea === "body";
                    return (
                        <box
                            key={i}
                            onMouseOver={() => {
                                onFocusChange("body");
                                setSelectedIndex(i);
                            }}
                            onMouseDown={() => confirmSelection(getOptions()[i]!)}
                            paddingLeft={1}
                            paddingRight={1}
                            border
                            borderStyle="single"
                            borderColor={isFocused ? colors.success : "transparent"}
                            flexDirection="row"
                            alignItems="center"
                            gap={1}
                        >
                            <Hotkey
                                keyLabel={opt.key}
                                label={opt.name}
                                isFocused={isFocused}
                            />
                            <text fg={isFocused ? colors.fg : colors.dim}> - {String(opt.description)}</text>
                        </box>
                    );
                })}
            </box>
        </box>
    );
};
