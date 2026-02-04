/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "../../Hotkey";
import { ProviderIcon } from "../../ProviderIcon";
import type { WizardStepProps } from "../StepProps";

export const SourceChoiceStep = ({
    colors,
    selectedIndex,
    focusArea,
    onFocusChange,
    setSelectedIndex,
    getCurrentStepNumber,
    getOptions,
    confirmSelection,
    config
}: WizardStepProps) => {
    const fontVersion = config.nerd_font_version || 2;
    const providers: Record<string, { name: string, icon: string, desc?: string }> = {
        copyparty: { name: "CopyParty (IYKYK)", icon: "\ueac2" },
        gdrive: { name: "Google Drive", icon: "\ueac2" },
        b2: { name: "Backblaze Cloud", icon: "\ueac2" },
        pcloud: { name: "pCloud", icon: "\ueac2" },
        sftp: { name: "SFTP/SSH", icon: "\ueac2" },
        onedrive: { name: "OneDrive", icon: "\ueac2" },
        dropbox: { name: "Dropbox", icon: "\ueac2" },
        mega: { name: "Mega.nz", icon: "\ueac2" },
        r2: { name: "Cloudflare R2", icon: "\ueac2" }
    };

    return (
        <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {String(getCurrentStepNumber())}: Source Provider</text>
            <text fg={colors.fg}>🔗 Select your "Source of Truth":</text>
            <box flexDirection="column" gap={0} marginTop={1}>
                {getOptions().map((opt, i) => {
                    const p = providers[opt.value as string];
                    const isFocused = selectedIndex === i && focusArea === "body";
                    return (
                        <box
                            key={i}
                            onMouseOver={() => {
                                onFocusChange("body");
                                setSelectedIndex(i);
                            }}
                            onMouseDown={() => confirmSelection(opt)}
                            paddingLeft={2}
                            border
                            borderStyle="single"
                            borderColor={isFocused ? colors.success : "transparent"}
                            flexDirection="row"
                            alignItems="center"
                            gap={1}
                        >
                            <text fg={isFocused ? colors.primary : colors.dim}>{String(isFocused ? "▶ " : "  ")}</text>
                            <ProviderIcon provider={opt.value as string} version={fontVersion} color={colors.primary} />
                            <Hotkey
                                keyLabel={(i + 1).toString()}
                                label={p?.name || (opt.value as string)}
                                isFocused={isFocused}
                                layout="prefix"
                            />
                        </box>
                    );
                })}
            </box>
        </box>
    );
};
