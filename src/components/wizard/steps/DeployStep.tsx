/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "../../Hotkey";
import type { WizardStepProps } from "../StepProps";

export const DeployStep = ({
    colors,
    selectedIndex,
    focusArea,
    onFocusChange,
    setSelectedIndex,
    config,
    onComplete,
    onCancel
}: WizardStepProps) => {
    const options = [
        { name: "SAVE & EXIT", description: "Apply all changes", value: true, key: "1" },
        { name: "DISCARD", description: "Exit without saving", value: false, key: "2" }
    ];

    return (
        <box flexDirection="column" gap={1} height={7}>
            <box flexDirection="row" gap={1}>
                <text fg={colors.fg}>💾</text>
                <text attributes={TextAttributes.BOLD} fg={colors.fg}>Finalize and Save Configuration?</text>
            </box>
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
                            onMouseDown={() => {
                                if (opt.value) onComplete?.(config);
                                else onCancel?.();
                            }}
                            flexDirection="row"
                            paddingLeft={isFocused ? 1 : 0}
                        >
                            <text fg={isFocused ? colors.primary : colors.dim}>{String(isFocused ? "▶ " : "  ")}</text>
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
