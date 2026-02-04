/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "../Hotkey";
import type { WizardStepProps } from "./StepProps";

export const DirectoryConfig = ({
    colors,
    focusArea,
    onFocusChange,
    getCurrentStepNumber,
    config,
    confirmSelection,
    getOptions,
    updateConfig,
    selectedIndex,
    setSelectedIndex
}: WizardStepProps) => {
    const options = getOptions();
    const isInputFocused = focusArea === "body" && selectedIndex === 0;
    const isConfirmFocused = focusArea === "body" && selectedIndex === 1;

    return (
        <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {String(getCurrentStepNumber())}: Local Storage Path</text>

            <box flexDirection="column" gap={0} onMouseDown={() => { onFocusChange("body"); setSelectedIndex(0); }}>
                <text fg={isInputFocused ? colors.primary : colors.fg}>📂 Target Directory:</text>
                <input
                    focused={isInputFocused}
                    placeholder="/path/to/sync/dir"
                    value={config.local_dir || ""}
                    onChange={(val) => updateConfig(prev => ({ ...prev, local_dir: val }))}
                    onKeyDown={(e) => {
                        if (e.name === "return" || e.name === "down") setSelectedIndex(1);
                    }}
                />
            </box>

            <text fg={colors.dim} attributes={TextAttributes.DIM} marginBottom={1}>This is where your files will be synced.</text>

            <box
                onMouseOver={() => { onFocusChange("body"); setSelectedIndex(1); }}
                onMouseDown={() => confirmSelection(options[1] || options[0]!)}
                border
                borderStyle="double"
                borderColor={isConfirmFocused ? colors.success : colors.dim}
                paddingLeft={2}
                paddingRight={2}
                alignItems="center"
            >
                <text fg={isConfirmFocused ? colors.success : colors.dim}>
                    {String(isConfirmFocused ? "▶ " : "  ")}
                </text>
                <Hotkey keyLabel="ENTER" label="CONFIRM PATH" isFocused={isConfirmFocused} />
            </box>
        </box>
    );
};
