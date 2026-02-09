/** @jsxImportSource @opentui/react */
import React, { useState } from "react";
import { useTheme } from "../lib/theme";
import { useKeyboard } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "./Hotkey";

interface FontMissingBannerProps {
    onInstall: () => void;
    onSkip: () => void;
    onLearnMore: () => void;
}

type SelectedOption = 'install' | 'skip' | 'learn';

export function FontMissingBanner({ onInstall, onSkip, onLearnMore }: FontMissingBannerProps) {
    const { colors } = useTheme();
    const [selectedOption, setSelectedOption] = useState<SelectedOption>('install');

    const options: { id: SelectedOption; label: string; key: string; action: () => void }[] = [
        { id: 'install', label: 'Auto-Install', key: 'y', action: onInstall },
        { id: 'skip', label: 'Skip', key: 'n', action: onSkip },
        { id: 'learn', label: 'Learn More', key: '?', action: onLearnMore }
    ];

    useKeyboard((key) => {
        if (!key) return;
        if (key?.name === 'left' || key?.name === 'up') {
            const idx = options.findIndex(o => o.id === selectedOption);
            const nextIdx = idx === 0 ? options.length - 1 : idx - 1;
            const nextOption = options[nextIdx];
            if (nextOption) setSelectedOption(nextOption.id);
        } else if (key?.name === 'right' || key?.name === 'down') {
            const idx = options.findIndex(o => o.id === selectedOption);
            const nextIdx = idx === options.length - 1 ? 0 : idx + 1;
            const nextOption = options[nextIdx];
            if (nextOption) setSelectedOption(nextOption.id);
        } else if (key?.name === 'return') {
            options.find(o => o.id === selectedOption)?.action();
        } else if (key?.name === 'y') {
            onInstall();
        } else if (key?.name === 'n') {
            onSkip();
        } else if (key?.name === '?' || (key?.name === '/' && key?.shift)) {
            onLearnMore();
        } else if (key?.name === 'escape') {
            onSkip();
        }
    });

    return (
        <box
            flexDirection="column"
            padding={1}
            border
            borderStyle="single"
            borderColor={colors.setup}
            title="[ NERD FONTS RECOMMENDED ]"
            width="100%"
            marginBottom={1}
        >
            <box flexDirection="row" alignItems="center" gap={1}>
                <text fg={colors.setup} attributes={TextAttributes.BOLD}>[!]</text>
                <text fg={colors.fg}>Nerd Fonts not detected. Install for optimal icon rendering.</text>
            </box>

            <box flexDirection="row" gap={3} marginTop={1} justifyContent="center">
                {options.map((opt) => {
                    const isFocused = selectedOption === opt.id;
                    return (
                        <box
                            key={opt.id}
                            border={isFocused}
                            borderStyle="single"
                            borderColor={isFocused ? colors.success : "transparent"}
                            paddingLeft={1}
                            paddingRight={1}
                            height={1}
                        >
                            <Hotkey
                                keyLabel={opt.key}
                                label={opt.label}
                                isFocused={isFocused}
                                bold={isFocused}
                            />
                        </box>
                    );
                })}
            </box>
        </box>
    );
}
FontMissingBanner.displayName = "FontMissingBanner";
