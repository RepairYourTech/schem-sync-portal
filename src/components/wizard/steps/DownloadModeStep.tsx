/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "../../Hotkey";
import type { WizardStepProps } from "../StepProps";

export const DownloadModeStep = ({
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

    // Helper to get description for each option
    const getDesc = (val: string) => {
        if (val === "full") return "Downloads EVERYTHING. Includes BIOS, firmware, & tools.";
        if (val === "lean") return "Downloads ONLY Schematics & Boardviews. Skips blobs.";
        return "";
    };

    const allOptions = getOptions();
    const backIdx = allOptions.findIndex(o => o.type === "back");
    const isBackFocused = selectedIndex === backIdx && focusArea === "body";

    return (
        <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {String(getCurrentStepNumber())}: Download Strategy</text>
            <text fg={colors.fg}>📉 Select Optimization Mode:</text>

            <box flexDirection="column" gap={0} marginTop={1}>
                {allOptions.filter(o => o.type !== "back").map((opt, i) => {
                    const isFocused = selectedIndex === i && focusArea === "body";
                    const desc = getDesc(opt.value as string);

                    return (
                        <box
                            key={i}
                            onMouseOver={() => {
                                onFocusChange("body");
                                setSelectedIndex(i);
                            }}
                            onMouseDown={() => confirmSelection(opt)}
                            paddingLeft={1}
                            paddingRight={1}
                            border={isFocused}
                            borderStyle="single"
                            borderColor={isFocused ? colors.success : "transparent"}
                            flexDirection="column"
                            alignItems="flex-start"
                            gap={0}
                        >
                            <box flexDirection="row" alignItems="center" gap={1}>
                                <text fg={opt.value === "lean" ? colors.success : colors.warning}>
                                    {String(opt.value === "lean" ? "⚡ " : "📦 ")}
                                </text>
                                <Hotkey
                                    keyLabel={(i + 1).toString()}
                                    label={opt.name || (opt.value as string)}
                                    isFocused={isFocused}
                                    layout="prefix"
                                />
                            </box>
                            {isFocused ? (
                                <box marginLeft={4} marginTop={0}>
                                    <text fg={colors.dim} attributes={TextAttributes.DIM}>
                                        {String(desc)}
                                    </text>
                                </box>
                            ) : null}
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
                        border={isBackFocused}
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

            <box marginTop={1} marginLeft={1}>
                {config.download_mode === "lean" ? (
                    <text fg={colors.success}>Current: Lean Mode Active</text>
                ) : (
                    <text fg={colors.dim}>Current: Standard Mode</text>
                )}
            </box>
        </box>
    );
};
DownloadModeStep.displayName = "DownloadModeStep";
