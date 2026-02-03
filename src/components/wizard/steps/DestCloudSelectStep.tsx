/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "../../Hotkey";
import { ProviderIcon } from "../../ProviderIcon";
import type { WizardStepProps } from "../StepProps";
import type { PortalProvider } from "../../../lib/config";

export const DestCloudSelectStep = ({
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
    const providers: Record<string, { name: string, icon: string, desc: string }> = {
        gdrive: { name: "Google Drive", icon: "\ueac2", desc: "Safe Bet: 2yr safety net, easy auth. (Cons: Files scanned)" },
        b2: { name: "Backblaze Cloud", icon: "\ueac2", desc: "Pro Storage: $6/TB, reliable. (Cons: Complex setup)" },
        pcloud: { name: "pCloud", icon: "\ueac2", desc: "Forever Silo: Swiss Privacy, No Subs. (Cons: High upfront)" },
        sftp: { name: "SFTP/SSH", icon: "\ueac2", desc: "Fortress: 100% Private, Free. (Cons: Self-managed)" },
        onedrive: { name: "OneDrive", icon: "\ueac2", desc: "Familiar: Integrated, reliable. (Cons: High scanning)" },
        dropbox: { name: "Dropbox", icon: "\ueac2", desc: "Familiar: Integrated, reliable. (Cons: High cost)" },
        mega: { name: "Mega.nz", icon: "\ueac2", desc: "Specialized: 20GB Free. (Cons: Slower/Finicky)" },
        r2: { name: "Cloudflare R2", icon: "\ueac2", desc: "Specialized: Zero Egress. (Cons: Dev-centric)" }
    };

    return (
        <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD} fg={colors.fg}>
                Step {String(getCurrentStepNumber())}: Backup Provider
            </text>
            <text fg={colors.fg}>☁️  Select your cloud storage provider:</text>
            <box flexDirection="column" gap={0} marginTop={1}>
                {(getOptions() as { value: PortalProvider, type: string }[]).map((opt, i) => {
                    const p = providers[opt.value];
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
                            <ProviderIcon provider={opt.value} version={fontVersion} color={colors.primary} />
                            <Hotkey
                                keyLabel={(i + 1).toString()}
                                label={p?.name || opt.value}
                                isFocused={isFocused}
                            />
                            {p?.desc ? <text fg={isFocused ? colors.fg : colors.dim}> - {String(p.desc)}</text> : null}
                        </box>
                    );
                })}
            </box>
        </box>
    );
};
