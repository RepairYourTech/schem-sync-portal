/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "../../Hotkey";
import type { WizardStepProps } from "../StepProps";

export const LocalDirStep = ({
    colors,
    focusArea,
    onFocusChange,
    getCurrentStepNumber,
    config,
    confirmSelection,
    getOptions
}: WizardStepProps) => {
    return (
        <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {String(getCurrentStepNumber())}: Local Storage Path</text>
            <text fg={colors.fg}>📂 Target Directory: {String(config.local_dir || "NOT SET")}</text>
            <text fg={colors.dim} attributes={TextAttributes.DIM}>This is where your files will be synced.</text>

            <box
                marginTop={1}
                onMouseOver={() => onFocusChange("body")}
                onMouseDown={() => confirmSelection(getOptions()[0]!)}
                border={focusArea === "body"}
                borderStyle="double"
                borderColor={focusArea === "body" ? colors.success : "transparent"}
                paddingLeft={1}
                paddingRight={1}
                alignItems="center"
                height={1}
            >
                <Hotkey keyLabel="ENTER" label="CONFIRM PATH" isFocused={focusArea === "body"} />
            </box>
        </box>
    );
};
LocalDirStep.displayName = "LocalDirStep";
