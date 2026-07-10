/** @jsxImportSource @opentui/react */
import React from "react";
import { Hotkey } from "../../Hotkey";
import type { WizardStepProps } from "../StepProps";
import { EDIT_MENU_ENTRIES } from "../types";

export const EditMenuStep = ({
    colors,
    selectedIndex,
    focusArea,
    onFocusChange,
    setSelectedIndex,
    confirmSelection,
    back
}: WizardStepProps) => {
    // Shared with the container's getOptions(), so a mouse click and a keyboard Enter
    // on the same row can never resolve to different steps.
    const options = EDIT_MENU_ENTRIES;

    return (
        <box flexDirection="column" gap={1}>
            <box flexDirection="column" gap={0} alignItems="flex-start">
                {options.map((opt, i) => {
                    const isSelected = i === selectedIndex && focusArea === "body";
                    return (
                        <box
                            key={i}
                            onMouseOver={() => {
                                onFocusChange("body");
                                setSelectedIndex(i);
                            }}
                            onMouseDown={() => confirmSelection({ type: "jump", value: opt.value })}
                            paddingLeft={1}
                            paddingRight={1}
                            border
                            borderStyle="single"
                            borderColor={isSelected ? colors.success : "transparent"}
                        >
                            <Hotkey
                                keyLabel={opt.key}
                                label={opt.label}
                                isFocused={isSelected}
                                layout="prefix"
                            />
                        </box>
                    );
                })}

                {/* BACK BUTTON */}
                <box
                    marginTop={1}
                    onMouseOver={() => {
                        onFocusChange("body");
                        setSelectedIndex(options.length);
                    }}
                    onMouseDown={() => back()}
                    paddingLeft={1}
                    paddingRight={1}
                    border
                    borderStyle="single"
                    borderColor={(focusArea === "body" && selectedIndex === options.length) ? colors.success : "transparent"}
                    alignItems="center"
                >
                    <Hotkey
                        keyLabel="b"
                        label="Back"
                        isFocused={focusArea === "body" && selectedIndex === options.length}
                    />
                </box>
            </box>
        </box>
    );
};
EditMenuStep.displayName = "EditMenuStep";
