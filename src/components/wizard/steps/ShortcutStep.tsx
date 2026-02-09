/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "../../Hotkey";
import type { WizardStepProps } from "../StepProps";

export const ShortcutStep = ({
    colors,
    selectedIndex,
    focusArea,
    onFocusChange,
    setSelectedIndex,
    confirmSelection,
    getOptions,
    getCurrentStepNumber,
    isShortcutMissing = false
}: WizardStepProps) => {
    const options = isShortcutMissing ? [
        { name: "RECREATE", description: "Icon is missing, recreate at standard path", value: 1, key: "1" },
        { name: "I MOVED IT", description: "I moved the icon elsewhere, don't ask again", value: 2, key: "2" },
        { name: "SKIP", description: "Go to next step without changes", value: 0, key: "3" }
    ] : [
        { name: "YES", description: `Create Desktop Icon (${process.platform === "win32" ? "Start Menu" : (process.platform === "darwin" ? "Applications" : "~/.local/bin")})`, value: 1, key: "1" },
        { name: "NO", description: "Skip system integration", value: 0, key: "2" }
    ];

    return (
        <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {String(getCurrentStepNumber())}: System Integration</text>
            <text fg={isShortcutMissing ? colors.danger : colors.fg}>
                {String(isShortcutMissing ? "⚠️  Shortcut missing! Did you move it from the standard location?" : "Add Portal to Desktop Apps?")}
            </text>
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
                            border={isFocused}
                            borderStyle="single"
                            borderColor={isFocused ? colors.success : "transparent"}
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
            <box
                marginTop={1}
                onMouseOver={() => onFocusChange("body")}
                onMouseDown={() => confirmSelection({ value: "back", type: "back" })}
                paddingLeft={1}
                paddingRight={1}
                border={selectedIndex === options.length && focusArea === "body"}
                borderStyle="single"
                borderColor={selectedIndex === options.length && focusArea === "body" ? colors.success : "transparent"}
            >
                <Hotkey
                    keyLabel="b"
                    label="Back"
                    isFocused={selectedIndex === options.length && focusArea === "body"}
                />
            </box>
        </box>
    );
};
ShortcutStep.displayName = "ShortcutStep";
