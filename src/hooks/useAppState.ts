import { useState, useEffect, useRef } from "react";
import { loadConfig, saveConfig, isConfigComplete, isConfigEmpty, type PortalConfig } from "../lib/config";
import { checkDependencies, type DependencyStatus } from "../lib/doctor";
import { checkFontGuard } from "../lib/fontGuard";
import { Logger } from "../lib/logger";
import { useUpdateCheck } from "./useUpdateCheck";

export type ViewName = "dashboard" | "wizard" | "doctor" | "options" | "sync" | "forensic" | "fontinstaller" | "fontguide";
export type WizardMode = "continue" | "restart" | "edit";
export type FocusArea = "header" | "body" | "footer";

export function useAppState() {
    const [config, setConfig] = useState<PortalConfig>(loadConfig());
    const [view, setView] = useState<ViewName>("dashboard");
    const [wizardMode, setWizardMode] = useState<WizardMode>("continue");
    const [backSignal, setBackSignal] = useState(0);
    const [deps, setDeps] = useState<DependencyStatus | null>(null);
    const [focusArea, setFocusArea] = useState<FocusArea>("body");
    const [bodyIndex, setBodyIndex] = useState(0);
    const [doctorIndex, setDoctorIndex] = useState(0);
    const [syncFocusIndex, setSyncFocusIndex] = useState(0);
    const [syncSubFocusIndex, setSyncSubFocusIndex] = useState(0);
    const [footerFocus, setFooterFocus] = useState<number | null>(null);
    const [showFontInstallPrompt, setShowFontInstallPrompt] = useState(false);
    const [fontInstallerReturnView, setFontInstallerReturnView] = useState<ViewName>("doctor");
    const [wizardReturnView, setWizardReturnView] = useState<ViewName>("dashboard");
    const [glyphHighlight, setGlyphHighlight] = useState(false);
    const updateCheck = useUpdateCheck();

    const configRef = useRef<PortalConfig>(config);
    const tabDirection = useRef<"forward" | "backward" | null>(null);

    useEffect(() => {
        const runChecks = async () => {
            const currentDeps = await checkDependencies();
            setDeps(currentDeps);

            setConfig(prev => {
                if (prev.nerd_font_version === undefined) {
                    const detected = currentDeps.recommendedVersion;
                    const next = { ...prev, nerd_font_version: detected };
                    saveConfig(next);
                    Logger.debug("SYSTEM", `Auto-detected Nerd Font v${detected}. Saving.`);
                    return next;
                }
                return prev;
            });

            const guardStatus = await checkFontGuard(config);
            if (guardStatus.requiresInstallation && !config.nerd_font_auto_install_dismissed) {
                setShowFontInstallPrompt(true);
            }

            if (guardStatus.isInstalled && guardStatus.installedFamily) {
                setConfig(prev => {
                    if (prev.nerd_font_installed_family !== (guardStatus.installedFamily || undefined)) {
                        const next = {
                            ...prev,
                            nerd_font_installed_family: guardStatus.installedFamily || undefined,
                            nerd_font_last_check: Date.now()
                        };
                        saveConfig(next);
                        return next;
                    }
                    return prev;
                });
            }
        };

        runChecks();
    }, [view, config.nerd_font_auto_install_dismissed]);

    useEffect(() => {
        const level = config.log_level || (config.debug_mode ? "DEBUG" : "NORMAL");
        Logger.setLevel(level);
    }, [config.log_level, config.debug_mode]);

    useEffect(() => {
        saveConfig(config);
        configRef.current = config;
    }, [config]);

    return {
        config, setConfig, configRef,
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
        isComplete: isConfigComplete(config),
        isEmpty: isConfigEmpty(config)
    };
}
