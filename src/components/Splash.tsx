/** @jsxImportSource @opentui/react */
import React from "react";
import { useTerminalDimensions } from "@opentui/react";
import { TextAttributes } from "@opentui/core";


export function Splash() {
    const { width } = useTerminalDimensions();

    const schematic = [
        " .---o----o------o---o---------------o---o----o------------o 12-15V ",
        " |   |    |  22uF| + |               |   |    |                     ",
        ".-.  |   .-.    ###  |              .-.  |    |    .-------o        ",
        "| |<-'   | |    ---  |              | |  |    |    |   .---o        ",
        "| |5k    | |5k6  |   |              | |  |    |    |   |            ",
        "'-'      '-'     |   o--.           '-'  |   _|_   o  /o            ",
        " |        |     ===  |  |            |   |  |_/_|-   /              ",
        ".-.       |     GND  | ---100n   LED V   -    |     /               ",
        "| |       |          | ---           -   ^    |    o                ",
        "| |6k2    |          |  |            |   |    |    |                ",
        "'-'       |          | GND           '---o----o    '-------o        ",
        " |        |       2|\\|7                       |                     ",
        " o-----------------|-\\ LM741      ___       |/                      ",
        " |        |        |  >-------o--|___|--o---|                       ",
        " |        o---o----|+/ 6      |   22k   |   |>  BC547               ",
        " |        |   |   3|/|4       |         |     |                     ",
        ".-.       |   |     ===       o---.    .-.    |                     ",
        "| |       |   o---. GND       |   |    | |5k6 |                     ",
        "| |2k7   .-.  |   |   ___    _V_  |    | |    |                     ",
        "'-'     KTY10 | + '--|___|--|___|-'    '-'    |                     ",
        " |       | | ###      47k   220k        |     |                     ",
        " |       '-' ---                        |     |                     ",
        " |        |   |                         |     |                     ",
        " |        |   |                         |     |                     ",
        " '--------o---o-------------------------o-----o------------o GND   "
    ];

    const logo = [
        "░█░█░█▀█░▀█▀░█░█░█▀▀░█▀▄░█▀▀░█▀█░█░░░░",
        "░█░█░█░█░░█░░▀▄▀░█▀▀░█▀▄░▀▀█░█▀█░█░░░░",
        "░▀▀▀░▀░▀░▀▀▀░░▀░░▀▀▀░▀░▀░▀▀▀░▀░▀░▀▀▀░░",
        "░█▀▀░█▀▀░█░█░█▀▀░█▄█░█▀█░▀█▀░▀█▀░█▀▀░░",
        "░▀▀█░█░░░█▀█░█▀▀░█░█░█▀█░░█░░░█░░█░░░░",
        "░▀▀▀░▀▀▀░▀░▀░▀▀▀░▀░▀░▀░▀░░▀░░▀▀▀░▀▀▀░░",
        "░█▀▀░█░█░█▀█░█▀▀░░░█▀█░█▀█░█▀▄░▀█▀░█▀█░█░",
        "░▀▀█░░█░░█░█░█░░░░░█▀▀░█░█░█▀▄░░█░░█▀█░█░",
        "░▀▀▀░░▀░░▀░▀░▀▀▀░░░▀░░░▀▀▀░▀░▀░░▀░░▀░▀░▀▀",
        "░█▀▄░█░█░░░█▀▄░▀█▀░█▀▄░█▀▄░█▄█░█▀█░█▀█",
        "░█▀▄░░█░░░░█▀▄░░█░░█▀▄░█░█░█░█░█▀█░█░█",
        "░▀▀░░░▀░░░░▀▀░░▀▀▀░▀░▀░▀▀░░▀░▀░▀░▀░▀░▀"
    ];

    // Responsive Logic: Keep thresholds high to prevent layout breakage
    const showFull = width >= 120;
    const showSchem = width >= 75;

    return (
        <box flexDirection="column" alignItems="center" marginBottom={1}>
            <box padding={0} border borderStyle="single" borderColor="#00ffff">
                {showFull ? (
                    <box flexDirection="row" padding={1} gap={2}>
                        <text fg="#00ffff" wrapMode="none" overflow="hidden">
                            {String(schematic.join("\n"))}
                        </text>
                        <box flexDirection="column" justifyContent="center">
                            <text fg="#00ffff" wrapMode="none" overflow="hidden">
                                {String(logo.join("\n"))}
                            </text>
                        </box>
                    </box>
                ) : showSchem ? (
                    <box padding={1}>
                        <text fg="#00ffff" wrapMode="none" overflow="hidden">
                            {String(schematic.join("\n"))}
                        </text>
                    </box>
                ) : (
                    <box padding={2}>
                        <text fg="#00ffff" attributes={TextAttributes.BOLD}>SCHEMATIC SYNC PORTAL v2</text>
                    </box>
                )}
            </box>
            <box marginTop={1}>
                <text fg="#3a7af5" attributes={TextAttributes.BOLD}>
                    Universal Schematic Sync Portal | v1.0
                </text>
            </box>
        </box>
    );
}
