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
    next
}: WizardStepProps) => {
    const stepNumber = getCurrentStepNumber();

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
                                onMouseDown={() => confirmSelection(getOptions()[i]!)}
                                paddingLeft={2}
                                border
                                borderStyle="single"
                                borderColor={isFocused ? colors.success : "transparent"}
                            >
                                <text fg={isFocused ? colors.primary : colors.dim}>{String(isFocused ? "▶ " : "  ")}</text>
                                <Hotkey
                                    keyLabel={opt.key}
                                    label={opt.name}
                                    color={isFocused ? colors.success : colors.primary}
                                    isFocused={isFocused}
                                />
                                <text fg={isFocused ? colors.fg : colors.dim}> - {String(opt.description)}</text>
                            </box>
                        );
                    })}
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
                    border
                    borderStyle="double"
                    borderColor={focusArea === "body" ? colors.success : colors.dim}
                    paddingLeft={2}
                    paddingRight={2}
                    alignItems="center"
                >
                    <text fg={focusArea === "body" ? colors.success : colors.dim}>
                        {String(focusArea === "body" ? "▶ " : "  ")}
                    </text>
                    <Hotkey keyLabel="1" label={guide.buttonLabel} isFocused={focusArea === "body"} />
                </box>
            </box>
        );
    }

    return null;
};
