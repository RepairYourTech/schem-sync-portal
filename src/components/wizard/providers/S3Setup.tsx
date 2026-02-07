/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { CloudProviderBase } from "./CloudProviderBase";
import { Hotkey } from "../../Hotkey";
import type { WizardStepProps } from "../StepProps";

export const S3Setup = ({
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
    if (step === "s3_intro") {
        const options = [
            { name: "GUIDED SETUP", description: "Learn how to create an IAM user for S3", value: "guided", key: "1" },
            { name: "I HAVE CREDENTIALS", description: "I have Access Key and Secret Key", value: "direct", key: "2" }
        ];

        return (
            <CloudProviderBase
                title="Amazon S3 Setup"
                subtitle="The industry standard for object storage."
                info="PRO: Extremely reliable. CON: High egress costs and complex UI."
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
        s3_guide_1: {
            title: "S3 Guide: IAM User",
            lines: [
                "1. Go to AWS Console -> IAM.",
                "2. Click 'Users' -> 'Create user'. Name: 'schem-sync-user'.",
                "3. Select 'Attach policies directly' -> 'AmazonS3FullAccess'."
            ],
            buttonLabel: "NEXT STEP"
        },
        s3_guide_2: {
            title: "S3 Guide: Access Keys",
            lines: [
                "1. Click on the new user -> 'Security credentials'.",
                "2. Click 'Create access key' -> 'CLI'.",
                "3. SAVE your Access Key and Secret Key!"
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
