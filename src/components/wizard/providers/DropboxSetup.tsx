/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { CloudProviderBase } from "./CloudProviderBase";
import { Hotkey } from "../../Hotkey";
import type { WizardStepProps } from "../StepProps";

export const DropboxSetup = ({
    colors,
    selectedIndex,
    focusArea,
    onFocusChange,
    setSelectedIndex,
    getCurrentStepNumber,
    getOptions,
    confirmSelection,
    wizardContext,
    step,
    next,
    back
}: WizardStepProps) => {
    const stepNumber = getCurrentStepNumber();
    const allOptions = getOptions();
    const backIdx = allOptions.findIndex(o => o.type === "back");
    const isBackFocused = selectedIndex === backIdx && focusArea === "body";

    // 1. INTRO
    if (step === "dropbox_intro") {
        const options = [
            { name: "GUIDED SETUP", description: "Show me how to create a Dropbox App", value: "guided", key: "1" },
            { name: "I HAVE CREDENTIALS", description: "I already have App Key and Secret", value: "direct", key: "2" }
        ];

        return (
            <CloudProviderBase
                title="Dropbox Setup"
                subtitle="Reliable and fast file synchronization across all devices."
                info="PRO: Very stable API. CON: Requires specific 'Full Dropbox' scope."
                stepNumber={stepNumber}
                context={wizardContext || null}
                colors={colors}
            >
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
            </CloudProviderBase>
        );
    }

    // 2. GUIDES
    const guides: Record<string, { title: string, lines: string[], buttonLabel: string }> = {
        dropbox_guide_1: {
            title: "Dropbox Guide: App Console",
            lines: [
                "1. Go to dropbox.com/developers/apps.",
                "2. Click 'Create app'. API: 'Scoped access'.",
                "3. Access: 'Full Dropbox' (for best compatibility)."
            ],
            buttonLabel: "NEXT STEP"
        },
        dropbox_guide_2: {
            title: "Dropbox Guide: Permissions",
            lines: [
                "1. Go to 'Permissions' tab.",
                "2. Check: 'files.metadata.read', 'files.content.write', 'files.content.read'.",
                "3. Click 'Submit'. Get App Key/Secret from 'Settings'."
            ],
            buttonLabel: "DONE"
        }
    };

    const guide = step ? guides[step] : null;

    if (guide) {
        return (
            <box flexDirection="column" gap={1}>
                <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {String(stepNumber)}: {String(guide.title)}</text>
                <box flexDirection="column">
                    {guide.lines.map((line, i) => (
                        <text key={i} fg={colors.fg}>{line}</text>
                    ))}
                </box>
                <box
                    marginTop={1}
                    onMouseOver={() => onFocusChange("body")}
                    onMouseDown={() => next()}
                    border
                    borderStyle="double"
                    borderColor={focusArea === "body" ? colors.success : colors.dim}
                    paddingLeft={1}
                    paddingRight={1}
                >
                    <Hotkey keyLabel="1" label={guide.buttonLabel} isFocused={focusArea === "body"} />
                </box>

                {/* BACK BUTTON (Hotkey Only) */}
                <box
                    marginTop={1}
                    onMouseOver={() => {
                        onFocusChange("body");
                        setSelectedIndex(1);
                    }}
                    onMouseDown={() => back()}
                    paddingLeft={1}
                    paddingRight={1}
                    border
                    borderStyle="single"
                    borderColor={selectedIndex === 1 && focusArea === "body" ? colors.success : "transparent"}
                >
                    <Hotkey keyLabel="b" label="Back" isFocused={selectedIndex === 1 && focusArea === "body"} />
                </box>
            </box>
        );
    }

    return null;
};
