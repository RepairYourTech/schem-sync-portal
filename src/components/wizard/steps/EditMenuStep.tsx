/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "../../Hotkey";
import type { WizardStepProps } from "../StepProps";

export const EditMenuStep = ({
    colors,
    selectedIndex,
    focusArea,
    onFocusChange,
    setSelectedIndex,
    confirmSelection
}: WizardStepProps) => {
    const options = [
        { name: "System integration", description: "Shortcut & Desktop Icon", value: "shortcut", key: "1" },
        { name: "Source Provider", description: "Remote & Authentication", value: "source_choice", key: "2" },
        { name: "Storage Path", description: "Local Sync Directory", value: "dir", key: "3" },
        { name: "Sync Strategy", description: "Mirror Mode / Deletion", value: "mirror", key: "4" },
        { name: "Backup Settings", description: "Cloud Upsync & Malware Shield", value: "upsync_ask", key: "5" },
        { name: "Security Policy", description: "Malware Handling", value: "security", key: "6" },
        { name: "Deploy & Finish", description: "Finalize changes", value: "deploy", key: "0" }
    ];

    return (
        <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD} fg={colors.fg}>Configuration Menu</text>
            <text fg={colors.fg}>Select a section to edit:</text>
            <box flexDirection="column" gap={0} marginTop={1}>
                {options.map((opt, i) => {
                    const isSelected = selectedIndex === i && focusArea === "body";
                    return (
                        <box
                            key={i}
                            onMouseOver={() => {
                                onFocusChange("body");
                                setSelectedIndex(i);
                            }}
                            onMouseDown={() => confirmSelection({ type: "jump", value: opt.value })}
                            paddingLeft={2}
                            flexDirection="row"
                            alignItems="center"
                            border
                            borderStyle="single"
                            borderColor={isSelected ? colors.success : "transparent"}
                        >
                            <box width={3}>
                                <text fg={isSelected ? colors.primary : colors.dim}>{isSelected ? "▶ " : "  "}</text>
                            </box>
                            <Hotkey
                                keyLabel={opt.key}
                                label={opt.name}
                                isFocused={isSelected}
                            />
                            <text fg={isSelected ? colors.fg : colors.dim}> - {String(opt.description)}</text>
                        </box>
                    );
                })}
            </box>
        </box>
    );
};
