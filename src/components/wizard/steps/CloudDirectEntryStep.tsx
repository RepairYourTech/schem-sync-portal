/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import type { WizardStepProps } from "../StepProps";

export const CloudDirectEntryStep = ({
    colors,
    focusArea,
    onFocusChange,
    getCurrentStepNumber,
    wizardContext,
    pendingSourceProvider,
    pendingBackupProvider,
    direct_entry_index = 0,
    set_direct_entry_index = () => { },
    wizardInputs,
    updateInput,
    refs,
    startGenericAuth,
    isAuthLoading,
    authStatus,
    setAuthStatus,
    dispatchDirectAuth
}: WizardStepProps) => {
    const provider = wizardContext === "source" ? pendingSourceProvider : pendingBackupProvider;
    const fields: { label: string, ref: { current: string }, icon: string, placeholder?: string, key: string }[] = [];

    if (provider === "gdrive") {
        fields.push({ label: "Client ID", ref: refs.clientIdRef!, icon: "🆔", placeholder: "123...apps.googleusercontent.com", key: "clientId" });
        fields.push({ label: "Client Secret", ref: refs.clientSecretRef!, icon: "🔑", placeholder: "GOCSPX-...", key: "clientSecret" });
    } else if (provider === "b2") {
        fields.push({ label: "Key ID", ref: refs.b2IdRef!, icon: "🆔", placeholder: "005...", key: "b2Id" });
        fields.push({ label: "Application Key", ref: refs.b2KeyRef!, icon: "🔑", placeholder: "K005...", key: "b2Key" });
    } else if (provider === "sftp") {
        fields.push({ label: "Host", ref: refs.urlRef!, icon: "🌐", placeholder: "sftp.example.com:22", key: "url" });
        fields.push({ label: "User", ref: refs.userRef!, icon: "👤", placeholder: "username", key: "user" });
        fields.push({ label: "Password", ref: refs.passRef!, icon: "🔑", placeholder: "password", key: "pass" });
    } else if (provider === "pcloud") {
        fields.push({ label: "User", ref: refs.userRef!, icon: "👤", placeholder: "email@example.com", key: "user" });
        fields.push({ label: "Password", ref: refs.passRef!, icon: "🔑", placeholder: "password", key: "pass" });
    } else if (provider === "onedrive" || provider === "dropbox") {
        // No fields needed - OAuth handled by rclone authorize
    } else if (provider === "mega") {
        fields.push({ label: "User", ref: refs.userRef!, icon: "👤", placeholder: "email@example.com", key: "user" });
        fields.push({ label: "Password", ref: refs.passRef!, icon: "🔑", placeholder: "password", key: "pass" });
    } else if (provider === "r2") {
        fields.push({ label: "Access Key ID", ref: refs.userRef!, icon: "🆔", placeholder: "access-key", key: "user" });
        fields.push({ label: "Secret Key", ref: refs.passRef!, icon: "🔑", placeholder: "secret-key", key: "pass" });
        fields.push({ label: "Endpoint", ref: refs.urlRef!, icon: "🌐", placeholder: "account-id.r2.cloudflarestorage.com", key: "url" });
    }

    const isConnectFocused = direct_entry_index === fields.length && focusArea === "body";

    const handleAction = () => {
        if (isAuthLoading) return; // Prevent double-trigger

        if (provider === "onedrive" || provider === "dropbox") {
            if (startGenericAuth) startGenericAuth(provider);
            return;
        }

        const requiredFields = fields.filter(f => f.ref.current.trim() === "");
        if (requiredFields.length > 0) {
            if (setAuthStatus) setAuthStatus(`⚠️ Required: ${requiredFields.map(f => f.label).join(", ")}`);
            return;
        }

        if (dispatchDirectAuth && provider) {
            dispatchDirectAuth(provider);
        }
    };

    return (
        <box flexDirection="column" gap={1}>
            <text attributes={TextAttributes.BOLD} fg={colors.fg}>
                Step {String(getCurrentStepNumber())}: {wizardContext === "source" ? "[ SOURCE ]" : "[ BACKUP ]"} Credentials
            </text>
            <text fg={colors.fg}>
                Setup credentials for {String(provider?.toUpperCase() || "UNKNOWN")}:
            </text>

            <box flexDirection="column" gap={1} marginTop={1}>
                {fields.map((f, i) => (
                    <box key={i} flexDirection="column" gap={0}
                        onMouseDown={() => { onFocusChange("body"); set_direct_entry_index(i); }}
                    >
                        <text fg={direct_entry_index === i && focusArea === "body" ? colors.primary : colors.fg}>
                            {String(f.icon)} {String(f.label)}:
                        </text>
                        <input
                            value={wizardInputs[f.key]}
                            onChange={(val) => updateInput(f.key, val, f.ref)}
                            focused={direct_entry_index === i && focusArea === "body"}
                            placeholder={f.placeholder}
                            onKeyDown={(e) => {
                                if (e.name === "return" || e.name === "down") {
                                    set_direct_entry_index(i + 1);
                                } else if (e.name === "up" && i > 0) {
                                    set_direct_entry_index(i - 1);
                                }
                            }}
                        />
                    </box>
                ))}

                <box
                    marginTop={1}
                    onMouseOver={() => { onFocusChange("body"); set_direct_entry_index(fields.length); }}
                    onMouseDown={handleAction}
                    border
                    borderStyle="double"
                    borderColor={isConnectFocused ? colors.success : colors.dim}
                    paddingLeft={2}
                    paddingRight={2}
                    alignItems="center"
                >
                    <text fg={isConnectFocused ? colors.success : colors.dim}>
                        {String(isAuthLoading ? "🔄 CONNECTING..." : "[ VERIFY & CONNECT ]")}
                    </text>
                </box>
            </box>

            {!!authStatus && (
                <text marginTop={1} fg={authStatus.includes("✅") ? colors.success : colors.danger}>
                    {String(authStatus)}
                </text>
            )}
        </box>
    );
};
