/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";

/**
 * Slime Icon
 * A cute little green slime using Braille characters (or similar).
 */
/**
 * Slime Icon
 * Version-aware icon based on Nerd Font compatibility.
 */
export function SlimeIcon({ version = 2 }: { version?: 2 | 3 }) {
    // Nerd Font v2: Material Design Cat (\uf61a)
    // Nerd Font v3: Font Awesome Cat (\ueeed)
    const glyph = version === 3 ? '\ueeed' : '\uf61a';

    return (
        <box
            width={3}
            height={1}
            alignItems="center"
            justifyContent="center"
        >
            <text fg="#00ff00" attributes={TextAttributes.BOLD}>{String(glyph)}</text>
        </box>
    );
}
SlimeIcon.displayName = "SlimeIcon";
