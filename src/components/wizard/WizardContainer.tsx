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
import { Env } from "../../lib/env";

// Modular Imports
import type { Step, WizardOption, WizardKeyEvent, WizardProps } from "./types";
import { TEXT_INPUT_STEPS, COPYPARTY_ROW, COPYPARTY_LAST_ROW, NTFY_ROW, NTFY_LAST_ROW, directEntryFieldCount } from "./types";
import { getStepOptions, directEntryMissingFields } from "./wizardOptions";
import type { WizardStepProps, NtfyStepActions } from "./StepProps";

import { WizardFooter } from "./WizardFooter";
import { WizardStepRenderer } from "./WizardStepRenderer";
import { getStepContext, findNextStep, resolveNextStep } from "./wizard-utils";

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
    const [ntfy_config_index, set_ntfy_config_index] = useState(0);
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
    const ntfyActionsRef = useRef<NtfyStepActions | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);
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
            // Respect returnView if provided, otherwise fallback to onCancel
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

    // Per-step focus indices are separate from selectedIndex and persisted across visits.
    // Without this, returning to cloud_direct_entry for the backup provider started with
    // the CONNECT button focused, mid-form.
    useEffect(() => {
        set_direct_entry_index(0);
        set_copyparty_config_index(0);
        set_ntfy_config_index(0);
    }, [step]);

    const next = useCallback(() => {
        const { step: currentStep } = stateRef.current;
        const c = configRef.current;

        if (currentStep === "deploy") { onComplete(c); return; }

        const nextStep = resolveNextStep(currentStep, {
            config: c,
            isMenuMode,
            sourceProvider: pendingSourceProviderRef.current,
            backupProvider: pendingBackupProviderRef.current,
            cloudPath: pendingCloudPathRef.current,
            wizardContext: wizardContextRef.current
        });

        // A prerequisite is unmet (e.g. no provider chosen). Stay put without polluting
        // history: pushing here meant Back had to be pressed twice.
        if (!nextStep || nextStep === currentStep) return;

        // Entering a provider flow starts from clean credential fields.
        if (currentStep === "source_choice") { resetWizardRefs(); setWizardContext("source"); }
        if (currentStep === "upsync_ask" && c.upsync_enabled) { resetWizardRefs(); setWizardContext("dest"); }

        setHistory(prev => [...prev, currentStep]);
        setSelectedIndex(0);
        stepStartTime.current = Date.now();
        setStep(nextStep);
    }, [onComplete, isMenuMode, resetWizardRefs, setWizardContext]);

    const getOptions = useCallback(
        () => getStepOptions(step, config, isShortcutMissing),
        [step, config, isShortcutMissing]
    );

    const {
        handleAuth,
        handleGdriveAuth,
        startGenericAuth,
        dispatchDirectAuth,
        activeAuthRequestRef
    } = useWizardAuth({
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
        if (opt.type === "back") { back(); return; }
        if (opt.type === "deploy") { if (opt.value) onComplete(config); else onCancel(); return; }


        if (opt.type === "intro_path") { pendingCloudPathRef.current = opt.value as "guided" | "direct"; next(); return; }
        if (opt.type === "guide_next") { next(); return; }
        if (opt.type === "desktop_shortcut") {
            if (opt.value === 1) bootstrapSystem(join(process.cwd(), "src/index.tsx"));
            // desktop_shortcut semantics (config.ts): 0=unset, 1=on, 2=skipped. Storing 0
            // for "NO" left it unset, so the question was asked again on every launch.
            updateConfig(prev => ({ ...prev, desktop_shortcut: opt.value === 1 ? 1 : 2 }));
            next();
            return;
        }
        // Recovery options shown when the launcher went missing. These fell through to a
        // bare next(), so "RECREATE" recreated nothing and "don't ask again" kept asking.
        if (opt.type === "bootstrap") { bootstrapSystem(join(process.cwd(), "src/index.tsx")); updateConfig(prev => ({ ...prev, desktop_shortcut: 1 })); next(); return; }
        if (opt.type === "shortcut") { updateConfig(prev => ({ ...prev, desktop_shortcut: 2 })); next(); return; }
        if (opt.type === "skip") { next(); return; }
        if (opt.type === "download_mode") { updateConfig(prev => ({ ...prev, download_mode: opt.value as "full" | "lean" })); next(); return; }
        if (opt.type === "jump") {
            const targetStep = opt.value as Step;
            if (targetStep === "source_choice" || targetStep === "copyparty_config") setWizardContext("source");
            if (targetStep === "dest_cloud_select") setWizardContext("dest");
            // Record where we came from, so Back returns to the menu instead of
            // popping an empty history and closing the wizard entirely.
            setHistory(prev => [...prev, "edit_menu"]);
            setSelectedIndex(0);
            setStep(targetStep);
            return;
        }
        // Enter while the path input has focus must not skip validation. Move focus to
        // the confirm row instead; the user still has to accept the path.
        if (opt.type === "dir_input") { setSelectedIndex(1); return; }
        if (opt.type === "dir_confirm") {
            const dir = step === "backup_dir" ? config.backup_dir : config.local_dir;
            // backup_dir is intentionally optional; an empty value means "no backup dir".
            if (step === "backup_dir" && (!dir || dir.trim() === "")) { setValidationError(null); next(); return; }

            const reason = Env.getUnsafeDirectoryReason(dir || "");
            if (reason) { setValidationError(reason); return; }
            setValidationError(null);
            next();
            return;
        }
        if (opt.type === "sec_policy") { updateConfig(prev => ({ ...prev, enable_malware_shield: true, malware_policy: opt.value as "purge" | "isolate" | "extract" })); next(); }
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
            // Route through next() so history is pushed and the download-only path still
            // reaches the Security step. Calling setStep directly skipped both.
            next();
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
                        if (copyparty_config_index === COPYPARTY_LAST_ROW) _onFocusChange("footer");
                        else set_copyparty_config_index(prev => prev + 1);
                    }
                } else if (step === "ntfy_config") {
                    if (e.shift) {
                        if (ntfy_config_index === 0) _onFocusChange("footer");
                        else set_ntfy_config_index(prev => prev - 1);
                    } else {
                        if (ntfy_config_index === NTFY_LAST_ROW) _onFocusChange("footer");
                        else set_ntfy_config_index(prev => prev + 1);
                    }
                } else if (step === "cloud_direct_entry") {
                    const provider = wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current;
                    const maxIdx = (provider === "sftp" || provider === "r2") ? 4 : 3;
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
                if (e.name === "down") { set_copyparty_config_index(prev => Math.min(COPYPARTY_LAST_ROW, prev + 1)); return; }
                else if (e.name === "up") { set_copyparty_config_index(prev => Math.max(0, prev - 1)); return; }
                if (copyparty_config_index === COPYPARTY_ROW.METHOD) {
                    if (e.name === "left") { setSelectedIndex(0); updateConfig(prev => ({ ...prev, copyparty_method: "webdav" })); return; }
                    if (e.name === "right") { setSelectedIndex(1); updateConfig(prev => ({ ...prev, copyparty_method: "http" })); return; }
                }
            }

            if (step === "ntfy_config") {
                if (e.name >= "0" && e.name <= "9") return;
                if (e.name === "down") { set_ntfy_config_index(prev => Math.min(NTFY_LAST_ROW, prev + 1)); return; }
                else if (e.name === "up") { set_ntfy_config_index(prev => Math.max(0, prev - 1)); return; }
                if (ntfy_config_index === NTFY_ROW.DAEMON) {
                    // Route through the step's handler so the daemon is actually
                    // installed/uninstalled rather than just flipping the config flag.
                    if (e.name === "left") { ntfyActionsRef.current?.toggle(true); return; }
                    if (e.name === "right") { ntfyActionsRef.current?.toggle(false); return; }
                }
            }

            if (step === "cloud_direct_entry") {
                if (e.name >= "0" && e.name <= "9") return;
                const provider = wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current;
                const maxIdx = directEntryFieldCount(provider) + 1; // fields, CONNECT, BACK
                if (e.name === "down") { set_direct_entry_index(prev => Math.min(maxIdx, prev + 1)); return; }
                else if (e.name === "up") { set_direct_entry_index(prev => Math.max(0, prev - 1)); return; }
            }

            if (e.name === "return") {
                if (step === "ntfy_config") {
                    if (ntfy_config_index === NTFY_ROW.BACK) back();
                    else if (ntfy_config_index === NTFY_ROW.DONE) next();
                    else if (ntfy_config_index === NTFY_ROW.TEST && config.ntfy_url?.trim() && ntfyActionsRef.current) {
                        ntfyActionsRef.current.test();
                    }
                    // With no URL there is nothing to test, so Enter advances rather than
                    // silently doing nothing and stranding the user on the button.
                    else set_ntfy_config_index(prev => Math.min(NTFY_LAST_ROW, prev + 1));
                    return;
                }
                if (step === "copyparty_config") {
                    if (copyparty_config_index === COPYPARTY_ROW.BACK) back();
                    else if (copyparty_config_index === COPYPARTY_ROW.CONNECT) handleAuth();
                    else set_copyparty_config_index(prev => Math.min(COPYPARTY_LAST_ROW, prev + 1));
                    return;
                }
                if (step === "cloud_direct_entry") {
                    if (isAuthLoading || activeAuthRequestRef?.current) return;
                    const provider = wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current;
                    const fieldCount = directEntryFieldCount(provider);
                    const connectIdx = fieldCount;
                    const backIdx = fieldCount + 1;

                    if (direct_entry_index === backIdx) { back(); return; }
                    if (direct_entry_index === connectIdx) {
                        // Apply the same required-field check the mouse path performs;
                        // keyboard users could otherwise create remotes with empty creds.
                        const missing = directEntryMissingFields(provider, {
                            url: urlRef.current, user: userRef.current, pass: passRef.current,
                            clientId: clientIdRef.current, clientSecret: clientSecretRef.current,
                            b2Id: b2IdRef.current, b2Key: b2KeyRef.current
                        });
                        if (missing.length > 0) {
                            setAuthStatus(`Missing required field(s): ${missing.join(", ")}`);
                            return;
                        }
                        setAuthStatus(null);
                        dispatchDirectAuth(provider);
                    } else set_direct_entry_index(prev => prev + 1);

                    return;
                }
            }
            // Body navigation for every list-shaped step. Guides are included so that
            // keyboard users are not stranded on non-GDrive provider screens.
            const options = getOptions();
            if (options.length === 0) return;

            const isTextInputStep = TEXT_INPUT_STEPS.includes(step);

            if (e.name === "down") setSelectedIndex(prev => (prev + 1) % options.length);
            else if (e.name === "up") setSelectedIndex(prev => (prev - 1 + options.length) % options.length);
            else if (e.name === "return") confirmSelection(options[selectedIndex]!);
            else if (!isTextInputStep) {
                // `b` and digits are navigation only where no text field has focus.
                // Typing "/backups" into the path field used to fire back() on the `b`.
                if (e.name >= "1" && e.name <= "9") {
                    const idx = parseInt(e.name) - 1;
                    if (idx < options.length) setSelectedIndex(idx);
                } else if (e.name === "b") back();
            }
        }
    };

    const stepProps: WizardStepProps = {
        config, updateConfig, next, back, onComplete, onCancel, onQuit: _onQuit, getCurrentStepNumber,
        colors, focusArea: focusArea as "body" | "footer", onFocusChange: _onFocusChange, selectedIndex, setSelectedIndex, confirmSelection,
        getOptions, isAuthLoading, authStatus, setAuthStatus, handleAuth, handleGdriveAuth, startGenericAuth,
        dispatchDirectAuth,
        wizardInputs, updateInput, refs: { urlRef, userRef, passRef, clientIdRef, clientSecretRef, b2IdRef, b2KeyRef },
        isShortcutMissing, copyparty_config_index, set_copyparty_config_index, direct_entry_index, set_direct_entry_index, ntfy_config_index, set_ntfy_config_index, ntfyActions: ntfyActionsRef,
        validationError, setValidationError,
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
