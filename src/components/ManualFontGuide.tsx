/** @jsxImportSource @opentui/react */
import React from "react";
import { Env } from "../lib/env";
import { useTheme } from "../lib/theme";
import { useKeyboard } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "./Hotkey";
import { type ViewName } from "../hooks/useAppState";

interface ManualFontGuideProps {
    returnView: ViewName;
    onClose: () => void;
}

export function ManualFontGuide({ returnView: _returnView, onClose }: ManualFontGuideProps) {
    const { colors } = useTheme();

    useKeyboard((key) => {
        if (key.name === 'b' || key.name === 'escape') {
            onClose();
        }
    });

    const renderPlatformSteps = () => {
        if (Env.isWin) {
            return [
                "1. Download ZIP from the link below",
                "2. Extract ZIP to a temporary folder",
                "3. Path: %LOCALAPPDATA%\\Microsoft\\Windows\\Fonts",
                "4. Right-click font files -> Install for current user",
                "5. Restart terminal after installation"
            ];
        } else if (Env.isMac) {
            return [
                "1. Download ZIP from the link below",
                "2. Double-click ZIP to extract",
                "3. Path: ~/Library/Fonts",
                "4. Double-click .ttf/.otf files -> Click Install Font",
                "5. Restart terminal after installation"
            ];
        } else {
            return [
                "1. Download ZIP from the link below",
                "2. Extract: unzip FontName.zip",
                "3. Path: ~/.local/share/fonts",
                "4. Copy .ttf/.otf files to fonts directory",
                "5. Run 'fc-cache -fv' to refresh cache",
                "6. Restart terminal after installation"
            ];
        }
    };

    return (
        <box
            border
            borderStyle="double"
            borderColor={colors.primary}
            title="[ MANUAL INSTALLATION GUIDE ]"
            flexDirection="column"
            padding={2}
            backgroundColor={colors.bg}
            flexGrow={1}
        >
            <text fg={colors.accent} attributes={TextAttributes.BOLD} marginBottom={1}>Detected Platform: {String(Env.isWin ? "Windows" : (Env.isMac ? "macOS" : "Linux"))}</text>

            <box flexDirection="column" marginBottom={1}>
                {renderPlatformSteps().map((step, i) => (
                    <text key={i} fg={colors.fg} marginBottom={1}>{String(step)}</text>
                ))}
            </box>

            <box flexDirection="column" gap={0} marginBottom={1}>
                <text attributes={TextAttributes.BOLD}>Recommended Fonts:</text>
                <text fg={colors.dim}>• JetBrainsMono Nerd Font</text>
                <text fg={colors.dim}>• FiraCode Nerd Font</text>
                <text fg={colors.dim}>• Hack Nerd Font</text>
            </box>

            <box flexDirection="column" border borderStyle="single" borderColor={colors.setup} padding={1} marginBottom={1}>
                <text fg={colors.setup} attributes={TextAttributes.BOLD}>DOWNLOAD URL:</text>
                <text fg={colors.primary}>https://github.com/ryanoasis/nerd-fonts/releases/latest</text>
            </box>

            <box flexDirection="row" gap={2}>
                <box
                    onMouseDown={onClose}
                    border={true}
                    borderStyle="single"
                    borderColor={colors.success}
                    paddingLeft={1}
                    paddingRight={1}
                    height={1}
                >
                    <Hotkey keyLabel="b" label="Back" isFocused />
                </box>
            </box>
        </box>
    );
}
ManualFontGuide.displayName = "ManualFontGuide";
