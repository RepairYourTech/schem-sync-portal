/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { useTheme } from "../../lib/theme";

export const WizardFooter = () => {
    const { colors } = useTheme();

    return (
        <box marginTop={1} paddingTop={1} border borderStyle="single" borderColor={colors.border}>
            <text attributes={TextAttributes.DIM} fg={colors.dim}>
                Use Arrow Keys to navigate, Enter to confirm, [B]ack to return.
            </text>
        </box>
    );
};
WizardFooter.displayName = "WizardFooter";
