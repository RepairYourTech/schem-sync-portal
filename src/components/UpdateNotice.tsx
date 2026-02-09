/** @jsxImportSource @opentui/react */
import React from "react";
import { useTheme } from "../lib/theme";

export function UpdateNotice({ available }: { available?: boolean }) {
    const { colors } = useTheme();
    if (!available) return null;
    return <text fg={colors.danger}> (Update Available!)</text>;
}
UpdateNotice.displayName = "UpdateNotice";
