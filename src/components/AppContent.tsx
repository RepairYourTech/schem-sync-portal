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
import { DoctorView } from "./DoctorView";
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
import { ShieldManager } from "../lib/shield/ShieldManager";
import { ShieldExecutor } from "../lib/shield/ShieldExecutor";
import { FlexBVIcon } from "./FlexBVIcon";
import { SlimeIcon } from "./SlimeIcon";
import { UpdateNotice } from "./UpdateNotice";
import { useAppState } from "../hooks/useAppState";
import { useViewNavigation } from "../hooks/useViewNavigation";
import { Logger } from "../lib/logger";
import pkg from "../../package.json";

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
        wizardReturnView, setWizardReturnView,
        glyphHighlight, setGlyphHighlight,
        updateCheck,
        isComplete, isEmpty
    } = useAppState();

    const { colors } = useTheme();
    const renderer = useRenderer();
    const { width, height } = useTerminalDimensions();
    const { progress, isRunning, start, stop, pause, resume, pausePhase, resumePhase, isPhasePaused, updateProgress } = useSync();

    const handleStartSync = useCallback(() => {
        if (config.source_provider !== "unconfigured" && config.source_provider !== "none" && !isRunning) {
            start(config);
        } else {
            setWizardReturnView("dashboard");
            setView("wizard");
        }
    }, [config, isRunning, start, setView, setWizardReturnView]);

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

                const visiblePanels: string[] = ["global"];
                if (config.source_provider !== "none") visiblePanels.push("source");
                if (config.enable_malware_shield) visiblePanels.push("shield");
                if (config.upsync_enabled && config.backup_provider !== "none") visiblePanels.push("dest");

                const panelType = visiblePanels[syncFocusIndex];
                if (panelType === "global") { newConfig.downsync_transfers = rate; newConfig.upsync_transfers = rate; }
                else if (panelType === "source") { newConfig.downsync_transfers = rate; }
                else if (panelType === "dest") { newConfig.upsync_transfers = rate; }

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
            const quickActionIdx = actions.findIndex(a => a.key === key.name);
            if (quickActionIdx !== -1) { setFooterFocus(quickActionIdx); return; }
        }

        if (focusArea === "body" && view === "dashboard") {
            if (key.name === "left" || key.name === "up") setBodyIndex(prev => (prev === 0 ? bodyActionsCount - 1 : prev - 1));
            else if (key.name === "right" || key.name === "down") setBodyIndex(prev => (prev === bodyActionsCount - 1 ? 0 : prev + 1));
            else if (key.name === "return") {
                if (isEmpty) { setWizardReturnView("dashboard"); setWizardMode("restart"); setView("wizard"); }
                else if (!isComplete) { setWizardReturnView("dashboard"); setWizardMode(bodyIndex === 0 ? "continue" : "restart"); setView("wizard"); }
                else setView("sync");
            }
            if (!isRunning) {
                if (key.name === "s") { setBodyIndex(isEmpty ? 0 : 1); }
                if (key.name === "c" && !isEmpty && !isComplete) { setBodyIndex(0); }
                if (key.name === "t" && isComplete) setBodyIndex(0);
            }
        }

        if (key.name === "escape") {
            const escIndex = actions.findIndex(a => a.key === "escape");
            if (escIndex !== -1) {
                setFocusArea("footer");
                setFooterFocus(escIndex);
                // We do NOT call actions[escIndex].action() here.
                // The user must press ENTER to confirm the focused "Exit" action.
            }
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
        setWizardReturnView("dashboard"); setWizardMode("restart"); setView("dashboard"); setFocusArea("body");
    }, [setConfig, setWizardMode, setView, setFocusArea, setWizardReturnView]);

    const onResetShield = useCallback(() => ShieldManager.resetShield(config.local_dir), [config.local_dir]);

    const onScan = useCallback(async () => {
        setView("sync"); // Switch to sync view to see progress
        try {
            await ShieldExecutor.scanLocal({
                localDir: config.local_dir,
                policy: config.malware_policy || "purge",
                onProgress: (p) => updateProgress(p)
            });
        } catch (err) {
            Logger.error("SHIELD", "Standalone scan failed", err as Error);
        }
    }, [config.local_dir, config.malware_policy, updateProgress, setView]);

    const activeFontVersion = config.nerd_font_version || 2;

    return (
        <box flexDirection="column" height={height} width={width} backgroundColor="transparent" padding={1}>
            <box flexDirection="column" flexGrow={1} paddingBottom={1}>
                {view === "dashboard" && !isRunning ? <Splash updateInfo={updateCheck.updateInfo} /> : null}
                {view === "dashboard" ? (
                    <Dashboard
                        config={config}
                        isFocused={focusArea === "body"}
                        selectedIndex={bodyIndex}
                        onSelectionChange={setBodyIndex}
                        onFocusChange={setFocusArea}
                        onAction={(key) => {
                            if (key === "s") { setWizardReturnView("dashboard"); setView("wizard"); setWizardMode("restart"); }
                            else if (key === "c") { setWizardReturnView("dashboard"); setView("wizard"); setWizardMode("continue"); }
                            else if (key === "t") { setView("sync"); }
                        }}
                    />
                ) : null}
                {showFontInstallPrompt && view === "dashboard" ? (
                    <FontMissingBanner
                        onInstall={() => { setShowFontInstallPrompt(false); setFontInstallerReturnView("dashboard"); setView('fontinstaller'); }}
                        onSkip={() => { setShowFontInstallPrompt(false); const next = { ...config, nerd_font_auto_install_dismissed: true }; setConfig(next); saveConfig(next); }}
                        onLearnMore={() => { setShowFontInstallPrompt(false); setFontInstallerReturnView("dashboard"); setView('fontguide'); }}
                    />
                ) : null}
                {view === "sync" ? <SyncPortal config={config} progress={progress} isRunning={isRunning} onStop={stop} onStart={handleStartSync} onPause={pause} onResume={resume} onPausePull={() => pausePhase('pull')} onResumePull={() => resumePhase('pull')} onPauseShield={() => pausePhase('shield')} onResumeShield={() => resumePhase('shield')} onPauseCloud={() => pausePhase('cloud')} onResumeCloud={() => resumePhase('cloud')} isPhasePaused={isPhasePaused} configLoaded={!isEmpty} focusArea={focusArea} onFocusChange={setFocusArea} focusIndex={syncFocusIndex} onFocusIndexChange={setSyncFocusIndex} subFocusIndex={syncSubFocusIndex} onSubFocusIndexChange={setSyncSubFocusIndex} onUpdateConfig={(nc) => { setConfig(nc); saveConfig(nc); }} /> : null}
                {view === "wizard" ? <Wizard initialConfig={config} mode={wizardMode} onUpdate={onUpdateWizard} onComplete={onWizardComplete} onCancel={() => setView(wizardReturnView)} onQuit={() => renderer.destroy()} focusArea={focusArea} onFocusChange={setFocusArea} tabTransition={tabDirection.current} backSignal={backSignal} /> : null}
                {view === "options" ? <Options onDoctor={() => setView("doctor")} onSetup={() => { setWizardReturnView("options"); setView("wizard"); setWizardMode("edit"); }} onScan={onScan} onForensic={() => setView("forensic")} onReset={onReset} onResetShield={onResetShield} onBack={() => setView("dashboard")} focusArea={focusArea} onFocusChange={setFocusArea} tabTransition={tabDirection.current} config={config} onUpdateConfig={(nc) => { saveConfig(nc); setConfig(nc); }} updateCheck={updateCheck} /> : null}
                {view === "forensic" ? <ForensicView targetDir={config.local_dir && config.local_dir !== "none" ? config.local_dir : ""} gdriveRemote={config.source_provider === "gdrive" ? Env.REMOTE_PORTAL_SOURCE : (config.backup_provider === "gdrive" ? Env.REMOTE_PORTAL_BACKUP : null)} onComplete={() => setView("options")} onCancel={() => setView("options")} /> : null}
                {view === "doctor" ? (
                    <DoctorView
                        colors={colors}
                        deps={deps}
                        focusArea={focusArea}
                        doctorIndex={doctorIndex}
                        activeFontVersion={activeFontVersion}
                        glyphHighlight={glyphHighlight}
                        setFocusArea={setFocusArea}
                        setDoctorIndex={setDoctorIndex}
                        setView={setView}
                        setFontInstallerReturnView={setFontInstallerReturnView}
                        setGlyphHighlight={setGlyphHighlight}
                        handleBack={handleBack}
                    />
                ) : null}
                {view === "fontinstaller" ? <FontInstaller returnView={fontInstallerReturnView} onComplete={async (res) => { if (res.success) { const next = { ...config, nerd_font_version: 3 as const, nerd_font_installed_family: res.installedFamily, nerd_font_last_check: Date.now() }; setConfig(next); saveConfig(next); setDeps(await checkDependencies()); } setView(fontInstallerReturnView); }} onCancel={() => setView(fontInstallerReturnView)} /> : null}
                {view === "fontguide" ? <ManualFontGuide returnView={fontInstallerReturnView} onClose={() => setView(fontInstallerReturnView)} /> : null}
            </box>

            <box border borderStyle="single" borderColor={colors.border} padding={1} flexDirection="column" height={10} flexShrink={0} width="100%">
                <box flexDirection="row" justifyContent="space-between" alignItems="center" width="100%" height={3}>
                    <box flexDirection="column">
                        <box flexDirection="row" alignItems="center" gap={1}>
                            <FlexBVIcon />
                            <text onMouseDown={() => spawn(process.platform === "win32" ? "start" : (process.platform === "darwin" ? "open" : "xdg-open"), ["https://pldaniels.com/flexbv5/?rfid=schport"], { detached: true, stdio: "ignore" })} fg="#3a7af5" attributes={TextAttributes.UNDERLINE}>Best Used With FlexBV</text>
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
                    <text attributes={TextAttributes.DIM} fg={colors.dim}>v{String(pkg.version)}<UpdateNotice available={updateCheck.updateInfo?.available} /> | Hotkey + ENTER to confirm</text>
                </box>
            </box>
        </box>
    );
}
