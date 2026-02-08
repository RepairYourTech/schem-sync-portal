/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { CloudProviderBase } from "./CloudProviderBase";
import { Hotkey } from "../../Hotkey";
import type { WizardStepProps } from "../StepProps";

export const GDriveSetup = ({
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
    if (step === "gdrive_intro") {
        const options = [
            { name: "GUIDED SETUP", description: "Walk me through creating a new GCP Project", value: "guided", key: "1" },
            { name: "I HAVE CREDENTIALS", description: "I already have a Client ID and Secret", value: "direct", key: "2" }
        ];

        return (
            <CloudProviderBase
                title="Google Drive Setup"
                subtitle="To keep your system backups safe, we need a dedicated Google Cloud Project."
                info="INFO: Simplest setup, but requires a Google Account."
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
                                border={isFocused}
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
            </CloudProviderBase>
        );
    }

    // 2. GUIDES
    const guides: Record<string, { title: string, lines: string[], buttonLabel: string }> = {
        gdrive_guide_1: {
            title: "GCP Guide: Project Creation",
            lines: [
                "1. Go to console.cloud.google.com",
                "2. Click 'New Project' and name it 'schem-sync-portal'.",
                "3. Enable the 'Google Drive API'."
            ],
            buttonLabel: "NEXT STEP"
        },
        gdrive_guide_2: {
            title: "GCP Guide: OAuth Screen",
            lines: [
                "1. API & Services -> OAuth consent screen.",
                "2. User Type: 'External'.",
                "3. App info: 'schem-sync-portal' (email doesn't matter)."
            ],
            buttonLabel: "NEXT STEP"
        },
        gdrive_guide_3: {
            title: "GCP Guide: Scopes",
            lines: [
                "1. Click 'Add or Remove Scopes'.",
                "2. Add '.../auth/drive'.",
                "3. Click 'Update' -> 'Save and Continue'."
            ],
            buttonLabel: "NEXT STEP"
        },
        gdrive_guide_4: {
            title: "GCP Guide: Credentials",
            lines: [
                "1. APIs & Services -> Credentials.",
                "2. 'Create Credentials' -> 'OAuth Client ID'.",
                "3. Application: 'Desktop App'. Name: 'Wizard'."
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
                    border={focusArea === "body"}
                    borderStyle="double"
                    borderColor={focusArea === "body" ? colors.success : "transparent"}
                    paddingLeft={1}
                    paddingRight={1}
                    alignItems="center"
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
                    border={selectedIndex === 1 && focusArea === "body"}
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
