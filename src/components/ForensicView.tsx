import { useKeyboard } from "@opentui/react";
import React, { useState, useEffect } from "react";
import { runForensicSweep, type ForensicProgress } from "../lib/forensics";
import { useTheme } from "../lib/theme";
import { TextAttributes } from "@opentui/core";
import { join } from "path";



interface ForensicViewProps {
    targetDir: string;
    gdriveRemote: string | null;
    onComplete: () => void;
    onCancel: () => void;
}

export function ForensicView({ targetDir, gdriveRemote, onComplete: _onComplete, onCancel }: ForensicViewProps) {
    const { colors } = useTheme();
    const [progress, setProgress] = useState<ForensicProgress | null>(null);

    useEffect(() => {
        const excludeFile = join(process.env.HOME || "", ".config", "rclone", "schematics-exclude.txt");
        runForensicSweep(targetDir, excludeFile, gdriveRemote, (p) => setProgress(p));
    }, [targetDir, gdriveRemote]);

    useKeyboard((e) => {
        if (e.name === "escape" && (progress?.status === "done" || progress?.status === "error")) {
            onCancel();
        }
    });

    const percentage = progress?.totalFiles ? Math.round((progress.filesProcessed / progress.totalFiles) * 100) : 0;

    return (
        <box flexDirection="column" padding={1} border borderStyle="double" borderColor={colors.primary} title="[ FORENSIC DEEP-SCAN ]" gap={1}>
            <text fg={colors.fg} attributes={TextAttributes.BOLD}>Surgical Malware Remediation Protocol 🛡️</text>

            <box flexDirection="column" gap={0} marginTop={1}>
                <text fg={colors.dim}>STATUS: <text fg={progress?.status === "done" ? colors.success : colors.primary}>{progress?.status?.toUpperCase() || "INITIALIZING"}</text></text>
                <text fg={colors.dim}>FILE: <text fg={colors.fg}>{progress?.currentFile || "..."}</text></text>
            </box>

            <box flexDirection="column" gap={0} marginTop={1}>
                <text fg={colors.primary}>PROGRESS: [{progress?.filesProcessed || 0} / {progress?.totalFiles || 0}] archives cleaned</text>
                <box width={40} border borderStyle="single" borderColor={colors.dim}>
                    <box width={Math.floor((percentage / 100) * 38)} backgroundColor={colors.success} height={1} />
                </box>
            </box>

            {(progress?.status === "done" || progress?.status === "error") && (
                <box marginTop={1} flexDirection="column" gap={0}>
                    {progress?.status === "done" ? (
                        <text fg={colors.success}>✅ MISSION ACCOMPLISHED. SYSTEM RESILIENT.</text>
                    ) : (
                        <text fg={colors.danger}>❌ SCANNER FAILURE: {progress?.currentFile}</text>
                    )}
                    <text fg={colors.dim}>Results isolated to _risk_tools/ and excluded from Cloud Sync.</text>
                </box>
            )}
        </box>
    );
}
