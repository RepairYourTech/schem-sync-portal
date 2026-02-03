/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import type { ThemeColors } from "../../../lib/theme.tsx";

interface CloudProviderBaseProps {
    title: string;
    subtitle: string;
    info?: string;
    stepNumber: number;
    context: "source" | "dest" | null;
    colors: ThemeColors;
    children: React.ReactNode;
}

export const CloudProviderBase = ({ title, subtitle, info, stepNumber, context, colors, children }: CloudProviderBaseProps) => {
    return (
        <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD} fg={colors.fg}>
                Step {String(stepNumber)}: {String(context === "source" ? "[ SOURCE ]" : "[ BACKUP ]")} {String(title)}
            </text>
            <text fg={colors.fg}>{String(subtitle)}</text>
            {children}
            {!!(info) && (
                <box flexDirection="column" marginTop={1} padding={1} border borderStyle="single" borderColor={colors.dim}>
                    <text fg={colors.primary}>{String(info)}</text>
                </box>
            )}
        </box>
    );
};
