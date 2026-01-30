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
    layout = "inline",
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

    if (layout === "prefix") {
        return (
            <box flexDirection="row">
                {renderKey()}
                {label ? <text fg={labelColor}> </text> : null}
                {renderLabel()}
            </box>
        );
    }

    if (layout === "suffix") {
        return (
            <box flexDirection="row">
                {renderLabel()}
                {label ? <text fg={labelColor}> </text> : null}
                {renderKey()}
            </box>
        );
    }

    // --- INLINE / NESTED LOGIC ---
    if (!label) return <box flexDirection="row">{renderKey()}</box>;

    // 1. Check for manual brackets first: [C]ontinue or [Co]ntinue
    // Escape keyLabel for regex safety
    const escapedKeyLabel = keyLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const manualMatch = label.match(new RegExp(`(\\[${escapedKeyLabel}[a-z]*\\])`, "i"));

    if (manualMatch && manualMatch[0]) {
        const parts = label.split(manualMatch[0]);
        const innerKey = manualMatch[0].slice(1, -1);
        return (
            <box flexDirection="row">
                <text fg={labelColor} attributes={bold ? TextAttributes.BOLD : 0}>{parts[0] || ""}</text>
                <box flexDirection="row">
                    <text fg={bracketColor}>[</text>
                    <text fg={keyColor} attributes={TextAttributes.BOLD}>{innerKey.toUpperCase()}</text>
                    <text fg={bracketColor}>]</text>
                </box>
                <text fg={labelColor} attributes={bold ? TextAttributes.BOLD : 0}>{parts[1] || ""}</text>
            </box>
        );
    }

    // 2. Auto-nest: Find the first occurrence of the hotkey character
    const charIndex = label.toLowerCase().indexOf(keyLabel.toLowerCase());
    if (charIndex !== -1 && keyLabel.length === 1) {
        const char = label[charIndex] || "";
        return (
            <box flexDirection="row">
                <text fg={labelColor} attributes={bold ? TextAttributes.BOLD : 0}>{label.substring(0, charIndex)}</text>
                <box flexDirection="row">
                    <text fg={bracketColor}>[</text>
                    <text fg={keyColor} attributes={TextAttributes.BOLD}>{char.toUpperCase()}</text>
                    <text fg={bracketColor}>]</text>
                </box>
                <text fg={labelColor} attributes={bold ? TextAttributes.BOLD : 0}>{label.substring(charIndex + 1)}</text>
            </box>
        );
    }

    // 3. Fallback: Prefix layout if no match found
    return (
        <box flexDirection="row">
            {renderKey()}
            <text fg={labelColor}> </text>
            {renderLabel()}
        </box>
    );
}
