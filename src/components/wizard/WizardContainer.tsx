/** @jsxImportSource @opentui/react */
import React, { useState, useCallback, useRef, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import type { PortalConfig, PortalProvider } from "../../lib/config.ts";
import { updateGdriveRemote, updateGenericRemote, authorizeRemote } from "../../lib/rclone.ts";
import { useWizardAuth } from "../../hooks/useWizardAuth";
import { TextAttributes } from "@opentui/core";
import { bootstrapSystem, isSystemBootstrapped } from "../../lib/deploy.ts";
import { join } from "path";
import { useTheme } from "../../lib/theme";
import { Logger } from "../../lib/logger";
import { PROVIDER_REGISTRY } from "../../lib/providers";

// Modular Imports
import type { Step, WizardOption, WizardKeyEvent, WizardProps } from "./types";
import type { WizardStepProps } from "./StepProps";

import { WizardFooter } from "./WizardFooter";
import { WizardStepRenderer } from "./WizardStepRenderer";
import { getStepContext, findNextStep } from "./wizard-utils";

export const WizardContainer = React.memo(({ onComplete, onUpdate, onCancel, onQuit: _onQuit, initialConfig, mode, focusArea, onFocusChange: _onFocusChange, backSignal }: WizardProps) => {
    const { colors } = useTheme();
    const keyboardHandlerRef = useRef<(e: WizardKeyEvent) => void>(undefined);
    useKeyboard((e) => keyboardHandlerRef.current?.(e));
    const isBootstrapped = isSystemBootstrapped();
    const savedShortcutState = initialConfig.desktop_shortcut;

    const [wizardContext, setWizardContextState] = useState<"source" | "dest">("source");
    const wizardContextRef = useRef<"source" | "dest">("source");

    const setWizardContext = useCallback((newCtx: "source" | "dest") => {
        Logger.debug("UI", `[WIZARD] Switching context: ${wizardContextRef.current} -> ${newCtx}`);
        wizardContextRef.current = newCtx;
        setWizardContextState(newCtx);
    }, []);

    const isShortcutMissing = savedShortcutState === 1 && !isBootstrapped;
    const initialStep = findNextStep(initialConfig, mode);
    const [step, setStep] = useState<Step>(initialStep);
    const [isMenuMode] = useState(initialStep === "edit_menu");
    const [config, setConfig] = useState<PortalConfig>({
        ...initialConfig,
        desktop_shortcut: isBootstrapped ? 1 : (initialConfig.desktop_shortcut ?? 0)
    });
    const configRef = useRef<PortalConfig>(config);

    const [selectedIndex, setSelectedIndex] = useState(0);
    const [copyparty_config_index, set_copyparty_config_index] = useState(0);
    const [direct_entry_index, set_direct_entry_index] = useState(0);
    const [isAuthLoading, setIsAuthLoading] = useState(false);
    const [authStatus, setAuthStatus] = useState<string | null>(null);
    const pendingSourceProviderRef = useRef<PortalProvider>(initialConfig.source_provider);
    const pendingBackupProviderRef = useRef<PortalProvider>(initialConfig.backup_provider);
    const pendingCloudPathRef = useRef<"guided" | "direct">("direct");

    const urlRef = useRef("");
    const userRef = useRef("");
    const passRef = useRef("");
    const clientIdRef = useRef("");
    const clientSecretRef = useRef("");
    const b2IdRef = useRef("");
    const b2KeyRef = useRef("");
    const [wizardInputs, setWizardInputs] = useState({
        url: "", user: "", pass: "", clientId: "", clientSecret: "", b2Id: "", b2Key: "", oauthToken: ""
    });

    const updateInput = useCallback((key: string, value: string, ref: React.MutableRefObject<string>) => {
        setWizardInputs(prev => ({ ...prev, [key]: value }));
        ref.current = value;
    }, []);

    const oauthTokenRef = useRef("");
    const authAbortControllerRef = useRef<AbortController | null>(null);
    const [history, setHistory] = useState<Step[]>([]);
    const stepStartTime = useRef(Date.now());

    const abortAuth = useCallback(() => {
        if (authAbortControllerRef.current) {
            authAbortControllerRef.current.abort();
            authAbortControllerRef.current = null;
        }
    }, []);

    const updateConfig = useCallback((updater: (prev: PortalConfig) => PortalConfig) => {
        const nextConfig = updater(configRef.current);
        configRef.current = nextConfig;
        setConfig(nextConfig);
        if (onUpdate) onUpdate(nextConfig);
    }, [onUpdate]);

    const stateRef = useRef({ step, config, history });
    stateRef.current = { step, config, history };

    const resetWizardRefs = useCallback(() => {
        urlRef.current = ""; userRef.current = ""; passRef.current = "";
        clientIdRef.current = ""; clientSecretRef.current = "";
        b2IdRef.current = ""; b2KeyRef.current = ""; oauthTokenRef.current = "";
        setWizardInputs({
            url: "", user: "", pass: "", clientId: "", clientSecret: "", b2Id: "", b2Key: "", oauthToken: ""
        });
        abortAuth();
        setAuthStatus(null);
    }, [abortAuth]);

    const getCurrentStepNumber = useCallback(() => history.length + 1, [history]);

    const back = useCallback(() => {
        const { history: h } = stateRef.current;
        if (h.length > 0) {
            const prev = h[h.length - 1];
            setHistory(h.slice(0, -1));
            setStep(prev!);
            setSelectedIndex(0);
            stepStartTime.current = Date.now();
        } else {
            onCancel();
        }
    }, [onCancel]);

    const lastBackSignal = useRef(backSignal);
    useEffect(() => {
        if (backSignal > lastBackSignal.current) {
            lastBackSignal.current = backSignal;
            back();
        }
    }, [backSignal, back]);

    useEffect(() => {
        const context = getStepContext(step, history);
        if (context) setWizardContext(context);
    }, [step, history, setWizardContext]);

    const next = useCallback(() => {
        const { step: s } = stateRef.current;
        const c = configRef.current;
        const currentSource = pendingSourceProviderRef.current;
        const currentBackup = pendingBackupProviderRef.current;
        setHistory(prev => [...prev, s]);
        setSelectedIndex(0);

        setStep(prevStep => {
            let nextStep = prevStep;
            switch (prevStep) {
                case "shortcut": nextStep = "download_mode"; break;
                case "download_mode": nextStep = "source_choice"; break;
                case "source_choice":
                    resetWizardRefs();
                    setWizardContext("source");
                    if (currentSource === "unconfigured") return prevStep;
                    if (currentSource === "copyparty") {
                        nextStep = "copyparty_config";
                    } else if (currentSource === "none") {
                        nextStep = (isMenuMode ? "edit_menu" : "dir");
                    } else {
                        const meta = PROVIDER_REGISTRY[currentSource];
                        nextStep = meta ? (meta.id + "_intro") as Step : (isMenuMode ? "edit_menu" : "dir");
                    }
                    break;
                case "copyparty_config": nextStep = (isMenuMode ? "edit_menu" : "dir"); break;
                case "dir": nextStep = (isMenuMode ? "edit_menu" : "mirror"); break;
                case "mirror": nextStep = (isMenuMode ? "edit_menu" : "upsync_ask"); break;
                case "upsync_ask":
                    if (selectedIndex === 1) {
                        resetWizardRefs();
                        setWizardContext("dest");
                        nextStep = "dest_cloud_select";
                    } else {
                        nextStep = (isMenuMode ? "edit_menu" : "security");
                    }
                    break;
                case "dest_cloud_select":
                    if (currentBackup === "unconfigured") return prevStep;
                    {
                        const meta = PROVIDER_REGISTRY[currentBackup];
                        nextStep = meta?.hasGuidedPath || meta?.hasDirectPath ? (meta.id + "_intro") as Step : (isMenuMode ? "edit_menu" : "backup_dir");
                    }
                    break;
                case "backup_dir": nextStep = (isMenuMode ? "edit_menu" : "security"); break;
                case "security": nextStep = (isMenuMode ? "edit_menu" : "deploy"); break;
                case "cloud_direct_entry": nextStep = (isMenuMode ? "edit_menu" : (wizardContextRef.current === "source" ? "dir" : "backup_dir")); break;
                case "deploy": onComplete(c); break;
                default:
                    // Generic Provider Step Handling
                    const provider = Object.values(PROVIDER_REGISTRY).find(p => prevStep.startsWith(p.id + "_"));
                    if (provider) {
                        if (prevStep.endsWith("_intro")) {
                            if (pendingCloudPathRef.current === "guided" && provider.steps.length > 0) {
                                // Jump to first guide step (skipping intro if it's steps[0])
                                const guideIdx = provider.steps.findIndex(s => s.includes("_guide_"));
                                nextStep = (guideIdx !== -1 ? provider.steps[guideIdx] : (provider.steps[1] || provider.steps[0])) as Step;
                            } else {
                                nextStep = "cloud_direct_entry";
                            }
                        } else if (prevStep.includes("_guide_")) {
                            const idx = provider.steps.indexOf(prevStep);
                            nextStep = (idx !== -1 && idx < provider.steps.length - 1) ? provider.steps[idx + 1] as Step : "cloud_direct_entry";
                        }
                    }

                    break;
            }
            stepStartTime.current = Date.now();
            return nextStep;
        });
    }, [onComplete, wizardContext, isMenuMode, selectedIndex]);

    const getOptions = useCallback(() => {
        if (step === "shortcut") return isShortcutMissing ? [{ value: 1, type: "bootstrap" }, { value: 2, type: "shortcut" }, { value: 0, type: "skip" }] : [{ value: 1, type: "desktop_shortcut" }, { value: 0, type: "desktop_shortcut" }];
        if (step === "download_mode") return [{ value: "full", type: "download_mode" }, { value: "lean", type: "download_mode" }];
        if (step === "edit_menu") return [{ value: "shortcut", type: "jump" }, { value: "download_mode", type: "jump" }, { value: "source_choice", type: "jump" }, { value: "dir", type: "jump" }, { value: "mirror", type: "jump" }, { value: "upsync_ask", type: "jump" }, { value: "security", type: "jump" }, { value: "deploy", type: "jump" }];
        if (step === "source_choice") return Object.keys(PROVIDER_REGISTRY).filter(k => !["none", "unconfigured"].includes(k)).map(v => ({ value: v, type: "source_select" }));

        if (step === "mirror") return [{ value: false, type: "mirror" }, { value: true, type: "mirror" }];
        if (step === "dir" || step === "backup_dir") return [{ value: config.local_dir, type: "dir_input" }, { value: "confirm", type: "dir_confirm" }];
        if (step === "upsync_ask") return [{ value: "download_only", type: "sync_mode" }, { value: "sync_backup", type: "sync_mode" }];
        if (step === "security") {
            const opts = [{ value: "isolate", type: "sec_policy" }, { value: "purge", type: "sec_policy" }, { value: false, type: "sec_toggle" }];
            return config.backup_provider === "gdrive" ? opts.filter(o => o.value !== false) : opts;
        }
        if (step === "dest_cloud_select") return Object.keys(PROVIDER_REGISTRY).filter(k => !["none", "unconfigured", "copyparty"].includes(k)).map(v => ({ value: v, type: "backup_provider" }));
        if (step?.endsWith("_intro")) {
            const provider = Object.values(PROVIDER_REGISTRY).find(p => step.startsWith(p.id + "_"));
            const opts = [];
            if (provider?.hasGuidedPath) opts.push({ value: "guided", type: "intro_path" });
            if (provider?.hasDirectPath) opts.push({ value: "direct", type: "intro_path" });
            return opts;
        }
        if (step?.includes("_guide_")) return [{ value: true, type: "guide_next" }];
        if (step === "deploy") return [{ value: true, type: "deploy" }, { value: false, type: "deploy" }];
        return [];
    }, [step, isShortcutMissing, config.backup_provider]);

    const { handleAuth, handleGdriveAuth, startGenericAuth, dispatchDirectAuth } = useWizardAuth({
        next,
        updateConfig,
        config,
        setAuthStatus,
        setIsAuthLoading,
        urlRef,
        userRef,
        passRef,
        clientIdRef,
        clientSecretRef,
        b2IdRef,
        b2KeyRef,
        authAbortControllerRef,
        oauthTokenRef,
        wizardContext,
        pendingSourceProviderRef,
        pendingBackupProviderRef,
        abortAuth
    });

    const confirmSelection = useCallback((opt: WizardOption) => {
        if (!opt) return;
        if (opt.type === "deploy") { if (opt.value) onComplete(config); else onCancel(); return; }


        if (opt.type === "intro_path") { pendingCloudPathRef.current = opt.value as "guided" | "direct"; next(); return; }
        if (opt.type === "guide_next") { next(); return; }
        if (opt.type === "desktop_shortcut") { if (opt.value === 1) bootstrapSystem(join(process.cwd(), "src/index.tsx")); updateConfig(prev => ({ ...prev, desktop_shortcut: opt.value as number })); next(); return; }
        if (opt.type === "download_mode") { updateConfig(prev => ({ ...prev, download_mode: opt.value as "full" | "lean" })); next(); return; }
        if (opt.type === "jump") { const targetStep = opt.value as Step; if (targetStep === "source_choice" || targetStep === "copyparty_config") setWizardContext("source"); if (targetStep === "dest_cloud_select") setWizardContext("dest"); setStep(targetStep); return; }
        if (opt.type === "dir_confirm") { if (config.local_dir && config.local_dir !== "" && config.local_dir !== "none") next(); return; }
        if (opt.type === "sec_policy") { updateConfig(prev => ({ ...prev, enable_malware_shield: true, malware_policy: opt.value as "purge" | "isolate" })); next(); }
        else if (opt.type === "sec_toggle") { updateConfig(prev => ({ ...prev, enable_malware_shield: opt.value as boolean })); next(); }
        else if (opt.type === "source_select") {
            const provider = opt.value as PortalProvider;
            pendingSourceProviderRef.current = provider;
            updateConfig(prev => ({ ...prev, source_provider: provider }));
            next();
        }
        else if (opt.type === "backup_provider") {
            const provider = opt.value as PortalProvider;
            pendingBackupProviderRef.current = provider;
            updateConfig(prev => ({ ...prev, backup_provider: provider }));
            setWizardContext("dest");
            next();
        }
        else if (opt.type === "sync_mode") {
            const newVal = opt.value === "sync_backup";
            updateConfig(prev => ({ ...prev, upsync_enabled: newVal }));
            if (newVal) { setWizardContext("dest"); setStep("dest_cloud_select"); }
            else setStep("deploy");
            setSelectedIndex(0);
        } else {

            const fieldMap: Record<string, keyof PortalConfig> = { mirror: "strict_mirror" };
            const field = fieldMap[opt.type as string];
            if (field) updateConfig(prev => ({ ...prev, [field]: opt.value }));
            next();
        }
    }, [config, mode, next, updateConfig, onComplete, onCancel]);

    keyboardHandlerRef.current = (e: WizardKeyEvent) => {
        if (focusArea === "body") {
            if (e.name === "tab") {
                if (step === "copyparty_config") {
                    if (e.shift) {
                        if (copyparty_config_index === 0) _onFocusChange("footer");
                        else set_copyparty_config_index(prev => prev - 1);
                    } else {
                        if (copyparty_config_index === 4) _onFocusChange("footer");
                        else set_copyparty_config_index(prev => prev + 1);
                    }
                } else if (step === "cloud_direct_entry") {
                    const provider = wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current;
                    const maxIdx = (provider === "sftp" || provider === "r2") ? 3 : 2;
                    if (e.shift) {
                        if (direct_entry_index === 0) _onFocusChange("footer");
                        else set_direct_entry_index(prev => prev - 1);
                    } else {
                        if (direct_entry_index === maxIdx) _onFocusChange("footer");
                        else set_direct_entry_index(prev => prev + 1);
                    }
                } else if (step === "dir" || step === "backup_dir") {
                    if (e.shift) {
                        if (selectedIndex === 0) _onFocusChange("footer");
                        else setSelectedIndex(prev => prev - 1);
                    } else {
                        if (selectedIndex === 1) _onFocusChange("footer");
                        else setSelectedIndex(prev => prev + 1);
                    }
                } else {
                    const options = getOptions();
                    if (options.length > 0) {
                        if (e.shift) {
                            if (selectedIndex === 0) _onFocusChange("footer");
                            else setSelectedIndex(prev => prev - 1);
                        } else {
                            if (selectedIndex === options.length - 1) _onFocusChange("footer");
                            else setSelectedIndex(prev => prev + 1);
                        }
                    } else _onFocusChange("footer");
                }
                return;
            }

            if (step === "copyparty_config") {
                if (e.name >= "0" && e.name <= "9") return;
                if (e.name === "down") { set_copyparty_config_index(prev => Math.min(4, prev + 1)); return; }
                else if (e.name === "up") { set_copyparty_config_index(prev => Math.max(0, prev - 1)); return; }
                if (copyparty_config_index === 3) {
                    if (e.name === "left") { setSelectedIndex(0); updateConfig(prev => ({ ...prev, copyparty_method: "webdav" })); return; }
                    if (e.name === "right") { setSelectedIndex(1); updateConfig(prev => ({ ...prev, copyparty_method: "http" })); return; }
                }
            }

            if (step === "cloud_direct_entry") {
                if (e.name >= "0" && e.name <= "9") return;
                const provider = wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current;
                const maxIdx = (provider === "sftp" || provider === "r2") ? 3 : 2;
                if (e.name === "down") { set_direct_entry_index(prev => Math.min(maxIdx, prev + 1)); return; }
                else if (e.name === "up") { set_direct_entry_index(prev => Math.max(0, prev - 1)); return; }
            }

            if (e.name === "return") {
                if (step === "copyparty_config") {
                    if (copyparty_config_index === 4) handleAuth();
                    else set_copyparty_config_index(prev => Math.min(4, prev + 1));
                    return;
                }
                if (step === "cloud_direct_entry") {
                    const provider = wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current;
                    const maxIdx = (provider === "sftp" || provider === "r2") ? 3 : 2;
                    if (direct_entry_index === maxIdx) {
                        if (!isAuthLoading) {
                            dispatchDirectAuth(provider);
                        }
                    } else set_direct_entry_index(prev => prev + 1);

                    return;
                }
            }
        }

        const selectableSteps: Step[] = ["shortcut", "download_mode", "source_choice", "dir", "mirror", "upsync_ask", "dest_cloud_select", "backup_dir", "security", "edit_menu", "gdrive_intro", "gdrive_guide_1", "gdrive_guide_2", "gdrive_guide_3", "gdrive_guide_4", "b2_intro", "sftp_intro", "pcloud_intro", "onedrive_intro", "dropbox_intro", "mega_intro", "r2_intro", "s3_intro", "deploy", "cloud_direct_entry"];
        if (selectableSteps.includes(step)) {
            const options = getOptions();
            if (options.length === 0) return;

            if (e.name === "down") setSelectedIndex(prev => (prev + 1) % options.length);
            else if (e.name === "up") setSelectedIndex(prev => (prev - 1 + options.length) % options.length);
            else if (e.name >= "1" && e.name <= "9") {
                const idx = parseInt(e.name) - 1;
                if (idx < options.length) setSelectedIndex(idx);
            } else if (e.name === "return") confirmSelection(options[selectedIndex]!);
        }
    };

    const stepProps: WizardStepProps = {
        config, updateConfig, next, back, onComplete, onCancel, onQuit: _onQuit, getCurrentStepNumber,
        colors, focusArea, onFocusChange: _onFocusChange, selectedIndex, setSelectedIndex, confirmSelection,
        getOptions, isAuthLoading, authStatus, setAuthStatus, handleAuth, handleGdriveAuth, startGenericAuth,
        dispatchDirectAuth,
        wizardInputs, updateInput, refs: { urlRef, userRef, passRef, clientIdRef, clientSecretRef, b2IdRef, b2KeyRef },
        isShortcutMissing, copyparty_config_index, set_copyparty_config_index, direct_entry_index, set_direct_entry_index,
        wizardContext, pendingSourceProvider: pendingSourceProviderRef.current, pendingBackupProvider: pendingBackupProviderRef.current,
        fontVersion: config.nerd_font_version || 2, updateGenericRemote, updateGdriveRemote, authorizeRemote,
        step
    };

    return (
        <box flexDirection="column" padding={1} border borderStyle="double" borderColor={colors.primary} title="[ SYSTEM CONFIGURATION WIZARD ]" gap={1}>
            <WizardStepRenderer step={step} stepProps={stepProps} />
            <WizardFooter />
            {!!(config.debug_mode) && (
                <box marginTop={1} border borderStyle="single" borderColor={colors.border} padding={1} flexDirection="row">
                    <text attributes={TextAttributes.DIM} fg={colors.dim}>PROGRESS: </text>
                    <text attributes={TextAttributes.DIM} fg={colors.dim}>{String(step).toUpperCase()}</text>
                </box>
            )}
        </box>
    );
});

WizardContainer.displayName = "WizardContainer";
