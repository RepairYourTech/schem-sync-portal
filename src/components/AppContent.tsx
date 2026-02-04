/** @jsxImportSource @opentui/react */
import { TextAttributes } from "@opentui/core";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import React, { useCallback } from "react";
import { spawn } from "child_process";
import { Splash } from "./Splash";
import { Dashboard } from "./Dashboard";
import { Wizard } from "./Wizard";
import { Options } from "./Options";
import { ForensicView } from "./ForensicView";
import { SyncPortal } from "./SyncPortal";
import { useTheme } from "../lib/theme";
import { saveConfig, type PortalConfig } from "../lib/config";
import { useSync } from "../hooks/useSync";
import { checkDependencies } from "../lib/doctor";
import { Env } from "../lib/env";
import { Hotkey } from "./Hotkey";
import { FontInstaller } from "./FontInstaller";
import { ManualFontGuide } from "./ManualFontGuide";
import { FontMissingBanner } from "./FontMissingBanner";
import { ShieldManager } from "../lib/cleanup";
import { FlexBVIcon } from "./FlexBVIcon";
import { SlimeIcon } from "./SlimeIcon";
import { useAppState } from "../hooks/useAppState";
import { useViewNavigation } from "../hooks/useViewNavigation";

export function AppContent() {
    const {
        config, setConfig,
        view, setView,
        wizardMode, setWizardMode,
        backSignal, setBackSignal,
        deps, setDeps,
        focusArea, setFocusArea,
        bodyIndex, setBodyIndex,
        doctorIndex, setDoctorIndex,
        syncFocusIndex, setSyncFocusIndex,
        syncSubFocusIndex, setSyncSubFocusIndex,
        footerFocus, setFooterFocus,
        tabDirection,
        showFontInstallPrompt, setShowFontInstallPrompt,
        fontInstallerReturnView, setFontInstallerReturnView,
        glyphHighlight, setGlyphHighlight,
        isComplete, isEmpty
    } = useAppState();

    const { colors } = useTheme();
    const renderer = useRenderer();
    const { width, height } = useTerminalDimensions();
    const { progress, isRunning, start, stop, pause, resume } = useSync();

    const handleStartSync = useCallback(() => {
        if (config.source_provider !== "unconfigured" && config.source_provider !== "none" && !isRunning) {
            start(config);
        } else {
            setView("wizard");
        }
    }, [config, isRunning, start, setView]);

    const { handleBack, navigateTo } = useViewNavigation({
        view, setView, setFocusArea, setBackSignal, fontInstallerReturnView, isRunning, stop, handleStartSync
    });

    const getFooterActions = useCallback(() => {
        const actions: { key: string; label: string; action: () => void }[] = [];
        if (view === "dashboard" && !isRunning) {
            actions.push({ key: "o", label: "Options", action: () => navigateTo("options") });
        }
        if ((view as string) === "wizard") {
            actions.push({ key: "b", label: "Back", action: handleBack });
        }
        if (view !== "dashboard") {
            actions.push({
                key: "h", label: "Home", action: () => {
                    if (isRunning) stop();
                    navigateTo("dashboard");
                }
            });
        }
        actions.push({
            key: "escape", label: "Exit", action: () => {
                if (isRunning) stop();
                renderer.destroy();
            }
        });
        return actions;
    }, [view, isRunning, stop, renderer, handleBack, navigateTo]);

    useKeyboard((key) => {
        if (!key) return;

        if (view === "sync") {
            const showSource = config.source_provider !== "none";
            const showShield = config.enable_malware_shield === true;
            const showDest = config.upsync_enabled && config.backup_provider !== "none";
            const panelCount = 1 + (showSource ? 1 : 0) + (showShield ? 1 : 0) + (showDest ? 1 : 0);

            if (key.name === "t") {
                if (isRunning) stop();
                else handleStartSync();
                return;
            }

            if (key.name === "up" || key.name === "k") {
                setSyncFocusIndex(prev => {
                    const panelTypes = ["global"];
                    if (showSource) panelTypes.push("source");
                    if (showShield) panelTypes.push("shield");
                    if (showDest) panelTypes.push("dest");
                    const currentPanelType = panelTypes[prev];
                    const newPanelIndex = (prev === 0 ? panelCount - 1 : prev - 1);
                    const newPanelType = panelTypes[newPanelIndex];
                    if (!((currentPanelType === "source" || currentPanelType === "dest") && (newPanelType === "source" || newPanelType === "dest"))) {
                        setSyncSubFocusIndex(0);
                    }
                    return newPanelIndex;
                });
                return;
            }
            if (key.name === "down" || key.name === "j") {
                setSyncFocusIndex(prev => {
                    const panelTypes = ["global"];
                    if (showSource) panelTypes.push("source");
                    if (showShield) panelTypes.push("shield");
                    if (showDest) panelTypes.push("dest");
                    const currentPanelType = panelTypes[prev];
                    const newPanelIndex = (prev === panelCount - 1 ? 0 : prev + 1);
                    const newPanelType = panelTypes[newPanelIndex];
                    if (!((currentPanelType === "source" || currentPanelType === "dest") && (newPanelType === "source" || newPanelType === "dest"))) {
                        setSyncSubFocusIndex(0);
                    }
                    return newPanelIndex;
                });
                return;
            }

            if (key.name === "left" || key.name === "right" || key.name === "h" || key.name === "l") {
                if (syncFocusIndex > 0) {
                    const panelTypes = ["global"];
                    if (showSource) panelTypes.push("source");
                    if (showShield) panelTypes.push("shield");
                    if (showDest) panelTypes.push("dest");
                    const currentPanelType = panelTypes[syncFocusIndex];
                    const maxSub = (currentPanelType === "source" || currentPanelType === "dest") ? 3 : 0;
                    if (key.name === "left" || key.name === "h") setSyncSubFocusIndex(prev => (prev === 0 ? maxSub : prev - 1));
                    else setSyncSubFocusIndex(prev => (prev >= maxSub ? 0 : prev + 1));
                }
                return;
            }

            if (key.name === "p") { if (!progress.isPaused) pause(); return; }
            if (key.name === "r") { if (progress.isPaused) resume(); return; }

            if (key.name === "4" || key.name === "6" || key.name === "8") {
                const rate = parseInt(key.name) as 4 | 6 | 8;
                let newConfig = { ...config };
                if (syncFocusIndex === 0) { newConfig.downsync_transfers = rate; newConfig.upsync_transfers = rate; }
                else if (syncFocusIndex === 1) { newConfig.downsync_transfers = rate; }
                else if (syncFocusIndex === 3) { newConfig.upsync_transfers = rate; }
                setConfig(newConfig);
                return;
            }

            if (key.name === "return") {
                if (syncFocusIndex === 0) { if (isRunning) stop(); else handleStartSync(); }
                else if (syncFocusIndex > 0) {
                    if (syncSubFocusIndex === 0) { if (progress.isPaused) resume(); else pause(); }
                    else if (syncSubFocusIndex >= 1 && syncSubFocusIndex <= 3) {
                        const rate = (syncSubFocusIndex === 1 ? 4 : syncSubFocusIndex === 2 ? 6 : 8) as 4 | 6 | 8;
                        let newConfig = { ...config };
                        if (syncFocusIndex === 1) newConfig.downsync_transfers = rate;
                        if (syncFocusIndex === 3) newConfig.upsync_transfers = rate;
                        setConfig(newConfig);
                    }
                }
                return;
            }
        }

        if (key.name === "b" && view !== "dashboard" && view !== "sync") {
            handleBack();
            return;
        }

        if (view === "doctor" && focusArea === "body") {
            const showRepair = !deps?.nerdFontDetailed.isInstalled || deps?.nerdFontDetailed.version === 2;
            const showUpgrade = deps?.nerdFontDetailed.version === 2;
            const doctorActions: { key: string; action: () => void }[] = [];
            if (showRepair) doctorActions.push({ key: "r", action: () => { setFontInstallerReturnView("doctor"); setView('fontinstaller'); } });
            if (showUpgrade) doctorActions.push({ key: "u", action: () => { setFontInstallerReturnView("doctor"); setView('fontinstaller'); } });
            doctorActions.push({ key: "t", action: () => { setGlyphHighlight(true); setTimeout(() => setGlyphHighlight(false), 2000); } });
            doctorActions.push({ key: "m", action: () => { setFontInstallerReturnView("doctor"); setView('fontguide'); } });
            doctorActions.push({ key: "b", action: handleBack });

            if (key.name === "left" || key.name === "up") { setDoctorIndex(prev => (prev === 0 ? doctorActions.length - 1 : prev - 1)); return; }
            if (key.name === "right" || key.name === "down") { setDoctorIndex(prev => (prev === doctorActions.length - 1 ? 0 : prev + 1)); return; }
            if (key.name === "return") { doctorActions[doctorIndex]?.action(); return; }
            const hotkeyIdx = doctorActions.findIndex(a => a.key === key.name);
            if (hotkeyIdx !== -1) { setDoctorIndex(hotkeyIdx); return; }
        }

        const actions = getFooterActions();
        const bodyActionsCount = isEmpty ? 1 : (!isComplete ? 2 : 1);

        if (key.name === "tab") {
            if (focusArea === "footer") {
                if (key.shift) {
                    if (footerFocus === 0 || footerFocus === null) {
                        tabDirection.current = "backward";
                        setFocusArea("body"); setFooterFocus(null);
                        if (view === "dashboard") setBodyIndex(bodyActionsCount - 1);
                        if (view === "doctor") {
                            const showRepair = !deps?.nerdFontDetailed.isInstalled || deps?.nerdFontDetailed.version === 2;
                            const showUpgrade = deps?.nerdFontDetailed.version === 2;
                            const count = 3 + (showRepair ? 1 : 0) + (showUpgrade ? 1 : 0);
                            setDoctorIndex(count - 1);
                        }
                    } else setFooterFocus(prev => prev! - 1);
                } else {
                    if (footerFocus === actions.length - 1) {
                        tabDirection.current = "forward";
                        setFocusArea("body"); setFooterFocus(null);
                        if (view === "dashboard") setBodyIndex(0);
                        if (view === "doctor") setDoctorIndex(0);
                    } else setFooterFocus(prev => (prev === null ? 0 : prev + 1));
                }
                return;
            }
            if (focusArea === "body") {
                if (view === "dashboard") {
                    if (key.shift) { if (bodyIndex === 0) { tabDirection.current = "backward"; setFocusArea("footer"); } else setBodyIndex(prev => prev - 1); }
                    else { if (bodyIndex === bodyActionsCount - 1) { tabDirection.current = "forward"; setFocusArea("footer"); } else setBodyIndex(prev => prev + 1); }
                    return;
                }
                if (view === "doctor") {
                    const showRepair = !deps?.nerdFontDetailed.isInstalled || deps?.nerdFontDetailed.version === 2;
                    const showUpgrade = deps?.nerdFontDetailed.version === 2;
                    const count = 3 + (showRepair ? 1 : 0) + (showUpgrade ? 1 : 0);
                    if (key.shift) { if (doctorIndex === 0) { tabDirection.current = "backward"; setFocusArea("footer"); } else setDoctorIndex(prev => prev - 1); }
                    else { if (doctorIndex >= count - 1) { tabDirection.current = "forward"; setFocusArea("footer"); } else setDoctorIndex(prev => prev + 1); }
                    return;
                }
                if (view === "sync") {
                    const showSource = config.source_provider !== "none";
                    const showShield = config.enable_malware_shield === true;
                    const showDest = config.upsync_enabled && config.backup_provider !== "none";
                    const count = 1 + (showSource ? 1 : 0) + (showShield ? 1 : 0) + (showDest ? 1 : 0);
                    if (key.shift) { if (syncFocusIndex === 0) { tabDirection.current = "backward"; setFocusArea("footer"); setFooterFocus(0); } else setSyncFocusIndex(prev => prev - 1); }
                    else { if (syncFocusIndex >= count - 1) { tabDirection.current = "forward"; setFocusArea("footer"); setFooterFocus(0); } else setSyncFocusIndex(prev => prev + 1); }
                    return;
                }
                tabDirection.current = key.shift ? "backward" : "forward";
                setFocusArea("footer"); setFooterFocus(0);
                return;
            }
        }

        if (focusArea === "footer") {
            if (key.name === "left" || key.name === "up") { setFooterFocus(prev => (prev === null || prev === 0) ? actions.length - 1 : prev - 1); return; }
            else if (key.name === "right" || key.name === "down") { setFooterFocus(prev => (prev === null || prev === actions.length - 1) ? 0 : prev + 1); return; }
            else if (key.name === "return" && footerFocus !== null) { actions[footerFocus]?.action(); return; }
            const quickAction = actions.find(a => a.key === key.name);
            if (quickAction) { quickAction.action(); return; }
        }

        if (focusArea === "body" && view === "dashboard") {
            if (key.name === "left" || key.name === "up") setBodyIndex(prev => (prev === 0 ? bodyActionsCount - 1 : prev - 1));
            else if (key.name === "right" || key.name === "down") setBodyIndex(prev => (prev === bodyActionsCount - 1 ? 0 : prev + 1));
            else if (key.name === "return") {
                if (isEmpty) { setWizardMode("restart"); setView("wizard"); }
                else if (!isComplete) { setWizardMode(bodyIndex === 0 ? "continue" : "restart"); setView("wizard"); }
                else setView("sync");
            }
            if (!isRunning) {
                if (key.name === "s") setBodyIndex(isEmpty ? 0 : 1);
                if (key.name === "c" && !isEmpty && !isComplete) setBodyIndex(0);
                if (key.name === "t" && isComplete) setBodyIndex(0);
            }
        }

        if (key.name === "escape") {
            const escIndex = actions.findIndex(a => a.key === "escape");
            if (escIndex !== -1) { setFocusArea("footer"); setFooterFocus(escIndex); return; }
            return;
        }
    });

    const onWizardComplete = useCallback((newConfig: PortalConfig) => {
        saveConfig(newConfig); setConfig(newConfig); setView("dashboard");
    }, [setConfig, setView]);

    const onUpdateWizard = useCallback((newConfig: PortalConfig) => {
        saveConfig(newConfig); setConfig(newConfig);
    }, [setConfig]);

    const onReset = useCallback(async () => {
        const deploy = await import("../lib/deploy");
        deploy.removeSystemBootstrap();
        const { removePortalConfig, removeLegacySource } = await import("../lib/rclone");
        removePortalConfig([Env.REMOTE_PORTAL_SOURCE, Env.REMOTE_PORTAL_BACKUP, "gdrive_portal"]);
        removeLegacySource();
        try {
            const { unlinkSync } = await import("fs");
            unlinkSync("/tmp/portal_auth.log");
        } catch (err) {
            const { Logger } = await import("../lib/logger");
            Logger.debug("SYSTEM", "Failed to remove portal_auth.log", err);
        }

        const configM = await import("../lib/config");
        configM.clearConfig();
        setConfig(configM.EMPTY_CONFIG);
        setWizardMode("restart"); setView("dashboard"); setFocusArea("body");
    }, [setConfig, setWizardMode, setView, setFocusArea]);

    const onResetShield = useCallback(() => ShieldManager.resetShield(), []);

    const activeFontVersion = config.nerd_font_version || 2;

    const renderDashboard = () => (
        <box flexShrink={0}>
            <Dashboard
                config={config}
                isFocused={focusArea === "body"}
                selectedIndex={bodyIndex}
                onSelectionChange={setBodyIndex}
                onFocusChange={setFocusArea}
                onAction={(key) => {
                    if (key === "s") { setView("wizard"); setWizardMode("restart"); }
                    else if (key === "c") { setView("wizard"); setWizardMode("continue"); }
                    else if (key === "t") { setView("sync"); }
                }}
            />
        </box>
    );

    const renderDoctor = () => (
        <box flexDirection="column" padding={1} border borderStyle="double" borderColor={colors.primary} title="[ SYSTEM DIAGNOSTICS ]" gap={1}>
            {deps ? (
                <>
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
                    <box flexDirection="column" marginTop={1} padding={1} border borderStyle="single" borderColor={colors.border} title="[ FONT MANAGEMENT ]">
                        <box flexDirection="row" gap={2} flexWrap="wrap">
                            {(() => {
                                const showRepair = !deps?.nerdFontDetailed.isInstalled || deps?.nerdFontDetailed.version === 2;
                                const showUpgrade = deps?.nerdFontDetailed.version === 2;
                                let currentIdx = 0;
                                const elements = [];
                                if (showRepair) {
                                    const isFocused = focusArea === "body" && doctorIndex === currentIdx;
                                    elements.push(<box key="r" border={isFocused} borderStyle="single" borderColor={isFocused ? colors.success : "transparent"} paddingLeft={1} paddingRight={1} height={1}><Hotkey keyLabel="r" label="Repair/Install" isFocused={isFocused} /></box>);
                                    currentIdx++;
                                }
                                if (showUpgrade) {
                                    const isFocused = focusArea === "body" && doctorIndex === currentIdx;
                                    elements.push(<box key="u" border={isFocused} borderStyle="single" borderColor={isFocused ? colors.success : "transparent"} paddingLeft={1} paddingRight={1} height={1}><Hotkey keyLabel="u" label="Upgrade to v3" isFocused={isFocused} /></box>);
                                    currentIdx++;
                                }
                                const tFocused = focusArea === "body" && doctorIndex === currentIdx;
                                elements.push(<box key="t" border={tFocused} borderStyle="single" borderColor={tFocused ? colors.success : "transparent"} paddingLeft={1} paddingRight={1} height={1}><Hotkey keyLabel="t" label="Test Glyphs" isFocused={tFocused} /></box>);
                                currentIdx++;
                                const mFocused = focusArea === "body" && doctorIndex === currentIdx;
                                elements.push(<box key="m" onMouseDown={() => spawn(process.platform === "win32" ? "start" : (process.platform === "darwin" ? "open" : "xdg-open"), ["https://pldaniels.com/flexbv5/manual.html"], { detached: true, stdio: "ignore" })} border={mFocused} borderStyle="single" borderColor={mFocused ? colors.success : "transparent"} paddingLeft={1} paddingRight={1} height={1}><Hotkey keyLabel="m" label="Manual Guide" isFocused={mFocused} /></box>);
                                currentIdx++;
                                const bFocused = focusArea === "body" && doctorIndex === currentIdx;
                                elements.push(<box key="b" onMouseDown={handleBack} border={bFocused} borderStyle="single" borderColor={bFocused ? colors.success : "transparent"} paddingLeft={1} paddingRight={1} height={1}><Hotkey keyLabel="b" label="Back" isFocused={bFocused} /></box>);
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

    return (
        <box flexDirection="column" height={height} width={width} backgroundColor="transparent" padding={1}>
            <box flexDirection="column" flexGrow={1} paddingBottom={1}>
                {view === "dashboard" && !isRunning ? <Splash /> : null}
                {view === "dashboard" ? renderDashboard() : null}
                {showFontInstallPrompt && view === "dashboard" ? (
                    <FontMissingBanner
                        onInstall={() => { setShowFontInstallPrompt(false); setFontInstallerReturnView("dashboard"); setView('fontinstaller'); }}
                        onSkip={() => { setShowFontInstallPrompt(false); const next = { ...config, nerd_font_auto_install_dismissed: true }; setConfig(next); saveConfig(next); }}
                        onLearnMore={() => { setShowFontInstallPrompt(false); setFontInstallerReturnView("dashboard"); setView('fontguide'); }}
                    />
                ) : null}
                {view === "sync" ? <SyncPortal config={config} progress={progress} isRunning={isRunning} onStop={stop} onStart={handleStartSync} onPause={pause} onResume={resume} configLoaded={!isEmpty} focusArea={focusArea} onFocusChange={setFocusArea} focusIndex={syncFocusIndex} onFocusIndexChange={setSyncFocusIndex} subFocusIndex={syncSubFocusIndex} onSubFocusIndexChange={setSyncSubFocusIndex} onUpdateConfig={(nc) => { setConfig(nc); saveConfig(nc); }} /> : null}
                {view === "wizard" ? <Wizard initialConfig={config} mode={wizardMode} onUpdate={onUpdateWizard} onComplete={onWizardComplete} onCancel={() => setView("dashboard")} onQuit={() => renderer.destroy()} focusArea={focusArea} onFocusChange={setFocusArea} tabTransition={tabDirection.current} backSignal={backSignal} /> : null}
                {view === "options" ? <Options onDoctor={() => setView("doctor")} onSetup={() => { setView("wizard"); setWizardMode("edit"); }} onForensic={() => setView("forensic")} onReset={onReset} onResetShield={onResetShield} onBack={() => setView("dashboard")} focusArea={focusArea} onFocusChange={setFocusArea} tabTransition={tabDirection.current} config={config} onUpdateConfig={(nc) => { saveConfig(nc); setConfig(nc); }} /> : null}
                {view === "forensic" ? <ForensicView targetDir={config.local_dir && config.local_dir !== "none" ? config.local_dir : ""} gdriveRemote={config.source_provider === "gdrive" ? Env.REMOTE_PORTAL_SOURCE : (config.backup_provider === "gdrive" ? Env.REMOTE_PORTAL_BACKUP : null)} onComplete={() => setView("options")} onCancel={() => setView("options")} /> : null}
                {view === "doctor" ? renderDoctor() : null}
                {view === "fontinstaller" ? <FontInstaller returnView={fontInstallerReturnView} onComplete={async (res) => { if (res.success) { const next = { ...config, nerd_font_version: 3 as const, nerd_font_installed_family: res.installedFamily, nerd_font_last_check: Date.now() }; setConfig(next); saveConfig(next); setDeps(await checkDependencies()); } setView(fontInstallerReturnView); }} onCancel={() => setView(fontInstallerReturnView)} /> : null}
                {view === "fontguide" ? <ManualFontGuide returnView={fontInstallerReturnView} onClose={() => setView(fontInstallerReturnView)} /> : null}
            </box>

            <box border borderStyle="single" borderColor={colors.border} padding={1} flexDirection="column" height={10} flexShrink={0} width="100%">
                <box flexDirection="row" justifyContent="space-between" alignItems="center" width="100%" height={3}>
                    <box flexDirection="column">
                        <box flexDirection="row" alignItems="center" gap={1}>
                            <FlexBVIcon />
                            <text onMouseDown={() => spawn(process.platform === "win32" ? "start" : (process.platform === "darwin" ? "open" : "xdg-open"), ["https://pldaniels.com/flexbv5/"], { detached: true, stdio: "ignore" })} fg="#3a7af5" attributes={TextAttributes.UNDERLINE}>Best Used With FlexBV</text>
                        </box>
                        <box flexDirection="row" alignItems="center" gap={1}>
                            <SlimeIcon version={activeFontVersion} />
                            <text onMouseDown={() => spawn(process.platform === "win32" ? "start" : (process.platform === "darwin" ? "open" : "xdg-open"), ["https://slimeinacloak.github.io/crypto"], { detached: true, stdio: "ignore" })} fg="#ffff00" attributes={TextAttributes.UNDERLINE}>Buy Slime A Coffee</text>
                        </box>
                    </box>
                    <box flexDirection="row" gap={2}>
                        {(getFooterActions() || []).map((action, i) => {
                            const isFocused = focusArea === "footer" && footerFocus === i;
                            return (
                                <box key={i} onMouseOver={() => { setFocusArea("footer"); setFooterFocus(i); }} onMouseDown={() => action.action()} border={isFocused} borderStyle="single" borderColor={isFocused ? (action.key === "escape" ? colors.danger : colors.success) : "transparent"} paddingLeft={1} paddingRight={1} height={1}>
                                    <Hotkey keyLabel={action.key === "escape" ? "ESC" : action.key} label={action.label} isFocused={isFocused} />
                                </box>
                            );
                        })}
                    </box>
                </box>
                <box alignSelf="center" marginTop={1} flexDirection="column" alignItems="center" width="100%">
                    <text attributes={TextAttributes.DIM} fg={colors.dim}>TAB: Cycle Areas | ARROWS: Navigate | ENTER: Select</text>
                    <text attributes={TextAttributes.DIM} fg={colors.dim}>Hotkey + ENTER to confirm</text>
                </box>
            </box>
        </box>
    );
}
