/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import type { WizardStepProps } from "../StepProps";

export const BackupDirStep = ({ config, updateConfig, next, getCurrentStepNumber, colors, focusArea, onFocusChange, isAuthLoading }: WizardStepProps) => {
    return (
        <box flexDirection="column" gap={1} onMouseDown={() => onFocusChange("body")}>
            <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {String(getCurrentStepNumber())}: Backup Path</text>
            <text fg={colors.fg}>📂 Remote Backup Folder:</text>
            <input
                focused={focusArea === "body" && !isAuthLoading}
                placeholder={config.backup_provider === "gdrive" ? "SchematicsBackup" : "Folder name"}
                value={config.backup_dir || ""}
                onChange={(val) => updateConfig(prev => ({ ...prev, backup_dir: val }))}
                onKeyDown={(e) => { if (e.name === "return") next(); }}
            />
            <box marginTop={1} padding={1} border borderStyle="single" borderColor={colors.dim}>
                <text fg={colors.primary}>TIP: Leave blank to use {config.backup_provider === "gdrive" ? "SchematicsBackup (Recommended)" : "the root folder"}.</text>
            </box>
        </box>
    );
};
