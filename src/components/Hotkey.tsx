import React from "react";
import { useTheme } from "../lib/theme";
import { TextAttributes } from "@opentui/core";

interface HotkeyProps {
    keyLabel: string;
    label?: string;
    color?: string; // This should be the VIBRANT color (e.g. colors.success)
    isFocused?: boolean;
    layout?: "prefix" | "suffix" | "inline";
    bold?: boolean;
}

export function Hotkey({
    keyLabel,
    label,
    color,
    isFocused = false,
    layout = "prefix",
    bold = false
}: HotkeyProps) {
    const { colors } = useTheme();

    // Universal Styling Standard:
    // 1. ESC is ALWAYS Red (colors.danger)
    // 2. Others: Cyan (colors.primary) when unselected, Green (colors.success) when selected.
    const isEsc = keyLabel.toLowerCase() === "esc" || keyLabel.toLowerCase() === "escape";

    const bracketColor = color || (isEsc ? colors.danger : (isFocused ? colors.success : colors.primary));
    const keyColor = color || (isEsc ? colors.danger : (isFocused ? colors.success : colors.primary));
    const labelColor = isEsc ? colors.danger : colors.fg;

    const renderKey = () => (
        <box flexDirection="row">
            <text fg={bracketColor}>[</text>
            <text fg={keyColor} attributes={TextAttributes.BOLD}>{keyLabel.toUpperCase()}</text>
            <text fg={bracketColor}>]</text>
        </box>
    );

    const renderLabel = () => label ? (
        <text fg={labelColor} attributes={bold ? TextAttributes.BOLD : 0}>{label}</text>
    ) : null;

    return (
        <box flexDirection="row">
            {layout === "prefix" && (
                <>
                    {renderKey()}
                    {label ? <text fg={labelColor}> </text> : null}
                    {renderLabel()}
                </>
            )}
            {layout === "suffix" && (
                <>
                    {renderLabel()}
                    {label ? <text fg={labelColor}> </text> : null}
                    {renderKey()}
                </>
            )}
            {layout === "inline" && (
                <box flexDirection="row">
                    {label?.split(new RegExp(`(\\[${keyLabel}\\])`, 'i')).map((part, i) => {
                        if (part.toLowerCase() === `[${keyLabel.toLowerCase()}]`) {
                            return (
                                <box key={i} flexDirection="row">
                                    <text fg={bracketColor}>[</text>
                                    <text fg={keyColor} attributes={TextAttributes.BOLD}>{keyLabel.toUpperCase()}</text>
                                    <text fg={bracketColor}>]</text>
                                </box>
                            );
                        }
                        return <text key={i} fg={labelColor} attributes={bold ? TextAttributes.BOLD : 0}>{part}</text>;
                    })}
                </box>
            )}
        </box>
    );
}
