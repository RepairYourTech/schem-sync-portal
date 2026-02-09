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
    setSelectedIndex,
    back
}: WizardStepProps) => {
    const isInputFocused = focusArea === "body" && selectedIndex === 0;
    const isConfirmFocused = focusArea === "body" && selectedIndex === 1;

    const allOptions = getOptions();
    const backIdx = allOptions.findIndex(o => o.type === "back");
    const isBackFocused = selectedIndex === backIdx && focusArea === "body";

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
                onMouseDown={() => confirmSelection(allOptions[1] || allOptions[0]!)}
                border={isConfirmFocused}
                borderStyle="double"
                borderColor={isConfirmFocused ? colors.success : "transparent"}
                paddingLeft={2}
                paddingRight={2}
                alignItems="center"
            >
                <text fg={isConfirmFocused ? colors.success : colors.dim}>
                    {String(isConfirmFocused ? "▶ " : "  ")}
                </text>
                <Hotkey keyLabel="ENTER" label="CONFIRM PATH" isFocused={isConfirmFocused} />
            </box>

            {/* BACK BUTTON */}
            {backIdx !== -1 && (
                <box
                    marginTop={1}
                    onMouseOver={() => { onFocusChange("body"); setSelectedIndex(backIdx); }}
                    onMouseDown={() => back()}
                    border={isBackFocused}
                    borderStyle="single"
                    borderColor={isBackFocused ? colors.success : "transparent"}
                    paddingLeft={2}
                    paddingRight={2}
                    alignItems="center"
                >
                    <text fg={isBackFocused ? colors.primary : colors.dim}>
                        {String(isBackFocused ? "▶ " : "  ")}
                    </text>
                    <Hotkey keyLabel="b" label="Back" isFocused={isBackFocused} />
                </box>
            )}
        </box>
    );
};
DirectoryConfig.displayName = "DirectoryConfig";
