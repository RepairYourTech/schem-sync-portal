/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";

/**
 * FlexBV Official "5" Icon
 * Represented using Braille characters for high resolution in TUI.
 * Based on the official logo at: https://pldaniels.com/flexbv5/assets/flexbv5-logo-transparent-900x.png
 */
export function FlexBVIcon() {
    // Nerd Font: circuit-board (\ueabe)
    return (
        <box
            width={3}
            height={1}
            alignItems="center"
            justifyContent="center"
        >
            <text fg="#d33131" attributes={TextAttributes.BOLD}>{'\ueabe'}</text>
        </box>
    );
}
