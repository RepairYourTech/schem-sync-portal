/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { CloudProviderBase } from "./CloudProviderBase";
import { Hotkey } from "../../Hotkey";
import type { WizardStepProps } from "../StepProps";

export const B2Setup = ({
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
    if (step === "b2_intro") {
        const options = [
            { name: "GUIDED SETUP", description: "Show me where to get my Application Key", value: "guided", key: "1" },
            { name: "I HAVE CREDENTIALS", description: "I already have KeyID and ApplicationKey", value: "direct", key: "2" }
        ];

        return (
            <CloudProviderBase
                title="Backblaze B2 Setup"
                subtitle="Connect your low-cost B2 bucket for secure offsite checks."
                info="PRO: Cheapest reliable cloud ($6/TB). CON: No native image previews."
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
