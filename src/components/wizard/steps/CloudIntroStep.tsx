/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "../../Hotkey";
import type { WizardStepProps } from "../StepProps";

export const CloudIntroStep = ({
    colors,
    selectedIndex,
    focusArea,
    onFocusChange,
    setSelectedIndex,
    getCurrentStepNumber,
    getOptions,
    confirmSelection,
    wizardContext,
    pendingSourceProvider,
    pendingBackupProvider
}: WizardStepProps) => {
    const provider = wizardContext === "source" ? pendingSourceProvider : pendingBackupProvider;

    const introData: Record<string, { title: string, subtitle: string, info: string, guidedLabel: string, directLabel: string, pro?: string, con?: string, guide?: string }> = {
        gdrive: {
            title: "Google Drive Setup",
            subtitle: "To keep your system backups safe, we need a dedicated Google Cloud Project.",
            info: "INFO: Simplest setup, but requires a Google Account.",
            guidedLabel: "Walk me through creating a new GCP Project",
            directLabel: "I already have a Client ID and Secret"
        },
        b2: {
            title: "Backblaze B2 Setup",
            subtitle: "Connect your low-cost B2 bucket for secure offsite checks.",
            info: "PRO: Cheapest reliable cloud ($6/TB). CON: No native image previews.",
            guidedLabel: "Show me where to get my Application Key",
            directLabel: "I already have KeyID and ApplicationKey",
            guide: "GUIDE: Go to Backblaze.com -> App Keys -> Add a New Application Key."
        },
        sftp: {
            title: "SFTP / Sovereign Setup",
            subtitle: "Connect your own server, NAS, or generic remote.",
            info: "PRO: Total Control, $0 fees. CON: You manage uptime.",
            guidedLabel: "What information do I need?",
            directLabel: "I have Host, User, and Pass/Key",
            guide: "guide: Ensure SSH access is enabled on your target and you know the port (default 22)."
        },
        mega: {
            title: "Mega.nz Setup",
            subtitle: "High privacy, 20GB free storage.",
            info: "PRO: Excellent free tier, private. CON: Slower transfers.",
            guidedLabel: "Show me how to get keys",
            directLabel: "I have Email and Password"
        },
        r2: {
            title: "Cloudflare R2 Setup",
            subtitle: "Zero-egress object storage.",
            info: "PRO: No download fees. CON: Requires Cloudflare Account.",
            guidedLabel: "How to find API keys",
            directLabel: "I have Access/Secret Keys"
        }
    };

    const data = (provider ? introData[provider] : null) || {
        title: `${String(provider?.toUpperCase() || "UNKNOWN")} Setup`,
        subtitle: `Connect your ${String(provider || "cloud")} account.`,
        info: "",
        guidedLabel: "GUIDED SETUP",
        directLabel: "DIRECT ENTRY"
    };

    const options = [
        { name: "GUIDED SETUP", description: data.guidedLabel, value: "guided", key: "1" },
        { name: "I HAVE CREDENTIALS", description: data.directLabel, value: "direct", key: "2" }
    ];

    return (
        <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD} fg={colors.fg}>
                Step {String(getCurrentStepNumber())}: {wizardContext === "source" ? "[ SOURCE ]" : "[ BACKUP ]"} {String(data.title)}
            </text>
            <text fg={colors.fg}>{String(data.subtitle)}</text>
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
            <box flexDirection="column" marginTop={1} padding={1} border borderStyle="single" borderColor={colors.dim}>
                <text fg={colors.primary}>{String(data.info)}</text>
                {selectedIndex === 0 && !!data.guide && <text fg={colors.success} marginTop={1}>{data.guide}</text>}
            </box>
        </box>
    );
};
