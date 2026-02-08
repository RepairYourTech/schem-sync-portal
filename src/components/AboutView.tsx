/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "./Hotkey";
import { UpdateNotice } from "./UpdateNotice";
import pkg from "../../package.json";
import { type UpdateInfo } from "../lib/versionChecker";
import { type UpdateStatus } from "../lib/updater";
import { type ThemeColors } from "../lib/theme";

interface AboutViewProps {
    colors: ThemeColors;
    updateCheck: {
        updateInfo: UpdateInfo | null;
        isChecking: boolean;
        refresh: () => void;
    };
    isUpdating: boolean;
    updateStatus: UpdateStatus | null;
    selectedIndex: number;
    focusArea: string;
    onFocusChange: (area: "body" | "footer") => void;
    setSelectedIndex: (idx: number) => void;
    handleUpdate: () => void;
    setSubView: (view: "menu" | "about" | "logs" | "debug" | "shield") => void;
    setUpdateStatus: (status: UpdateStatus | null) => void;
}

export const AboutView = ({
    colors,
    updateCheck,
    isUpdating,
    updateStatus,
    selectedIndex,
    focusArea,
    onFocusChange,
    setSelectedIndex,
    handleUpdate,
    setSubView,
    setUpdateStatus
}: AboutViewProps) => {
    return (
        <box flexDirection="column" flexGrow={1} padding={1} border borderStyle="double" borderColor={colors.primary} title="[ ABOUT & UPDATES ]" gap={1}>
            <box flexDirection="column" gap={0} flexGrow={1}>
                <box flexDirection="column" gap={0} marginBottom={1}>
                    <text fg={colors.fg} attributes={TextAttributes.BOLD}>
                        Schematic Sync Portal v{String(pkg.version)}
                        <UpdateNotice available={updateCheck.updateInfo?.available} />
                    </text>
                    <text fg={colors.dim}>Universal Sync Client for CopyParty</text>
                    {!!updateCheck.updateInfo?.available && (
                        <text fg={colors.success}>Latest: {updateCheck.updateInfo.latestVersion} ({new Date(updateCheck.updateInfo.publishedAt).toLocaleDateString()})</text>
                    )}
                </box>

                <box flexDirection="column" gap={0}>
                    <text fg={colors.primary}>REPO:</text>
                    <text fg={colors.fg}>https://github.com/RepairYourTech/schem-sync-portal</text>
                </box>

                <box flexDirection="column" gap={0} marginTop={1}>
                    <text fg={colors.primary}>CHANGELOG:</text>
                    <text fg={colors.fg}>https://github.com/RepairYourTech/schem-sync-portal/releases</text>
                </box>

                <box flexDirection="column" gap={0} marginTop={1}>
                    <text fg={colors.primary}>CREDITS:</text>
                    <text fg={colors.fg}>• BirdMan & RepairYourTech Contributors</text>
                    <text fg={colors.fg}>• Slime (IYKYK)</text>
                    <text fg={colors.fg}>• Paul Daniels (FlexBV Developer)</text>
                </box>
            </box>

            <box border borderStyle="single" borderColor={colors.border} padding={1} marginTop="auto" flexDirection="column" gap={1}>
                <text fg={colors.fg}>Update application code (Non-Destructive):</text>
                <box flexDirection="row" gap={2}>
                    <box
                        onMouseOver={() => {
                            onFocusChange("body");
                            setSelectedIndex(0);
                        }}
                        onMouseDown={() => {
                            if (isUpdating || updateCheck.isChecking) return;
                            if (updateCheck.updateInfo?.available) handleUpdate();
                            else updateCheck.refresh();
                        }}
                        border={focusArea === "body" && selectedIndex === 0}
                        borderStyle="single"
                        borderColor={focusArea === "body" && selectedIndex === 0 ? colors.success : "transparent"}
                        paddingLeft={1}
                        paddingRight={1}
                    >
                        <Hotkey
                            keyLabel="u"
                            label={isUpdating ? "UPDATING..." : (updateCheck.isChecking ? "CHECKING..." : (updateCheck.updateInfo?.available ? "Install Update" : "Check for Updates"))}
                            isFocused={focusArea === "body" && selectedIndex === 0}
                        />
                    </box>
                    <box
                        onMouseOver={() => {
                            onFocusChange("body");
                            setSelectedIndex(1);
                        }}
                        onMouseDown={() => {
                            setSubView("menu");
                            setUpdateStatus(null);
                        }}
                        border={focusArea === "body" && selectedIndex === 1}
                        borderStyle="single"
                        borderColor={focusArea === "body" && selectedIndex === 1 ? colors.success : "transparent"}
                        paddingLeft={1}
                        paddingRight={1}
                    >
                        <Hotkey
                            keyLabel="b"
                            label="Back"
                            isFocused={focusArea === "body" && selectedIndex === 1}
                        />
                    </box>
                </box>
                {updateStatus ? (
                    <box marginTop={0}>
                        <text fg={updateStatus.success ? colors.success : colors.danger}>
                            {String(updateStatus.success ? "✅ " : "❌ ")}{String(updateStatus.message)}
                        </text>
                    </box>
                ) : null}
            </box>
        </box>
    );
};
AboutView.displayName = "AboutView";
