import React from "react";
import { TextAttributes } from "@opentui/core";

/**
 * Slime Icon
 * A cute little green slime using Braille characters (or similar).
 */
export function SlimeIcon() {
    // ⣠⣤⣄ -> Mound shape
    // ⡯⠒⠁ -> Face?
    // Let's keep it simple: A small green blob.
    // ⣠⣾⣷⣄
    // Nerd Font: Ghost (\uf6e2)
    return (
        <box
            width={3}
            height={1}
            alignItems="center"
            justifyContent="center"
        >
            <text fg="#00ff00" attributes={TextAttributes.BOLD}>{'\uf6e2'}</text>
        </box>
    );
}
