/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "../../Hotkey";
import type { WizardStepProps } from "../StepProps";

export const UpsyncAskStep = ({
    colors,
    selectedIndex,
    focusArea,
    onFocusChange,
    setSelectedIndex,
    getCurrentStepNumber,
    getOptions,
    confirmSelection,
    back
}: WizardStepProps) => {
    const options = [
        { name: "NO", description: "Download Only (Standard)", value: "download_only", key: "1", icon: "\ueac2" },
        { name: "YES", description: "Enable Cloud Backup", value: "sync_backup", key: "2", icon: "\ueac3" }
    ];

    const allOptions = getOptions();
    const backIdx = allOptions.findIndex(o => o.type === "back");
    const isBackFocused = selectedIndex === backIdx && focusArea === "body";

    return (
        <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {String(getCurrentStepNumber())}: Cloud Backup (Optional)</text>
            <text fg={colors.fg}>🚀 Do you want to enable Upsync (Backup)?</text>
            <box flexDirection="column" gap={0} marginTop={1}>
                {options.map((opt, i) => {
                    const isFocused = selectedIndex === i && focusArea === "body";
                    return (
                        <box
                            key={i}
                            onMouseOver={() => {
                                onFocusChange("body");
                                setSelectedIndex(i);
                            }}
                            onMouseDown={() => confirmSelection(getOptions()[i]!)}
                            paddingLeft={1}
                            paddingRight={1}
                            border
                            borderStyle="single"
                            borderColor={isFocused ? colors.success : "transparent"}
                            flexDirection="row"
                            alignItems="center"
                            gap={1}
                        >
                            <text fg={colors.primary}>{String(opt.icon)}</text>
                            <Hotkey keyLabel={opt.key} label={opt.name} color={isFocused ? colors.success : colors.primary} isFocused={isFocused} />
                            <text fg={isFocused ? colors.fg : colors.dim}> - {String(opt.description)}</text>
                        </box>
                    );
                })}

                {/* BACK BUTTON */}
                {backIdx !== -1 && (
                    <box
                        marginTop={1}
                        onMouseOver={() => {
                            onFocusChange("body");
                            setSelectedIndex(backIdx);
                        }}
                        onMouseDown={() => back()}
                        paddingLeft={1}
                        paddingRight={1}
                        border
                        borderStyle="single"
                        borderColor={isBackFocused ? colors.success : "transparent"}
                        flexDirection="row"
                        alignItems="center"
                    >
                        <Hotkey
                            keyLabel="b"
                            label="Back"
                            isFocused={isBackFocused}
                        />
                    </box>
                )}
            </box>
        </box>
    );
};
