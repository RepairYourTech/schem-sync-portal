/** @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react";
import React, { useState, useEffect } from "react";
import { runForensicSweep, type ForensicProgress } from "../lib/forensics";
import { useTheme } from "../lib/theme";
import { TextAttributes } from "@opentui/core";
import { join } from "path";
import { Hotkey } from "./Hotkey";



interface ForensicViewProps {
    targetDir: string;
    gdriveRemote: string | null;
    onComplete: () => void;
    onCancel: () => void;
}

export function ForensicView({ targetDir: initialTarget, gdriveRemote, onComplete: _onComplete, onCancel }: ForensicViewProps) {
    const { colors } = useTheme();
    const [targetDir, setTargetDir] = useState(initialTarget);
    const [progress, setProgress] = useState<ForensicProgress | null>(null);
    const [isStarted, setIsStarted] = useState(initialTarget !== "");
    const [hoveredButton, setHoveredButton] = useState<number | null>(null);

    useEffect(() => {
        if (isStarted && targetDir) {
            const excludeFile = join(process.env.HOME || "", ".config", "rclone", "schematics-exclude.txt");
            runForensicSweep(targetDir, excludeFile, gdriveRemote, (p) => setProgress(p));
        }
    }, [isStarted]); // Only run when isStarted changes to true

    useEffect(() => {
        setHoveredButton(null);
    }, [isStarted, progress?.status]);

    useKeyboard((e) => {
        if (e.name === "escape") {
            if (!isStarted || progress?.status === "done" || progress?.status === "error") {
                onCancel();
            }
        }
        if (e.name === "return" && !isStarted && targetDir) {
            setIsStarted(true);
        }
    });

    const percentage = progress?.totalFiles ? Math.round((progress.filesProcessed / progress.totalFiles) * 100) : 0;

    return (
        <box flexDirection="column" flexGrow={1} padding={1} border borderStyle="double" borderColor={colors.primary} title="[ FORENSIC DEEP-SCAN ]" gap={1}>
            <text fg={colors.fg} attributes={TextAttributes.BOLD}>Surgical Malware Remediation Protocol 🛡️</text>

            {!isStarted ? (
                <box flexDirection="column" gap={1} marginTop={1}>
                    <text fg={colors.warning}>⚠️ No target directory detected.</text>
                    <text fg={colors.fg}>Please specify the folder to scan (Deep Recursive Search):</text>
                    <box border borderStyle="single" borderColor={colors.primary} padding={1}>
                        <input
                            focused
                            value={targetDir}
                            onChange={(val) => setTargetDir(val)}
                            placeholder="/path/to/schematics"
                            onKeyDown={(e) => { if (e.name === "return" && targetDir) setIsStarted(true); }}
                        />
                    </box>
                    <text fg={colors.dim} marginTop={1}>Scan depth: UNLIMITED (All nested subfolders)</text>
                    <box marginTop={1} flexDirection="row" gap={2}>
                        <box
                            onMouseOver={() => setHoveredButton(0)}
                            onMouseDown={() => { if (targetDir) setIsStarted(true); }}
                            border={hoveredButton === 0}
                            borderStyle="single"
                            borderColor={hoveredButton === 0 ? colors.success : "transparent"}
                            paddingLeft={1}
                            paddingRight={1}
                        >
                            <Hotkey keyLabel="enter" label="START SCAN" isFocused={hoveredButton === 0} />
                        </box>
                        <box
                            onMouseOver={() => setHoveredButton(1)}
                            onMouseDown={onCancel}
                            border={hoveredButton === 1}
                            borderStyle="single"
                            borderColor={hoveredButton === 1 ? colors.success : "transparent"}
                            paddingLeft={1}
                            paddingRight={1}
                        >
                            <Hotkey keyLabel="escape" label="CANCEL" isFocused={hoveredButton === 1} />
                        </box>
                    </box>
                </box>
            ) : (
                <box flexDirection="column" gap={1}>
                    <box flexDirection="column" gap={0} marginTop={1}>
                        <box flexDirection="row">
                            <text fg={colors.dim}>STATUS: </text>
                            <text fg={progress?.status === "done" ? colors.success : colors.primary}>{String(progress?.status?.toUpperCase() || "INITIALIZING")}</text>
                        </box>
                        <box flexDirection="row">
                            <text fg={colors.dim}>FILE: </text>
                            <text fg={colors.fg}>{String(progress?.currentFile || "...")}</text>
                        </box>
                    </box>

                    <box flexDirection="column" gap={0} marginTop={1}>
                        <text fg={colors.primary}>PROGRESS: [{String(progress?.filesProcessed || 0)} / {String(progress?.totalFiles || 0)}] archives cleaned</text>
                        <box width={40} border borderStyle="single" borderColor={colors.dim}>
                            <box width={Math.floor((percentage / 100) * 38)} backgroundColor={colors.success} height={1} />
                        </box>
                        <text fg={colors.dim} marginTop={1}>Scanning all nested subfolders...</text>
                    </box>

                    {(progress?.status === "done" || progress?.status === "error") ? (
                        <box marginTop={1} paddingLeft={1} paddingRight={1} height={5} border={false} borderStyle="single" borderColor={colors.primary} flexDirection="column" justifyContent="center" alignItems="center">
                            <text fg={colors.fg} attributes={TextAttributes.BOLD}>{progress.status === "done" ? "🛡️ AUDIT COMPLETE" : "💥 ERROR OCCURRED"}</text>
                            <box marginTop={1}
                                onMouseOver={() => setHoveredButton(2)}
                                onMouseDown={onCancel}
                                border={hoveredButton === 2}
                                borderStyle="single"
                                borderColor={hoveredButton === 2 ? colors.success : "transparent"}
                                paddingLeft={1}
                                paddingRight={1}
                            >
                                <Hotkey keyLabel="escape" label="Return to Options" isFocused={hoveredButton === 2} />
                            </box>
                        </box>
                    ) : null}
                </box>
            )}
            <text fg={colors.dim} marginTop={1}>Results isolated to _risk_tools/ and excluded from Cloud Sync.</text>
        </box>
    );
}
