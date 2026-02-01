/** @jsxImportSource @opentui/react */
import React from "react";

/**
 * FlexBV Official "Real" Icon
 * Pixel-accurate implementation based on the official favicon.ico
 * Uses high-density half-block characters (▀/▄) to achieve 8x8 resolution in minimal space.
 */
export function FlexBVRealIcon() {
    // 8x8 Pixel Grid (Extracted from official FlexBV favicon.ico)
    const pixels: string[][] = [
        ["#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF"],
        ["#B6B6B6", "#DADADA", "#FFFFFF", "#B9B6B6", "#D8C1C1", "#FFFFFF", "#FFFEFE", "#FFFEFE"],
        ["#797979", "#868686", "#F0F1F1", "#473535", "#BE7676", "#F5C6C6", "#E37C7C", "#EBA1A1"],
        ["#BABABA", "#5F5F5F", "#BDC0C0", "#491B1B", "#DB7979", "#F5CFCF", "#ECA5A5", "#EEADAD"],
        ["#E9E9E9", "#565656", "#676969", "#6F1C1C", "#D94343", "#DB5555", "#E37B7B", "#FDF3F3"],
        ["#FFFFFF", "#727272", "#1B1313", "#A02727", "#E05F5F", "#E99999", "#EEB0B0", "#FEF9F9"],
        ["#FFFFFF", "#DADADA", "#AEA6A6", "#E7B4B4", "#F6D4D4", "#FFFFFF", "#FFFFFF", "#FFFFFF"],
        ["#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF"]
    ];

    // Map 8x8 pixels to 8x4 character grid using ▀ half-blocks
    // Row i in TUI handles pixel rows 2*i and 2*i + 1
    return (
        <box flexDirection="column">
            {[0, 1, 2, 3].map(row => (
                <box key={row} flexDirection="row" height={1}>
                    {[0, 1, 2, 3, 4, 5, 6, 7].map(col => {
                        const topPixel = pixels[row * 2]?.[col] || "#FFFFFF";
                        const bottomPixel = pixels[row * 2 + 1]?.[col] || "#FFFFFF";
                        return (
                            <text
                                key={col}
                                fg={topPixel}
                                bg={bottomPixel}
                            >
                                ▀
                            </text>
                        );
                    })}
                </box>
            ))}
        </box>
    );
}
