/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "../../Hotkey";
import type { WizardStepProps } from "../StepProps";

export const CloudGuideStep = ({
    colors,
    focusArea,
    onFocusChange,
    getCurrentStepNumber,
    next,
    step
}: WizardStepProps) => {
    const guides: Record<string, { title: string, lines: string[], buttonLabel: string }> = {
        b2_guide_1: {
            title: "B2 Guide: Key Management",
            lines: [
                "1. Log in to your Backblaze account.",
                "2. Go to 'App Keys' in the sidebar.",
                "3. Click 'Add a New Application Key'."
            ],
            buttonLabel: "NEXT STEP"
        },
        b2_guide_2: {
            title: "B2 Guide: Creating the Key",
            lines: [
                "1. Name: 'schem-sync-portal'.",
                "2. Permissions: 'Read and Write'.",
                "3. COPY your KeyID and ApplicationKey!"
            ],
            buttonLabel: "DONE"
        },
        sftp_guide_1: {
            title: "SFTP Guide: Requirements",
            lines: [
                "1. Ensure SSH server is running.",
                "2. Open Port 22 (or your custom port).",
                "3. Create a dedicated sync user."
            ],
            buttonLabel: "DONE"
        },
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
        // Add more guides as needed...
    };

    const guide = (step ? guides[step] : null) || {
        title: "Cloud Guide",
        lines: ["No specific guide found for this step."],
        buttonLabel: "DONE"
    };

    return (
        <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {String(getCurrentStepNumber())}: {String(guide.title)}</text>
            <box flexDirection="column">
                {guide.lines.map((line: string, i: number) => (
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
};
