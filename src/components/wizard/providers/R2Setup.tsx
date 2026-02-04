/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { CloudProviderBase } from "./CloudProviderBase";
import { Hotkey } from "../../Hotkey";
import type { WizardStepProps } from "../StepProps";

export const R2Setup = ({
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
    if (step === "r2_intro") {
        const options = [
            { name: "GUIDED SETUP", description: "Learn how to create a Cloudflare API Token", value: "guided", key: "1" },
            { name: "I HAVE CREDENTIALS", description: "I have Access Key and Secret Key", value: "direct", key: "2" }
        ];

        return (
            <CloudProviderBase
                title="Cloudflare R2 Setup"
                subtitle="Zero-egress object storage for high-performance syncing."
                info="PRO: No fee downloads. CON: Requires credit card for Cloudflare verification."
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
        r2_guide_1: {
            title: "R2 Guide: API Tokens",
            lines: [
                "1. Log in to Cloudflare Dashboard -> R2.",
                "2. Click 'Manage R2 API Tokens'.",
                "3. Click 'Create API Token'."
            ],
            buttonLabel: "NEXT STEP"
        },
        r2_guide_2: {
            title: "R2 Guide: Token Permissions",
            lines: [
                "1. Permissions: 'Edit' (required for uploads).",
                "2. Copy: 'Access Key ID' and 'Secret Access Key'.",
                "3. Note your 'Account ID' on the R2 overview."
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
