/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "../../Hotkey";
import type { WizardStepProps } from "../StepProps";

export const SecurityStep = ({
    colors,
    selectedIndex,
    focusArea,
    onFocusChange,
    setSelectedIndex,
    getCurrentStepNumber,
    getOptions,
    confirmSelection,
    config,
    back
}: WizardStepProps) => {
    const options = [
        { name: "RELOCATE & ISOLATE", description: "Move risks to local-only _risk_tools folder", value: "isolate", key: "1" },
        { name: "SURGICAL PURGE", description: "Delete risks after extraction", value: "purge", key: "2" },
        { name: "DISABLED", description: "Keep everything as-is (High Cloud Flagging Risk)", value: false, key: "3" }
    ];

    // Enforce mandatory malware shield for Google Drive
    const filteredOptions = config.backup_provider === "gdrive"
        ? options.filter(o => o.value !== false)
        : options;

    const allOptions = getOptions();
    const backIdx = allOptions.findIndex(o => o.type === "back");
    const isBackFocused = selectedIndex === backIdx && focusArea === "body";

    return (
        <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {String(getCurrentStepNumber())}: Malware Shield</text>
            <text fg={colors.fg}>🛡️ Surgical Security Policy (How to handle risky tools):</text>
            {config.backup_provider === "gdrive" && (
                <text fg={colors.warning} attributes={TextAttributes.BOLD} marginTop={1}>
                    ⚠️ Mandatory for Google Drive: Projects may be suspended without malware filtering.
                </text>
            )}
            <box flexDirection="column" gap={0} marginTop={1}>
                {filteredOptions.map((opt, i) => {
                    const isFocused = selectedIndex === i && focusArea === "body";
                    return (
                        <box
                            key={i}
                            onMouseOver={() => {
                                onFocusChange("body");
                                setSelectedIndex(i);
                            }}
                            onMouseDown={() => confirmSelection(allOptions[i]!)}
                            paddingLeft={1}
                            paddingRight={1}
                            border
                            borderStyle="single"
                            borderColor={isFocused ? colors.success : "transparent"}
                        >
                            <Hotkey
                                keyLabel={opt.key}
                                label={opt.name}
                                isFocused={isFocused}
                            />
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
