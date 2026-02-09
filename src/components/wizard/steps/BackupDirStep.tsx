/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "../../Hotkey";
import type { WizardStepProps } from "../StepProps";

export const BackupDirStep = ({ config, updateConfig, next: _next, back, getCurrentStepNumber, colors, focusArea, onFocusChange, isAuthLoading, selectedIndex, setSelectedIndex, getOptions, confirmSelection }: WizardStepProps) => {
    return (
        <box flexDirection="column" gap={1} onMouseDown={() => onFocusChange("body")}>
            <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {String(getCurrentStepNumber())}: Backup Path</text>
            <text fg={colors.fg}>📂 Remote Backup Folder:</text>
            <input
                focused={focusArea === "body" && selectedIndex === 0 && !isAuthLoading}
                placeholder={config.backup_provider === "gdrive" ? "SchematicsBackup" : "Folder name"}
                value={config.backup_dir || ""}
                onChange={(val) => updateConfig(prev => ({ ...prev, backup_dir: val }))}
                onKeyDown={(e) => {
                    if (e.name === "return") setSelectedIndex(1);
                    if (e.name === "down") setSelectedIndex(1);
                }}
            />

            {/* CONFIRM BUTTON */}
            <box
                marginTop={1}
                onMouseOver={() => { onFocusChange("body"); setSelectedIndex(1); }}
                onMouseDown={() => confirmSelection(getOptions()[1]!)}
                border
                borderStyle="single"
                borderColor={selectedIndex === 1 && focusArea === "body" ? colors.success : "transparent"}
                paddingLeft={1}
                paddingRight={1}
                alignItems="center"
                height={1}
            >
                <Hotkey keyLabel="ENTER" label="CONFIRM PATH" isFocused={selectedIndex === 1 && focusArea === "body"} />
            </box>

            {/* BACK BUTTON */}
            <box
                marginTop={1}
                onMouseOver={() => { onFocusChange("body"); setSelectedIndex(2); }}
                onMouseDown={() => back()}
                border
                borderStyle="single"
                borderColor={selectedIndex === 2 && focusArea === "body" ? colors.success : "transparent"}
                paddingLeft={1}
                paddingRight={1}
                alignItems="center"
                height={1}
            >
                <Hotkey keyLabel="b" label="Back" isFocused={selectedIndex === 2 && focusArea === "body"} />
            </box>

            <box marginTop={1} padding={1} border borderStyle="single" borderColor={colors.dim}>
                <text fg={colors.primary}>TIP: Leave blank to use {config.backup_provider === "gdrive" ? "SchematicsBackup (Recommended)" : "the root folder"}.</text>
            </box>
        </box>
    );
};
BackupDirStep.displayName = "BackupDirStep";
