/** @jsxImportSource @opentui/react */
import React, { useState, useCallback, useRef, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import type { PortalConfig, PortalProvider } from "../../lib/config.ts";
import { getCopypartyCookie } from "../../lib/auth.ts";
import { updateGdriveRemote, updateGenericRemote, authorizeRemote } from "../../lib/rclone.ts";
import { TextAttributes } from "@opentui/core";
import { bootstrapSystem, isSystemBootstrapped } from "../../lib/deploy.ts";
import { join } from "path";
import { useTheme } from "../../lib/theme";
import { Env } from "../../lib/env";
import { Logger } from "../../lib/logger";

// Modular Imports
import type { Step, WizardOption, WizardKeyEvent, WizardProps } from "./types";
import type { WizardStepProps } from "./StepProps";

// Steps
import { ShortcutStep } from "./steps/ShortcutStep";
import { CopypartyConfigStep } from "./steps/CopypartyConfigStep";
import { DestCloudSelectStep } from "./steps/DestCloudSelectStep";
import { BackupDirStep } from "./steps/BackupDirStep";
import { SecurityStep } from "./steps/SecurityStep";
import { CloudIntroStep } from "./steps/CloudIntroStep";
import { CloudGuideStep } from "./steps/CloudGuideStep";
import { CloudDirectEntryStep } from "./steps/CloudDirectEntryStep";
import { EditMenuStep } from "./steps/EditMenuStep";
import { DeployStep } from "./steps/DeployStep";

// Shared/Extracted Components
import { SourceChoice } from "./SourceChoice";
import { DirectoryConfig } from "./DirectoryConfig";
import { MirrorSettings } from "./MirrorSettings";
import { UpsyncConfig } from "./UpsyncConfig";
import { WizardFooter } from "./WizardFooter";

// Specialized Providers
import { GDriveSetup } from "./providers/GDriveSetup";
import { B2Setup } from "./providers/B2Setup";
import { SFTPSetup } from "./providers/SFTPSetup";

const getStepContext = (s: Step, history: Step[]): "source" | "dest" | null => {
    switch (s) {
        case "source_choice":
        case "copyparty_config":
            return "source";
        case "dest_cloud_select":
        case "backup_dir":
        case "security":
            return "dest";
        case "gdrive_intro": case "gdrive_guide_1": case "gdrive_guide_2": case "gdrive_guide_3": case "gdrive_guide_4":
        case "b2_intro": case "b2_guide_1": case "b2_guide_2":
        case "sftp_intro": case "sftp_guide_1":
        case "pcloud_intro": case "pcloud_guide_1":
        case "onedrive_intro": case "onedrive_guide_1": case "onedrive_guide_2":
        case "dropbox_intro": case "dropbox_guide_1": case "dropbox_guide_2":
        case "mega_intro": case "mega_guide_1":
        case "r2_intro": case "r2_guide_1": case "r2_guide_2":
        case "cloud_direct_entry":
            for (let i = history.length - 1; i >= 0; i--) {
                if (history[i] === "source_choice") return "source";
                if (history[i] === "dest_cloud_select") return "dest";
            }
            return null;
        default:
            return null;
    }
};

export const WizardContainer = React.memo(({ onComplete, onUpdate, onCancel, onQuit: _onQuit, initialConfig, mode, focusArea, onFocusChange: _onFocusChange, backSignal }: WizardProps) => {
    const { colors } = useTheme();
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

    const findNextStep = (c: PortalConfig): Step => {
        if (mode === "edit") return "edit_menu";
        if (mode === "restart") return "shortcut";
        const skipShort = isSystemBootstrapped() || c.desktop_shortcut === 2;
        if (!skipShort) return "shortcut";
        if (c.source_provider === "unconfigured") return "source_choice";
        if (!c.local_dir || c.local_dir === "" || c.local_dir === "none") return "dir";
        if (c.strict_mirror === undefined) return "mirror";
        if (c.upsync_enabled === undefined) return "upsync_ask";
        if (c.upsync_enabled && (c.backup_provider === "unconfigured")) return "dest_cloud_select";
        if (c.upsync_enabled && !c.backup_dir) return "backup_dir";
        return "deploy";
    };

    const isShortcutMissing = savedShortcutState === 1 && !isBootstrapped;
    const initialStep = findNextStep(initialConfig);
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
                case "shortcut": nextStep = "source_choice"; break;
                case "source_choice":
                    resetWizardRefs();
                    setWizardContext("source");
                    if (currentSource === "unconfigured") return prevStep;
                    if (currentSource === "copyparty") {
                        nextStep = "copyparty_config";
                    } else if (currentSource === "none") {
                        nextStep = (isMenuMode ? "edit_menu" : "dir");
                    } else {
                        const p = currentSource;
                        if (p === "gdrive") nextStep = "gdrive_intro";
                        else if (p === "b2") nextStep = "b2_intro";
                        else if (p === "sftp") nextStep = "sftp_intro";
                        else if (p === "pcloud") nextStep = "pcloud_intro";
                        else if (p === "onedrive") nextStep = "onedrive_intro";
                        else if (p === "dropbox") nextStep = "dropbox_intro";
                        else if (p === "mega") nextStep = "mega_intro";
                        else if (p === "r2") nextStep = "r2_intro";
                        else nextStep = (isMenuMode ? "edit_menu" : "dir");
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
                        nextStep = (isMenuMode ? "edit_menu" : "deploy");
                    }
                    break;
                case "dest_cloud_select":
                    if (currentBackup === "unconfigured") return prevStep;
                    {
                        const p = currentBackup;
                        if (p === "gdrive") nextStep = "gdrive_intro";
                        else if (p === "b2") nextStep = "b2_intro";
                        else if (p === "sftp") nextStep = "sftp_intro";
                        else if (p === "pcloud") nextStep = "pcloud_intro";
                        else if (p === "onedrive") nextStep = "onedrive_intro";
                        else if (p === "dropbox") nextStep = "dropbox_intro";
                        else if (p === "mega") nextStep = "mega_intro";
                        else if (p === "r2") nextStep = "r2_intro";
                        else nextStep = (isMenuMode ? "edit_menu" : "backup_dir");
                    }
                    break;
                case "backup_dir": nextStep = (isMenuMode ? "edit_menu" : "security"); break;
                case "security": nextStep = (isMenuMode ? "edit_menu" : "deploy"); break;
                case "gdrive_intro": nextStep = pendingCloudPathRef.current === "guided" ? "gdrive_guide_1" : "cloud_direct_entry"; break;
                case "gdrive_guide_1": nextStep = "gdrive_guide_2"; break;
                case "gdrive_guide_2": nextStep = "gdrive_guide_3"; break;
                case "gdrive_guide_3": nextStep = "gdrive_guide_4"; break;
                case "gdrive_guide_4": nextStep = "cloud_direct_entry"; break;
                case "b2_intro": nextStep = pendingCloudPathRef.current === "guided" ? "b2_guide_1" : "cloud_direct_entry"; break;
                case "sftp_intro": nextStep = pendingCloudPathRef.current === "guided" ? "sftp_guide_1" : "cloud_direct_entry"; break;
                case "pcloud_intro": nextStep = pendingCloudPathRef.current === "guided" ? "pcloud_guide_1" : "cloud_direct_entry"; break;
                case "onedrive_intro": nextStep = pendingCloudPathRef.current === "guided" ? "onedrive_guide_1" : "cloud_direct_entry"; break;
                case "dropbox_intro": nextStep = pendingCloudPathRef.current === "guided" ? "dropbox_guide_1" : "cloud_direct_entry"; break;
                case "mega_intro": nextStep = pendingCloudPathRef.current === "guided" ? "mega_guide_1" : "cloud_direct_entry"; break;
                case "r2_intro": nextStep = pendingCloudPathRef.current === "guided" ? "r2_guide_1" : "cloud_direct_entry"; break;
                case "cloud_direct_entry": nextStep = (isMenuMode ? "edit_menu" : (wizardContextRef.current === "source" ? "dir" : "backup_dir")); break;
                case "b2_guide_1": nextStep = "b2_guide_2"; break;
                case "b2_guide_2": nextStep = "cloud_direct_entry"; break;
                case "r2_guide_1": nextStep = "r2_guide_2"; break;
                case "r2_guide_2": nextStep = "cloud_direct_entry"; break;
                case "sftp_guide_1": nextStep = "cloud_direct_entry"; break;
                case "onedrive_guide_1": nextStep = "onedrive_guide_2"; break;
                case "onedrive_guide_2": nextStep = "cloud_direct_entry"; break;
                case "dropbox_guide_1": nextStep = "dropbox_guide_2"; break;
                case "dropbox_guide_2": nextStep = "cloud_direct_entry"; break;
                case "mega_guide_1": nextStep = "cloud_direct_entry"; break;
                case "pcloud_guide_1": nextStep = "cloud_direct_entry"; break;
                case "deploy": onComplete(c); break;
            }
            stepStartTime.current = Date.now();
            return nextStep;
        });
    }, [onComplete, wizardContext, isMenuMode, selectedIndex]);

    const getOptions = useCallback(() => {
        if (step === "shortcut") return isShortcutMissing ? [{ value: 1, type: "bootstrap" }, { value: 2, type: "shortcut" }, { value: 0, type: "skip" }] : [{ value: 1, type: "desktop_shortcut" }, { value: 0, type: "desktop_shortcut" }];
        if (step === "edit_menu") return [{ value: "shortcut", type: "jump" }, { value: "source_choice", type: "jump" }, { value: "dir", type: "jump" }, { value: "mirror", type: "jump" }, { value: "upsync_ask", type: "jump" }, { value: "security", type: "jump" }, { value: "deploy", type: "jump" }];
        if (step === "source_choice") return ["copyparty", "gdrive", "b2", "pcloud", "sftp", "onedrive", "dropbox", "mega", "r2"].map(v => ({ value: v, type: "source_select" }));
        if (step === "mirror") return [{ value: false, type: "mirror" }, { value: true, type: "mirror" }];
        if (step === "dir" || step === "backup_dir") return [{ value: "confirm", type: "dir_confirm" }];
        if (step === "upsync_ask") return [{ value: "download_only", type: "sync_mode" }, { value: "sync_backup", type: "sync_mode" }];
        if (step === "security") {
            const opts = [{ value: "isolate", type: "sec_policy" }, { value: "purge", type: "sec_policy" }, { value: false, type: "sec_toggle" }];
            return config.backup_provider === "gdrive" ? opts.filter(o => o.value !== false) : opts;
        }
        if (step === "dest_cloud_select") return ["gdrive", "b2", "pcloud", "sftp", "onedrive", "dropbox", "mega", "r2"].map(v => ({ value: v, type: "backup_provider" }));
        if (step?.endsWith("_intro")) return [{ value: "guided", type: "intro_path" }, { value: "direct", type: "intro_path" }];
        if (step?.includes("_guide_")) return [{ value: true, type: "guide_next" }];
        if (step === "deploy") return [{ value: true, type: "deploy" }, { value: false, type: "deploy" }];
        return [];
    }, [step, isShortcutMissing, config.backup_provider]);

    const handleAuth = useCallback(async () => {
        setIsAuthLoading(true);
        const method = configRef.current.copyparty_method || "webdav";
        setAuthStatus(method === "webdav" ? "🔄 Verifying WebDAV Access..." : "🔄 Authenticating with CopyParty (HTTP)...");
        const url = urlRef.current.trim();
        const user = userRef.current.trim();
        const pass = passRef.current.trim();
        try {
            if (!url) { setAuthStatus("⚠️ URL is required."); setIsAuthLoading(false); return; }
            if (method === "webdav") {
                const { createWebDavRemote } = await import("../../lib/rclone");
                await createWebDavRemote(Env.REMOTE_PORTAL_SOURCE, url, user, pass);
                updateConfig(prev => ({ ...prev, source_provider: "copyparty", copyparty_method: "webdav", webdav_user: user, webdav_pass: pass }));
                next();
            } else {
                if (!pass) { setAuthStatus("⚠️ Password required."); setIsAuthLoading(false); return; }
                const cookie = await getCopypartyCookie(url, user, pass);
                if (cookie) {
                    const { createHttpRemote } = await import("../../lib/rclone");
                    await createHttpRemote(Env.REMOTE_PORTAL_SOURCE, url, cookie);
                    updateConfig(prev => ({ ...prev, source_provider: "copyparty", copyparty_method: "http", cookie }));
                    next();
                } else setAuthStatus("❌ Auth failed.");
            }
        } catch (err) { setAuthStatus(`💥 Error: ${(err as Error).message}`); } finally { setIsAuthLoading(false); }
    }, [next, updateConfig]);

    const handleGdriveAuth = useCallback(async (clientId: string, clientSecret: string) => {
        abortAuth(); setIsAuthLoading(true); setAuthStatus("🔄 Launching Google Handshake...");
        const controller = new AbortController(); authAbortControllerRef.current = controller;
        try {
            const token = await authorizeRemote("drive", controller.signal);
            if (token) {
                oauthTokenRef.current = token;
                const remoteName = wizardContext === "source" ? Env.REMOTE_PORTAL_SOURCE : Env.REMOTE_PORTAL_BACKUP;
                updateGdriveRemote(remoteName, clientId, clientSecret, token);
                const field = wizardContext === "source" ? "source_provider" : "backup_provider";
                const pending = wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current;
                updateConfig(prev => ({ ...prev, [field]: pending }));
                next();
            }
        } catch (err) { if (!controller.signal.aborted) setAuthStatus(`❌ Error: ${(err as Error).message}`); } finally { if (authAbortControllerRef.current === controller) { authAbortControllerRef.current = null; setIsAuthLoading(false); } }
    }, [wizardContext, next, updateConfig, abortAuth]);

    const startGenericAuth = useCallback(async (provider: string) => {
        abortAuth(); setIsAuthLoading(true); setAuthStatus(`🚀 Launching ${provider.toUpperCase()} Auth...`);
        const controller = new AbortController(); authAbortControllerRef.current = controller;
        try {
            const token = await authorizeRemote(provider, controller.signal);
            if (token) {
                oauthTokenRef.current = token;
                const remoteName = wizardContext === "source" ? Env.REMOTE_PORTAL_SOURCE : Env.REMOTE_PORTAL_BACKUP;
                updateGenericRemote(remoteName, provider as PortalProvider, { token });
                const field = wizardContext === "source" ? "source_provider" : "backup_provider";
                const pending = wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current;
                updateConfig(prev => ({ ...prev, [field]: pending }));
                next();
            }
        } catch (err) { if (!controller.signal.aborted) setAuthStatus(`❌ Error: ${(err as Error).message}`); } finally { if (authAbortControllerRef.current === controller) { authAbortControllerRef.current = null; setIsAuthLoading(false); } }
    }, [wizardContext, next, updateConfig, abortAuth]);

    const confirmSelection = useCallback((opt: WizardOption) => {
        if (!opt) return;
        if (opt.type === "deploy") { if (opt.value) onComplete(config); else onCancel(); return; }
        if (opt.type === "intro_path") { pendingCloudPathRef.current = opt.value as "guided" | "direct"; next(); return; }
        if (opt.type === "guide_next") { next(); return; }
        if (opt.type === "desktop_shortcut") { if (opt.value === 1) bootstrapSystem(join(process.cwd(), "src/index.tsx")); updateConfig(prev => ({ ...prev, desktop_shortcut: opt.value as number })); next(); return; }
        if (opt.type === "jump") { const targetStep = opt.value as Step; if (targetStep === "source_choice" || targetStep === "copyparty_config") setWizardContext("source"); if (targetStep === "dest_cloud_select") setWizardContext("dest"); setStep(targetStep); return; }
        if (opt.type === "dir_confirm") { if (config.local_dir && config.local_dir !== "" && config.local_dir !== "none") next(); return; }
        if (opt.type === "sec_policy") { updateConfig(prev => ({ ...prev, enable_malware_shield: true, malware_policy: opt.value as "purge" | "isolate" })); next(); }
        else if (opt.type === "sec_toggle") { updateConfig(prev => ({ ...prev, enable_malware_shield: opt.value as boolean })); next(); }
        else if (opt.type === "source_select") { pendingSourceProviderRef.current = opt.value as PortalProvider; next(); }
        else if (opt.type === "backup_provider") { pendingBackupProviderRef.current = opt.value as PortalProvider; setWizardContext("dest"); next(); }
        else if (opt.type === "sync_mode") {
            const newVal = opt.value === "sync_backup";
            updateConfig(prev => ({ ...prev, upsync_enabled: newVal }));
            if (newVal) { setWizardContext("dest"); setStep("dest_cloud_select"); }
            else setStep("deploy");
        } else {
            const fieldMap: Record<string, keyof PortalConfig> = { mirror: "strict_mirror" };
            const field = fieldMap[opt.type as string];
            if (field) updateConfig(prev => ({ ...prev, [field]: opt.value }));
            next();
        }
    }, [config, mode, next, updateConfig, onComplete, onCancel]);

    const keyboardHandlerRef = useRef<(e: WizardKeyEvent) => void>(undefined);
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
                if (e.name === "down") { set_copyparty_config_index(prev => Math.min(4, prev + 1)); return; }
                else if (e.name === "up") { set_copyparty_config_index(prev => Math.max(0, prev - 1)); return; }
                if (copyparty_config_index === 3) {
                    if (e.name === "left") { setSelectedIndex(0); updateConfig(prev => ({ ...prev, copyparty_method: "webdav" })); return; }
                    if (e.name === "right") { setSelectedIndex(1); updateConfig(prev => ({ ...prev, copyparty_method: "http" })); return; }
                }
            }

            if (step === "cloud_direct_entry") {
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
                            if (provider === "gdrive") handleGdriveAuth(clientIdRef.current, clientSecretRef.current);
                            else if (provider === "onedrive" || provider === "dropbox") startGenericAuth(provider);
                            else {
                                const remoteName = wizardContext === "source" ? Env.REMOTE_PORTAL_SOURCE : Env.REMOTE_PORTAL_BACKUP;
                                if (provider === "b2") updateGenericRemote(remoteName, "b2", { account: b2IdRef.current, key: b2KeyRef.current });
                                else if (provider === "sftp") updateGenericRemote(remoteName, "sftp", { host: urlRef.current, user: userRef.current, pass: passRef.current });
                                else if (provider === "pcloud") updateGenericRemote(remoteName, "pcloud", { user: userRef.current, pass: passRef.current });
                                else if (provider === "mega") updateGenericRemote(remoteName, "mega", { user: userRef.current, pass: passRef.current });
                                else if (provider === "r2") updateGenericRemote(remoteName, "s3", { access_key_id: userRef.current, secret_access_key: passRef.current, endpoint: urlRef.current });
                                const field = wizardContext === "source" ? "source_provider" : "backup_provider";
                                updateConfig(prev => ({ ...prev, [field]: provider }));
                                next();
                            }
                        }
                    } else set_direct_entry_index(prev => prev + 1);
                    return;
                }
            }
        }

        const selectableSteps: Step[] = ["shortcut", "source_choice", "mirror", "upsync_ask", "security", "dest_cloud_select", "edit_menu", "gdrive_intro", "gdrive_guide_1", "gdrive_guide_2", "gdrive_guide_3", "gdrive_guide_4", "b2_intro", "sftp_intro", "pcloud_intro", "onedrive_intro", "dropbox_intro", "mega_intro", "r2_intro", "deploy", "cloud_direct_entry"];
        if (selectableSteps.includes(step)) {
            const options = getOptions();
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
        wizardInputs, updateInput, refs: { urlRef, userRef, passRef, clientIdRef, clientSecretRef, b2IdRef, b2KeyRef },
        isShortcutMissing, copyparty_config_index, set_copyparty_config_index, direct_entry_index, set_direct_entry_index,
        wizardContext, pendingSourceProvider: pendingSourceProviderRef.current, pendingBackupProvider: pendingBackupProviderRef.current,
        fontVersion: config.nerd_font_version || 2, updateGenericRemote, updateGdriveRemote, authorizeRemote,
        step
    };

    const renderStep = () => {
        switch (step) {
            case "shortcut": return <ShortcutStep {...stepProps} />;
            case "source_choice": return <SourceChoice {...stepProps} />;
            case "copyparty_config": return <CopypartyConfigStep {...stepProps} />;
            case "dir": return <DirectoryConfig {...stepProps} />;
            case "mirror": return <MirrorSettings {...stepProps} />;
            case "upsync_ask": return <UpsyncConfig {...stepProps} />;
            case "dest_cloud_select": return <DestCloudSelectStep {...stepProps} />;
            case "backup_dir": return <BackupDirStep {...stepProps} />;
            case "security": return <SecurityStep {...stepProps} />;

            // Specialized Providers
            case "gdrive_intro":
            case "gdrive_guide_1":
            case "gdrive_guide_2":
            case "gdrive_guide_3":
            case "gdrive_guide_4":
                return <GDriveSetup {...stepProps} />;
            case "b2_intro":
            case "b2_guide_1":
            case "b2_guide_2":
                return <B2Setup {...stepProps} />;
            case "sftp_intro":
            case "sftp_guide_1":
                return <SFTPSetup {...stepProps} />;

            // Fallback for others
            case "pcloud_intro":
            case "onedrive_intro":
            case "dropbox_intro":
            case "mega_intro":
            case "r2_intro":
                return <CloudIntroStep {...stepProps} provider={step.split("_")[0] as PortalProvider} />;
            case "pcloud_guide_1":
            case "onedrive_guide_1":
            case "onedrive_guide_2":
            case "dropbox_guide_1":
            case "dropbox_guide_2":
            case "mega_guide_1":
            case "r2_guide_1":
            case "r2_guide_2":
                return <CloudGuideStep {...stepProps} step={step} />;

            case "cloud_direct_entry": return <CloudDirectEntryStep {...stepProps} />;
            case "edit_menu": return <EditMenuStep {...stepProps} />;
            case "deploy": return <DeployStep {...stepProps} />;
            default: return null;
        }
    };

    return (
        <box flexDirection="column" padding={1} border borderStyle="double" borderColor={colors.primary} title="[ SYSTEM CONFIGURATION WIZARD ]" gap={1}>
            {renderStep()}
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
