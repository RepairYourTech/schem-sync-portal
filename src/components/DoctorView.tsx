/** @jsxImportSource @opentui/react */
import React from "react";
import { TextAttributes } from "@opentui/core";
import { Hotkey } from "./Hotkey";
import { type ThemeColors } from "../lib/theme";
import { type DependencyStatus } from "../lib/doctor";
import { type ViewName, type FocusArea } from "../hooks/useAppState";

interface DoctorViewProps {
    colors: ThemeColors;
    deps: DependencyStatus | null;
    focusArea: FocusArea;
    doctorIndex: number;
    activeFontVersion: 2 | 3;
    glyphHighlight: boolean;
    setFocusArea: (area: FocusArea) => void;
    setDoctorIndex: (idx: number) => void;
    setView: (view: ViewName) => void;
    setFontInstallerReturnView: (view: ViewName) => void;
    setGlyphHighlight: (highlight: boolean) => void;
    handleBack: () => void;
}

export const DoctorView = React.memo(({
    colors,
    deps,
    focusArea,
    doctorIndex,
    activeFontVersion,
    glyphHighlight,
    setFocusArea,
    setDoctorIndex,
    setView,
    setFontInstallerReturnView,
    setGlyphHighlight,
    handleBack
}: DoctorViewProps) => {
    return (
        <box flexDirection="column" flexGrow={1} padding={1} border borderStyle="double" borderColor={colors.primary} title="[ SYSTEM DIAGNOSTICS ]" gap={1}>
            {deps ? (
                <>
                    <box flexDirection="column" gap={1} flexGrow={1}>
                        <text fg={deps.bun ? colors.success : colors.danger}>Bun Runtime: {String(deps.bun || "MISSING")}</text>
                        <text fg={deps.zig ? colors.success : colors.danger}>Zig Compiler: {String(deps.zig || "MISSING")}</text>
                        <text fg={deps.rclone ? colors.success : colors.danger}>Rclone Sync: {String(deps.rclone || "MISSING")}{String(deps.rcloneVersion ? ` (${deps.isRcloneModern ? "Modern" : "Legacy"} v${deps.rcloneVersion})` : "")}</text>
                        <text fg={deps.archive ? colors.success : colors.danger}>Archive Engines (7z/RAR): {String(deps.archive || "MISSING")}</text>
                        <text fg={deps.clipboard ? colors.success : colors.warning}>Clipboard Utility: {String(deps.clipboard || "NOT FOUND (OSC 52 Fallback)")}</text>
                        <box flexDirection="column" border borderStyle="single" borderColor={colors.border} padding={1} marginTop={1}>
                            <text fg={colors.primary} attributes={TextAttributes.BOLD}>Font Health: {String(deps.nerdFontDetailed.isInstalled ? "INSTALLED" : "NOT DETECTED")}</text>
                            <text fg={colors.primary}>Detection Method: {String(deps.nerdFontDetailed.method)}</text>
                            <text fg={colors.primary}>Confidence Level: {String(deps.nerdFontDetailed.confidence)}%</text>
                            <text fg={deps.nerdFontDetailed.version === 3 ? colors.success : (deps.nerdFontDetailed.version === 2 ? colors.setup : colors.danger)}>Version: v{String(deps.nerdFontDetailed.version || "Unknown")}</text>
                            {deps.nerdFontDetailed.installedFonts.length > 0 && <text fg={colors.dim} attributes={TextAttributes.DIM}>Installed: {String(deps.nerdFontDetailed.installedFonts.slice(0, 3).join(", "))}</text>}
                        </box>
                    </box>
                    <box flexDirection="column" marginTop="auto" padding={1} border borderStyle="single" borderColor={colors.border} title="[ FONT MANAGEMENT ]">
                        <box flexDirection="row" gap={2} flexWrap="wrap">
                            {(() => {
                                const showRepair = !deps?.nerdFontDetailed.isInstalled || deps?.nerdFontDetailed.version === 2;
                                const showUpgrade = deps?.nerdFontDetailed.version === 2;
                                let currentIdx = 0;
                                const elements = [];
                                if (showRepair) {
                                    const itemIdx = currentIdx;
                                    const isFocused = focusArea === "body" && doctorIndex === itemIdx;
                                    elements.push(
                                        <box
                                            key="r"
                                            onMouseOver={() => { setFocusArea("body"); setDoctorIndex(itemIdx); }}
                                            onMouseDown={() => { setFontInstallerReturnView("doctor"); setView('fontinstaller'); }}
                                            border={isFocused}
                                            borderStyle="single"
                                            borderColor={isFocused ? colors.success : "transparent"}
                                            paddingLeft={1}
                                            paddingRight={1}
                                            height={1}
                                        >
                                            <Hotkey keyLabel="r" label="Repair/Install" isFocused={isFocused} />
                                        </box>
                                    );
                                    currentIdx++;
                                }
                                if (showUpgrade) {
                                    const itemIdx = currentIdx;
                                    const isFocused = focusArea === "body" && doctorIndex === itemIdx;
                                    elements.push(
                                        <box
                                            key="u"
                                            onMouseOver={() => { setFocusArea("body"); setDoctorIndex(itemIdx); }}
                                            onMouseDown={() => { setFontInstallerReturnView("doctor"); setView('fontinstaller'); }}
                                            border={isFocused}
                                            borderStyle="single"
                                            borderColor={isFocused ? colors.success : "transparent"}
                                            paddingLeft={1}
                                            paddingRight={1}
                                            height={1}
                                        >
                                            <Hotkey keyLabel="u" label="Upgrade to v3" isFocused={isFocused} />
                                        </box>
                                    );
                                    currentIdx++;
                                }
                                const tIdx = currentIdx;
                                const tFocused = focusArea === "body" && doctorIndex === tIdx;
                                elements.push(
                                    <box
                                        key="t"
                                        onMouseOver={() => { setFocusArea("body"); setDoctorIndex(tIdx); }}
                                        onMouseDown={() => { setGlyphHighlight(true); setTimeout(() => setGlyphHighlight(false), 2000); }}
                                        border={tFocused}
                                        borderStyle="single"
                                        borderColor={tFocused ? colors.success : "transparent"}
                                        paddingLeft={1}
                                        paddingRight={1}
                                        height={1}
                                    >
                                        <Hotkey keyLabel="t" label="Test Glyphs" isFocused={tFocused} />
                                    </box>
                                );
                                currentIdx++;
                                const mIdx = currentIdx;
                                const mFocused = focusArea === "body" && doctorIndex === mIdx;
                                elements.push(
                                    <box
                                        key="m"
                                        onMouseOver={() => { setFocusArea("body"); setDoctorIndex(mIdx); }}
                                        onMouseDown={() => { setFontInstallerReturnView("doctor"); setView('fontguide'); }}
                                        border={mFocused}
                                        borderStyle="single"
                                        borderColor={mFocused ? colors.success : "transparent"}
                                        paddingLeft={1}
                                        paddingRight={1}
                                        height={1}
                                    >
                                        <Hotkey keyLabel="m" label="Manual Guide" isFocused={mFocused} />
                                    </box>
                                );
                                currentIdx++;
                                const bIdx = currentIdx;
                                const bFocused = focusArea === "body" && doctorIndex === bIdx;
                                elements.push(
                                    <box
                                        key="b"
                                        onMouseOver={() => { setFocusArea("body"); setDoctorIndex(bIdx); }}
                                        onMouseDown={handleBack}
                                        border={bFocused}
                                        borderStyle="single"
                                        borderColor={bFocused ? colors.success : "transparent"}
                                        paddingLeft={1}
                                        paddingRight={1}
                                        height={1}
                                    >
                                        <Hotkey keyLabel="b" label="Back" isFocused={bFocused} />
                                    </box>
                                );
                                return elements;
                            })()}
                        </box>
                    </box>
                    <box flexDirection="column" marginTop={1} padding={1} border borderStyle="rounded" borderColor={glyphHighlight ? colors.primary : colors.success} title="[ GLYPH TEST ]">
                        <box flexDirection="row" gap={2}>
                            <text fg={activeFontVersion === 2 ? colors.success : colors.dim}>[ {'\uf61a'} ] Legacy Cat (v2){activeFontVersion === 2 ? " ★" : ""}</text>
                            <text fg={activeFontVersion === 3 ? colors.success : colors.dim}>[ {'\ueeed'} ] Modern Cat (v3 FA){activeFontVersion === 3 ? " ★" : ""}</text>
                        </box>
                        <box flexDirection="row" gap={2}>
                            <text fg={activeFontVersion === 3 ? colors.success : colors.dim}>[ {'\u{f011b}'} ] MDI Cat (v3 MDI)</text>
                            <text fg={colors.success}>[ {'\uf07b'} ] Folder</text>
                            <text fg={colors.success}>[ {'\ue615'} ] Gear</text>
                        </box>
                    </box>
                </>
            ) : <text fg={colors.dim}>Running diagnostics...</text>}
        </box>
    );
});
DoctorView.displayName = "DoctorView";
