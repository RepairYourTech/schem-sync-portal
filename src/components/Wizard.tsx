/** @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react";
import React, { useState, useCallback, useRef, useEffect } from "react";
import type { PortalConfig, PortalProvider } from "../lib/config.ts";
import { getCopypartyCookie } from "../lib/auth.ts";
import { Hotkey } from "./Hotkey";
import { ProviderIcon } from "./ProviderIcon";
import { updateGdriveRemote, updateGenericRemote, authorizeRemote } from "../lib/rclone.ts";
import { TextAttributes } from "@opentui/core";
import { bootstrapSystem, isSystemBootstrapped } from "../lib/deploy.ts";
import { join } from "path";
import { useTheme } from "../lib/theme";
import { Env } from "../lib/env";
import { Logger } from "../lib/logger";


interface WizardOption {
    name?: string;
    description?: string;
    value?: string | number | boolean | PortalProvider;
    key?: string;
    type?: string;
    action?: () => void;
}

interface WizardKeyEvent {
    name: string;
    shift: boolean;
    ctrl: boolean;
    meta: boolean;
}

interface WizardProps {
    onComplete: (config: PortalConfig) => void;
    onUpdate?: (config: PortalConfig) => void;
    onCancel: () => void;
    onQuit: () => void;
    initialConfig: PortalConfig;
    mode?: "continue" | "restart" | "edit";
    focusArea: "body" | "footer";
    onFocusChange: (area: "body" | "footer") => void;
    tabTransition?: "forward" | "backward" | null;
    backSignal: number;
}

type Step =
    | "shortcut"
    | "source_choice" // Unified Source Selection
    | "copyparty_config" // Consolidated URL/User/Pass/Method
    | "dir" | "mirror"
    | "upsync_ask" // NEW: Enable Backup?
    | "dest_cloud_select" // Backup Choice
    | "backup_dir" // Backup Path
    | "security" // Malware Shield (Only if Upsync is on)

    // Cloud Provider Specifics (Shared for Source/Dest - we'll reuse UI but need context)
    | "gdrive_intro" | "gdrive_guide_1" | "gdrive_guide_2" | "gdrive_guide_3" | "gdrive_guide_4"
    | "b2_intro" | "b2_guide_1" | "b2_guide_2"
    | "sftp_intro" | "sftp_guide_1"
    | "pcloud_intro" | "pcloud_guide_1"
    | "onedrive_intro" | "onedrive_guide_1" | "onedrive_guide_2"
    | "dropbox_intro" | "dropbox_guide_1" | "dropbox_guide_2"
    | "mega_intro" | "mega_guide_1"
    | "r2_intro" | "r2_guide_1" | "r2_guide_2"
    | "cloud_direct_entry"
    | "edit_menu"
    | "deploy";

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
            // Scan backward through history to disambiguate shared provider setup
            for (let i = history.length - 1; i >= 0; i--) {
                if (history[i] === "source_choice") return "source";
                if (history[i] === "dest_cloud_select") return "dest";
            }
            return null;
        default:
            return null;
    }
};

export const Wizard = React.memo(({ onComplete, onUpdate, onCancel, onQuit: _onQuit, initialConfig, mode, focusArea, onFocusChange: _onFocusChange, tabTransition, backSignal }: WizardProps) => {
    const { colors } = useTheme();
    const isBootstrapped = isSystemBootstrapped();
    const savedShortcutState = initialConfig.desktop_shortcut;

    // Helper to determine if we are currently configuring Source or Destination
    // This allows us to reuse the cloud provider steps for both!
    // We'll store a "wizardContext" state: "configuring_source" | "configuring_dest"
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

        // 1. Shortcut detection
        const skipShort = isSystemBootstrapped() || c.desktop_shortcut === 2;
        if (!skipShort) return "shortcut";

        // 2. Source Configuration (SSoT)
        if (c.source_provider === "unconfigured") return "source_choice";

        // 3. Local Dir
        if (!c.local_dir || c.local_dir === "" || c.local_dir === "none") return "dir";

        // 4. Mirror Policy
        if (c.strict_mirror === undefined) return "mirror";

        // 5. Upsync / Backup
        if (c.upsync_enabled === undefined) return "upsync_ask";

        if (c.upsync_enabled && (c.backup_provider === "unconfigured")) return "dest_cloud_select";
        if (c.upsync_enabled && !c.backup_dir) return "backup_dir";

        return "deploy";
    };

    // ... (Skip logic same)
    const isShortcutMissing = savedShortcutState === 1 && !isBootstrapped;

    const initialStep = findNextStep(initialConfig);
    const [step, setStep] = useState<Step>(initialStep);
    const [isMenuMode, setIsMenuMode] = useState(initialStep === "edit_menu");
    const [config, setConfig] = useState<PortalConfig>({
        ...initialConfig,
        desktop_shortcut: isBootstrapped ? 1 : (initialConfig.desktop_shortcut ?? 0)
    });
    const configRef = useRef<PortalConfig>(config); // Synchronous mirror for zero-lag access
    const fontVersion = config.nerd_font_version || 2;
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [copyparty_config_index, set_copyparty_config_index] = useState(0); // 0:URL, 1:User, 2:Pass, 3:Method, 4:Connect
    const [direct_entry_index, set_direct_entry_index] = useState(0);
    const [isAuthLoading, setIsAuthLoading] = useState(false);
    const [authStatus, setAuthStatus] = useState<string | null>(null);
    const pendingSourceProviderRef = useRef<PortalProvider>(initialConfig.source_provider);
    const pendingBackupProviderRef = useRef<PortalProvider>(initialConfig.backup_provider);
    const pendingCloudPathRef = useRef<"guided" | "direct">("direct");

    // [SEC] Local Credential Refs - Memory-only, never saved to config.json 🧠🛡️🦅
    const urlRef = useRef("");
    const userRef = useRef("");
    const passRef = useRef("");
    const clientIdRef = useRef("");
    const clientSecretRef = useRef("");
    const b2IdRef = useRef("");
    const b2KeyRef = useRef("");
    const [wizardInputs, setWizardInputs] = useState({
        url: "",
        user: "",
        pass: "",
        clientId: "",
        clientSecret: "",
        b2Id: "",
        b2Key: "",
        oauthToken: ""
    });

    // Sync state with refs for zero-lag backend access
    const updateInput = useCallback((key: keyof typeof wizardInputs, value: string, ref: React.MutableRefObject<string>) => {
        Logger.debug("UI", `[WIZARD] Input change: ${key}=${key === "pass" ? "********" : value}`);
        setWizardInputs(prev => ({ ...prev, [key]: value }));
        ref.current = value;
    }, []);

    const oauthTokenRef = useRef("");
    const authAbortControllerRef = useRef<AbortController | null>(null);
    const [history, setHistory] = useState<Step[]>([]);
    const stepStartTime = useRef(Date.now());

    const abortAuth = useCallback(() => {
        if (authAbortControllerRef.current) {
            Logger.info("AUTH", "[WIZARD] Aborting existing auth process...");
            authAbortControllerRef.current.abort();
            authAbortControllerRef.current = null;
        }
    }, []);

    const updateConfig = useCallback((updater: (prev: PortalConfig) => PortalConfig) => {
        const nextConfig = updater(configRef.current);
        configRef.current = nextConfig; // Immediate synchronous update
        setConfig(nextConfig); // Trigger React render
        if (onUpdate) onUpdate(nextConfig);
    }, [onUpdate]);

    // Use a ref for next/back to avoid stale closure issues with complex state
    const stateRef = useRef({ step, config, history });
    stateRef.current = { step, config, history };

    const resetWizardRefs = useCallback(() => {
        Logger.debug("UI", `[WIZARD] Resetting all refs and inputs.`);
        urlRef.current = "";
        userRef.current = "";
        passRef.current = "";
        clientIdRef.current = "";
        clientSecretRef.current = "";
        b2IdRef.current = "";
        b2KeyRef.current = "";
        oauthTokenRef.current = "";
        setWizardInputs({
            url: "",
            user: "",
            pass: "",
            clientId: "",
            clientSecret: "",
            b2Id: "",
            b2Key: "",
            oauthToken: ""
        });
        abortAuth();
        setAuthStatus(null);
    }, [abortAuth]);

    const getCurrentStepNumber = useCallback(() => {
        // We calculate real step number based on unique stages in history
        // but a simpler way is history.length + 1 for intuitive progression.
        return history.length + 1;
    }, [history]);

    const back = useCallback(() => {
        const { history: h } = stateRef.current;
        if (h.length > 0) {
            const prev = h[h.length - 1];
            setHistory(h.slice(0, -1));
            setStep(prev!);
            setSelectedIndex(0); // Reset selection
            stepStartTime.current = Date.now();
        } else {
            onCancel();
        }
    }, [onCancel]);

    const lastBackSignal = useRef(backSignal);
    const firstRender = useRef(true);
    useEffect(() => {
        Logger.debug("UI", "[WIZARD] Component MOUNTED.");
        return () => {
            Logger.debug("UI", "[WIZARD] Component UNMOUNTED.");
            if (authAbortControllerRef.current) {
                Logger.info("AUTH", "[WIZARD] Unmounting: killing pending auth...");
                authAbortControllerRef.current.abort();
            }
        };
    }, []);

    // Step-change safety: kill auth if we move away
    useEffect(() => {
        if (authAbortControllerRef.current && !isAuthLoading) {
            // If we are NOT loading but have a controller, it's stale
            authAbortControllerRef.current = null;
        }
        return () => {
            // If the step changes while we ARE loading, kill it
            if (stateRef.current.step !== step && authAbortControllerRef.current) {
                Logger.info("AUTH", "[WIZARD] Step changed, killing active handshake.");
                authAbortControllerRef.current.abort();
            }
        };
    }, [step, isAuthLoading]);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        if (backSignal > lastBackSignal.current) {
            lastBackSignal.current = backSignal;
            Logger.debug("UI", `[WIZARD] backSignal triggered: ${backSignal}. Calling back().`);
            back();
        }
    }, [backSignal, back]);

    // Context enforcement: Ensure wizardContext is correct even on back navigation
    useEffect(() => {
        const context = getStepContext(step, history);
        if (context) {
            setWizardContext(context);
            Logger.debug("UI", `[WIZARD] Step changed to ${step}, enforcing context: ${context}`);
        }
    }, [step, history, setWizardContext]);

    const next = useCallback(() => {
        const { step: s } = stateRef.current;
        const c = configRef.current;
        const currentSource = pendingSourceProviderRef.current;
        const currentBackup = pendingBackupProviderRef.current;
        setHistory(prev => [...prev, s]);
        setSelectedIndex(0); // Reset selection

        setStep(prevStep => {
            let nextStep = prevStep;
            switch (prevStep) {
                // 1. Shortcut -> Source Choice
                case "shortcut": nextStep = "source_choice"; break;

                // 2. Source Config
                case "source_choice":
                    resetWizardRefs();
                    setWizardContext("source");
                    if (currentSource === "unconfigured") return prevStep;
                    if (currentSource === "copyparty") {
                        nextStep = "copyparty_config";
                    } else if (currentSource === "none") {
                        nextStep = (isMenuMode ? "edit_menu" : "dir");
                    } else {
                        const provider = currentSource;
                        if (provider === "gdrive") nextStep = "gdrive_intro";
                        else if (provider === "b2") nextStep = "b2_intro";
                        else if (provider === "sftp") nextStep = "sftp_intro";
                        else if (provider === "pcloud") nextStep = "pcloud_intro";
                        else if (provider === "onedrive") nextStep = "onedrive_intro";
                        else if (provider === "dropbox") nextStep = "dropbox_intro";
                        else if (provider === "mega") nextStep = "mega_intro";
                        else if (provider === "r2") nextStep = "r2_intro";
                        else nextStep = (isMenuMode ? "edit_menu" : "dir");
                    }
                    break;



                case "copyparty_config": nextStep = (isMenuMode ? "edit_menu" : "dir"); break;

                // 3. Core
                case "dir": nextStep = (isMenuMode ? "edit_menu" : "mirror"); break;
                case "mirror": nextStep = (isMenuMode ? "edit_menu" : "upsync_ask"); break;

                // 4. Upsync / Destination
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
                        const provider = currentBackup;
                        if (provider === "gdrive") nextStep = "gdrive_intro";
                        else if (provider === "b2") nextStep = "b2_intro";
                        else if (provider === "sftp") nextStep = "sftp_intro";
                        else if (provider === "pcloud") nextStep = "pcloud_intro";
                        else if (provider === "onedrive") nextStep = "onedrive_intro";
                        else if (provider === "dropbox") nextStep = "dropbox_intro";
                        else if (provider === "mega") nextStep = "mega_intro";
                        else if (provider === "r2") nextStep = "r2_intro";
                        else nextStep = (isMenuMode ? "edit_menu" : "backup_dir");
                    }
                    break;

                case "backup_dir": nextStep = (isMenuMode ? "edit_menu" : "security"); break;

                case "security": nextStep = (isMenuMode ? "edit_menu" : "deploy"); break;


                // Intermediates
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

                // Guide Transitions
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
    }, [onComplete, wizardContext, isMenuMode, mode, selectedIndex]);

    const getOptions = useCallback(() => {
        if (step === "shortcut") {
            return isShortcutMissing ? [
                { value: 1, type: "bootstrap" },
                { value: 2, type: "shortcut" },
                { value: 0, type: "skip" }
            ] : [
                { value: 1, type: "desktop_shortcut" },
                { value: 0, type: "desktop_shortcut" }
            ];
        }

        if (step === "edit_menu") {
            return [
                { value: "shortcut", type: "jump" },
                { value: "source_choice", type: "jump" },
                { value: "dir", type: "jump" },
                { value: "mirror", type: "jump" },
                { value: "upsync_ask", type: "jump" },
                { value: "security", type: "jump" },
                { value: "deploy", type: "jump" }
            ];
        }

        if (step === "source_choice") return [
            { value: "copyparty", type: "source_select" },
            { value: "gdrive", type: "source_select" },
            { value: "b2", type: "source_select" },
            { value: "pcloud", type: "source_select" },
            { value: "sftp", type: "source_select" },
            { value: "onedrive", type: "source_select" },
            { value: "dropbox", type: "source_select" },
            { value: "mega", type: "source_select" },
            { value: "r2", type: "source_select" }
        ];


        if (step === "mirror") return [{ value: false, type: "mirror" }, { value: true, type: "mirror" }];

        if (step === "dir" || step === "backup_dir") return [
            { value: "confirm", type: "dir_confirm" }
        ];

        if (step === "upsync_ask") return [
            { value: "download_only", type: "sync_mode" },
            { value: "sync_backup", type: "sync_mode" }
        ];

        if (step === "security") {
            const opts = [
                { value: "isolate", type: "sec_policy" },
                { value: "purge", type: "sec_policy" },
                { value: false, type: "sec_toggle" }
            ];
            // Enforce mandatory malware shield for Google Drive
            if (config.backup_provider === "gdrive") {
                return opts.filter(o => o.value !== false);
            }
            return opts;
        }


        if (step === "dest_cloud_select") return [
            { value: "gdrive", type: "backup_provider" },
            { value: "b2", type: "backup_provider" },
            { value: "pcloud", type: "backup_provider" },
            { value: "sftp", type: "backup_provider" },
            { value: "onedrive", type: "backup_provider" },
            { value: "dropbox", type: "backup_provider" },
            { value: "mega", type: "backup_provider" },
            { value: "r2", type: "backup_provider" }
        ];


        if (step === "gdrive_intro") return [{ value: "guided", type: "gdrive_path" }, { value: "direct", type: "gdrive_path" }];
        if (step === "b2_intro") return [{ value: "guided", type: "intro_path" }, { value: "direct", type: "intro_path" }];
        if (step === "sftp_intro") return [{ value: "guided", type: "intro_path" }, { value: "direct", type: "intro_path" }];
        if (step === "pcloud_intro") return [{ value: "guided", type: "intro_path" }, { value: "direct", type: "intro_path" }];
        if (step === "onedrive_intro") return [{ value: "guided", type: "intro_path" }, { value: "direct", type: "intro_path" }];
        if (step === "dropbox_intro") return [{ value: "guided", type: "intro_path" }, { value: "direct", type: "intro_path" }];
        if (step === "mega_intro") return [{ value: "guided", type: "intro_path" }, { value: "direct", type: "intro_path" }];
        if (step === "r2_intro") return [{ value: "guided", type: "intro_path" }, { value: "direct", type: "intro_path" }];

        if (step === "gdrive_guide_1") return [{ value: true, type: "guide_next" }];
        if (step === "gdrive_guide_2") return [{ value: true, type: "guide_next" }];
        if (step === "gdrive_guide_3") return [{ value: true, type: "guide_next" }];
        if (step === "gdrive_guide_4") return [{ value: true, type: "guide_next" }];

        if (step === "b2_guide_1") return [{ value: true, type: "guide_next" }];
        if (step === "b2_guide_2") return [{ value: true, type: "guide_next" }];
        if (step === "r2_guide_1") return [{ value: true, type: "guide_next" }];
        if (step === "r2_guide_2") return [{ value: true, type: "guide_next" }];
        if (step === "sftp_guide_1") return [{ value: true, type: "guide_next" }];
        if (step === "onedrive_guide_1") return [{ value: true, type: "guide_next" }];
        if (step === "onedrive_guide_2") return [{ value: true, type: "guide_next" }];
        if (step === "dropbox_guide_1") return [{ value: true, type: "guide_next" }];
        if (step === "dropbox_guide_2") return [{ value: true, type: "guide_next" }];
        if (step === "mega_guide_1") return [{ value: true, type: "guide_next" }];
        if (step === "pcloud_guide_1") return [{ value: true, type: "guide_next" }];
        if (step === "deploy") return [{ value: true, type: "deploy" }, { value: false, type: "deploy" }];
        return [];
    }, [step, isShortcutMissing, config.backup_provider, wizardContext]);

    useEffect(() => {
        if (focusArea === "body" && tabTransition) {
            if (tabTransition === "forward") {
                setSelectedIndex(0);
                set_copyparty_config_index(0);
            } else {
                const opts = getOptions();
                setSelectedIndex(Math.max(0, opts.length - 1));
                set_copyparty_config_index(4); // Last field in copyparty
            }
        }
    }, [focusArea, tabTransition, step]);

    const handleAuth = useCallback(async () => {
        setIsAuthLoading(true);
        const method = configRef.current.copyparty_method || "webdav";
        setAuthStatus(method === "webdav" ? "🔄 Verifying WebDAV Access..." : "🔄 Authenticating with CopyParty (HTTP)...");

        const url = urlRef.current.trim();
        const user = userRef.current.trim();
        const pass = passRef.current.trim();

        Logger.debug("AUTH", `[WIZARD] handleAuth starting. Method: ${method} | URL: ${url} | User: ${user}`);

        try {
            if (!url) {
                setAuthStatus("⚠️ URL is required.");
                setIsAuthLoading(false);
                return;
            }

            if (method === "webdav") {
                setAuthStatus("✅ WebDAV Configured!");
                const { createWebDavRemote } = await import("../lib/rclone");
                await createWebDavRemote(Env.REMOTE_PORTAL_SOURCE, url, user, pass);
                updateConfig(prev => ({ ...prev, source_provider: "copyparty", copyparty_method: "webdav", webdav_user: user, webdav_pass: pass }));
                next();
            } else {
                if (!pass) {
                    setAuthStatus("⚠️ Password required for HTTP Legacy.");
                    setIsAuthLoading(false);
                    return;
                }
                const cookie = await getCopypartyCookie(url, user, pass);
                if (cookie) {
                    setAuthStatus("✅ Access Granted!");
                    const { createHttpRemote } = await import("../lib/rclone");
                    await createHttpRemote(Env.REMOTE_PORTAL_SOURCE, url, cookie);
                    updateConfig(prev => ({ ...prev, source_provider: "copyparty", copyparty_method: "http", cookie }));
                    next();
                } else {
                    setAuthStatus("❌ Authentication failed. Check credentials.");
                }
            }
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error("AUTH", `[WIZARD] handleAuth error:`, error);
            setAuthStatus(`💥 Connection Error: ${error.message}`);
        } finally {
            setIsAuthLoading(false);
        }
    }, [next, updateConfig]);

    const handleGdriveAuth = useCallback(async (clientId: string, clientSecret: string) => {
        abortAuth();
        setIsAuthLoading(true);
        setAuthStatus("🔄 Launching Google Handshake...");

        const controller = new AbortController();
        authAbortControllerRef.current = controller;

        try {
            const token = await authorizeRemote("drive", controller.signal);
            if (token) {
                setAuthStatus("✅ Google Connected!");
                oauthTokenRef.current = token;
                const remoteName = wizardContext === "source" ? Env.REMOTE_PORTAL_SOURCE : Env.REMOTE_PORTAL_BACKUP;
                updateGdriveRemote(remoteName, clientId, clientSecret, token);
                const field = wizardContext === "source" ? "source_provider" : "backup_provider";
                const pending = wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current;
                updateConfig(prev => ({ ...prev, [field]: pending }));
                next();
            }
        } catch (err: unknown) {
            if (controller.signal.aborted) return;
            const error = err as Error;
            setAuthStatus(`❌ Error: ${error.message}`);
        } finally {
            if (authAbortControllerRef.current === controller) {
                authAbortControllerRef.current = null;
                setIsAuthLoading(false);
            }
        }
    }, [wizardContext, next, updateConfig, abortAuth]);

    const startGenericAuth = useCallback(async (provider: string) => {
        abortAuth();
        setIsAuthLoading(true);
        setAuthStatus(`🚀 Launching ${provider.toUpperCase()} Authorization...`);

        const controller = new AbortController();
        authAbortControllerRef.current = controller;

        try {
            const token = await authorizeRemote(provider, controller.signal);
            if (token) {
                setAuthStatus(`✅ ${provider.toUpperCase()} Connected!`);
                oauthTokenRef.current = token;
                const remoteName = wizardContext === "source" ? Env.REMOTE_PORTAL_SOURCE : Env.REMOTE_PORTAL_BACKUP;
                updateGenericRemote(remoteName, provider, { token });
                const field = wizardContext === "source" ? "source_provider" : "backup_provider";
                const pending = wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current;
                updateConfig(prev => ({ ...prev, [field]: pending }));
                next();
            }
        } catch (err: unknown) {
            if (controller.signal.aborted) return;
            const error = err as Error;
            setAuthStatus(`❌ Error: ${error.message}`);
        } finally {
            if (authAbortControllerRef.current === controller) {
                authAbortControllerRef.current = null;
                setIsAuthLoading(false);
            }
        }
    }, [wizardContext, next, updateConfig, abortAuth]);

    const confirmSelection = useCallback((opt: WizardOption) => {
        if (!opt) return;

        if (opt.type === "deploy") {
            if (opt.value) onComplete(config);
            else onCancel();
            return;
        }


        if (opt.type === "gdrive_path" || opt.type === "intro_path") {
            pendingCloudPathRef.current = opt.value as "guided" | "direct";
            next();
            return;
        }

        if (opt.type === "guide_next") {
            next();
            return;
        }

        if (opt.type === "desktop_shortcut") {
            if (opt.value === 1) {
                bootstrapSystem(join(process.cwd(), "src/index.tsx"));
            }
            updateConfig(prev => ({ ...prev, desktop_shortcut: opt.value as number }));
            next();
            return;
        }

        if (opt.type === "jump") {
            setIsMenuMode(true);
            const targetStep = opt.value as Step;
            if (targetStep === "source_choice" || targetStep === "copyparty_config") setWizardContext("source");
            if (targetStep === "dest_cloud_select") setWizardContext("dest");
            setStep(targetStep);
            return;
        }

        if (opt.type === "dir_confirm") {
            if (config.local_dir && config.local_dir !== "" && config.local_dir !== "none") {
                next();
            }
            return;
        }

        if (opt.type === "sec_policy") {
            updateConfig(prev => ({ ...prev, enable_malware_shield: true, malware_policy: opt.value as "purge" | "isolate" }));
            next();
        } else if (opt.type === "sec_toggle") {
            updateConfig(prev => ({ ...prev, enable_malware_shield: opt.value as boolean }));
            next();
        } else if (opt.type === "source_select" || opt.type === "source_provider") {
            pendingSourceProviderRef.current = opt.value as PortalProvider;
            next();
        } else if (opt.type === "backup_provider") {
            pendingBackupProviderRef.current = opt.value as PortalProvider;
            setWizardContext("dest");
            next();
        } else if (opt.type === "sync_mode") {
            const newVal = opt.value === "sync_backup";
            updateConfig(prev => ({ ...prev, upsync_enabled: newVal }));
            setSelectedIndex(0);
            if (newVal) {
                setWizardContext("dest");
                setStep("dest_cloud_select");
            } else {
                setStep((isMenuMode || mode === "edit") ? "edit_menu" : "deploy");
            }
        } else {
            const fieldMap: Record<string, keyof PortalConfig> = {
                shortcut: "desktop_shortcut",
                mirror: "strict_mirror"
            };
            const field = fieldMap[opt.type as string];
            if (field) updateConfig(prev => ({ ...prev, [field]: opt.value }));
            next();
        }
    }, [config, mode, isMenuMode, next, updateConfig, onComplete, onCancel]);

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
                    } else {
                        _onFocusChange("footer");
                    }
                }
                return;
            }

            if (step === "copyparty_config") {
                if (e.name === "down") {
                    set_copyparty_config_index(prev => Math.min(4, prev + 1));
                    return;
                } else if (e.name === "up") {
                    set_copyparty_config_index(prev => Math.max(0, prev - 1));
                    return;
                }
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
                                // Save and proceed
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
                    } else {
                        set_direct_entry_index(prev => prev + 1);
                    }
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
            } else if (e.name === "return") {
                confirmSelection(options[selectedIndex]!);
            }
        }
    };

    useKeyboard((e) => keyboardHandlerRef.current?.(e));


    return (
        <box flexDirection="column" padding={1} border borderStyle="double" borderColor={colors.primary} title="[ SYSTEM CONFIGURATION WIZARD ]" gap={1}>
            {/* Instruction area: explicitly remove ESC from here as it now controls Exit App */}
            <text attributes={TextAttributes.DIM} fg={colors.dim}>Use Arrow Keys to navigate Selects, Enter to confirm.</text>
            {step === "edit_menu" && (
                <box flexDirection="column" gap={1}>
                    <text attributes={TextAttributes.BOLD} fg={colors.fg}>Configuration Menu</text>
                    <text fg={colors.fg}>Select a section to edit:</text>
                    <box flexDirection="column" gap={0} marginTop={1}>
                        {[
                            { name: "System integration", description: "Shortcut & Desktop Icon", value: "shortcut", key: "1" },
                            { name: "Source Provider", description: "Remote & Authentication", value: "source_choice", key: "2" },
                            { name: "Storage Path", description: "Local Sync Directory", value: "dir", key: "3" },
                            { name: "Sync Strategy", description: "Mirror Mode / Deletion", value: "mirror", key: "4" },
                            { name: "Backup Settings", description: "Cloud Upsync & Malware Shield", value: "upsync_ask", key: "5" },
                            { name: "Security Policy", description: "Malware Handling", value: "security", key: "6" },
                            { name: "Deploy & Finish", description: "Finalize changes", value: "deploy", key: "0" }
                        ].map((opt, i) => {
                            const isSelected = selectedIndex === i && focusArea === "body";
                            return (
                                <box
                                    key={i}
                                    onMouseOver={() => {
                                        _onFocusChange("body");
                                        setSelectedIndex(i);
                                    }}
                                    onMouseDown={() => confirmSelection({ type: "jump", value: opt.value })}
                                    paddingLeft={2}
                                    flexDirection="row"
                                    alignItems="center"
                                    border
                                    borderStyle="single"
                                    borderColor={isSelected ? colors.success : "transparent"}
                                >
                                    <box width={3}>
                                        <text fg={isSelected ? colors.primary : colors.dim}>{isSelected ? "▶ " : "  "}</text>
                                    </box>
                                    <Hotkey
                                        keyLabel={opt.key}
                                        label={opt.name}
                                        isFocused={isSelected}
                                    />
                                    <text fg={isSelected ? colors.fg : colors.dim}> - {String(opt.description)}</text>
                                </box>
                            );
                        })}
                    </box>
                </box>
            )}

            {step === "shortcut" && (
                <box flexDirection="column" gap={1}>
                    <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: System Integration</text>
                    <text fg={isShortcutMissing ? colors.danger : colors.fg}>
                        {String(isShortcutMissing ? "⚠️  Shortcut missing! Did you move it standard location?" : "Add Portal to Desktop Apps?")}
                    </text>
                    <box flexDirection="column" gap={0} marginTop={1}>
                        {(isShortcutMissing ? [
                            { name: "RECREATE", description: "Icon is missing, recreate at standard path", value: 1, key: "1" },
                            { name: "I MOVED IT", description: "I moved the icon elsewhere, don't ask again", value: 2, key: "2" },
                            { name: "SKIP", description: "Go to next step without changes", value: 0, key: "3" }
                        ] : [
                            { name: "YES", description: `Create Desktop Icon (${process.platform === "win32" ? "Start Menu" : (process.platform === "darwin" ? "Applications" : "~/.local/bin")})`, value: 1, key: "1" },
                            { name: "NO", description: "Skip system integration", value: 0, key: "2" }
                        ]).map((opt, i) => (
                            <box
                                key={i}
                                onMouseOver={() => {
                                    _onFocusChange("body");
                                    setSelectedIndex(i);
                                }}
                                onMouseDown={() => confirmSelection(getOptions()[i]!)}
                                paddingLeft={2}
                                border
                                borderStyle="single"
                                borderColor={selectedIndex === i && focusArea === "body" ? colors.success : "transparent"}
                            >
                                <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{String(selectedIndex === i && focusArea === "body" ? "▶ " : "  ")}</text>
                                <Hotkey
                                    keyLabel={opt.key}
                                    label={opt.name}
                                    isFocused={selectedIndex === i && focusArea === "body"}
                                />
                                <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {String(opt.description)}</text>
                            </box>
                        ))}
                    </box>
                </box>
            )}

            {step === "copyparty_config" && (
                <box flexDirection="column" gap={1}>
                    <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: CopyParty Source Configuration</text>

                    {/* URL */}
                    <box flexDirection="column" gap={0} onMouseDown={() => { _onFocusChange("body"); set_copyparty_config_index(0); }}>
                        <text fg={copyparty_config_index === 0 ? colors.primary : colors.fg}>🌐 URL/IP:</text>
                        <input
                            focused={focusArea === "body" && copyparty_config_index === 0}
                            placeholder="http://192.168.1.5:3911"
                            value={wizardInputs.url}
                            onChange={(val) => updateInput("url", val, urlRef)}
                            onKeyDown={(e) => {
                                if (e.name === "return") set_copyparty_config_index(1);
                                if (e.name === "down") set_copyparty_config_index(1);
                            }}
                        />
                    </box>

                    {/* USER */}
                    <box flexDirection="column" gap={0} onMouseDown={() => { _onFocusChange("body"); set_copyparty_config_index(1); }}>
                        <text fg={copyparty_config_index === 1 ? colors.primary : colors.fg}>👤 Username:</text>
                        <input
                            focused={focusArea === "body" && copyparty_config_index === 1}
                            placeholder="Username"
                            value={wizardInputs.user}
                            onChange={(val) => updateInput("user", val, userRef)}
                            onKeyDown={(e) => {
                                if (e.name === "return") set_copyparty_config_index(2);
                                if (e.name === "down") set_copyparty_config_index(2);
                                if (e.name === "up") set_copyparty_config_index(0);
                            }}
                        />
                    </box>

                    {/* PASS */}
                    <box flexDirection="column" gap={0} onMouseDown={() => { _onFocusChange("body"); set_copyparty_config_index(2); }}>
                        <text fg={copyparty_config_index === 2 ? colors.primary : colors.fg}>🔑 Password:</text>
                        <input
                            focused={focusArea === "body" && copyparty_config_index === 2}
                            placeholder="Password"
                            value={wizardInputs.pass}
                            onChange={(val) => updateInput("pass", val, passRef)}
                            onKeyDown={(e) => {
                                if (e.name === "return") set_copyparty_config_index(3);
                                if (e.name === "down") set_copyparty_config_index(3);
                                if (e.name === "up") set_copyparty_config_index(1);
                            }}
                        />
                    </box>

                    {/* METHOD */}
                    <box flexDirection="column" gap={1} marginTop={1}>
                        <text fg={copyparty_config_index === 3 ? colors.primary : colors.fg}>🛡️ Connection Method:</text>
                        <box flexDirection="row" gap={2}>
                            {[
                                { name: "WebDAV", value: "webdav" },
                                { name: "HTTP", value: "http" }
                            ].map((m, i) => {
                                const isSelected = (config.copyparty_method || "webdav") === m.value;
                                const isFocused = copyparty_config_index === 3 && selectedIndex === i;
                                return (
                                    <box
                                        key={i}
                                        onMouseOver={() => {
                                            setSelectedIndex(i);
                                            set_copyparty_config_index(3);
                                        }}
                                        onMouseDown={() => {
                                            updateConfig(prev => ({ ...prev, copyparty_method: m.value as "webdav" | "http" }));
                                        }}
                                        border
                                        borderStyle="single"
                                        borderColor={isSelected ? colors.success : (isFocused ? colors.primary : "transparent")}
                                        paddingLeft={1}
                                        paddingRight={1}
                                    >
                                        <text fg={isSelected ? colors.success : colors.fg}>{String(m.name)}</text>
                                    </box>
                                );
                            })}
                        </box>
                    </box>

                    {/* ACTION */}
                    <box
                        marginTop={1}
                        onMouseOver={() => set_copyparty_config_index(4)}
                        onMouseDown={() => !isAuthLoading && handleAuth()}
                        border
                        borderStyle="double"
                        borderColor={copyparty_config_index === 4 ? colors.success : colors.dim}
                        paddingLeft={2}
                        paddingRight={2}
                        alignItems="center"
                    >
                        <text fg={copyparty_config_index === 4 ? colors.success : colors.dim}>
                            {String(isAuthLoading ? "🔄 CONNECTING..." : "[ VERIFY & CONNECT ]")}
                        </text>
                    </box>

                    {authStatus ? (
                        <box marginTop={1}>
                            <text fg={authStatus.includes("✅") ? colors.success : colors.danger}>{String(authStatus)}</text>
                        </box>
                    ) : null}
                </box>
            )}

            {step === "cloud_direct_entry" && (
                <box flexDirection="column" gap={1}>
                    <text attributes={TextAttributes.BOLD} fg={colors.fg}>
                        Step {getCurrentStepNumber()}: {wizardContext === "source" ? "[ SOURCE ]" : "[ BACKUP ]"} Credentials
                    </text>
                    <text fg={colors.fg}>
                        Setup credentials for {(wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current).toUpperCase()}:
                    </text>

                    <box flexDirection="column" gap={1} marginTop={1}>
                        {(() => {
                            const provider = wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current;
                            const fields: { label: string, ref: React.MutableRefObject<string>, icon: string, placeholder?: string, key: keyof typeof wizardInputs }[] = [];

                            if (provider === "gdrive") {
                                fields.push({ label: "Client ID", ref: clientIdRef, icon: "🆔", placeholder: "123...apps.googleusercontent.com", key: "clientId" });
                                fields.push({ label: "Client Secret", ref: clientSecretRef, icon: "🔑", placeholder: "GOCSPX-...", key: "clientSecret" });
                            } else if (provider === "b2") {
                                fields.push({ label: "Key ID", ref: b2IdRef, icon: "🆔", placeholder: "005...", key: "b2Id" });
                                fields.push({ label: "Application Key", ref: b2KeyRef, icon: "🔑", placeholder: "K005...", key: "b2Key" });
                            } else if (provider === "sftp") {
                                fields.push({ label: "Host", ref: urlRef, icon: "🌐", placeholder: "sftp.example.com:22", key: "url" });
                                fields.push({ label: "User", ref: userRef, icon: "👤", placeholder: "username", key: "user" });
                                fields.push({ label: "Password", ref: passRef, icon: "🔑", placeholder: "password", key: "pass" });
                            } else if (provider === "pcloud") {
                                fields.push({ label: "User", ref: userRef, icon: "👤", placeholder: "email@example.com", key: "user" });
                                fields.push({ label: "Password", ref: passRef, icon: "🔑", placeholder: "password", key: "pass" });
                            } else if (provider === "onedrive" || provider === "dropbox") {
                                // No fields needed - OAuth handled by rclone authorize
                            } else if (provider === "mega") {
                                fields.push({ label: "User", ref: userRef, icon: "👤", placeholder: "email@example.com", key: "user" });
                                fields.push({ label: "Password", ref: passRef, icon: "🔑", placeholder: "password", key: "pass" });
                            } else if (provider === "r2") {
                                fields.push({ label: "Access Key ID", ref: userRef, icon: "🆔", placeholder: "access-key", key: "user" });
                                fields.push({ label: "Secret Key", ref: passRef, icon: "🔑", placeholder: "secret-key", key: "pass" });
                                fields.push({ label: "Endpoint", ref: urlRef, icon: "🌐", placeholder: "account-id.r2.cloudflarestorage.com", key: "url" });
                            }

                            const isConnectFocused = direct_entry_index === fields.length && focusArea === "body";

                            const handleAction = () => {
                                // Skip validation for OAuth providers (no manual fields)
                                if (provider === "onedrive" || provider === "dropbox") {
                                    startGenericAuth(provider);
                                    return;
                                }

                                // Validate required fields
                                const requiredFields = fields.filter(f => f.ref.current.trim() === "");
                                if (requiredFields.length > 0) {
                                    setAuthStatus(`⚠️ Required: ${requiredFields.map(f => f.label).join(", ")}`);
                                    return;
                                }

                                if (provider === "gdrive") handleGdriveAuth(clientIdRef.current, clientSecretRef.current);
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
                            };

                            return (
                                <>
                                    {fields.map((f, i) => (
                                        <box key={i} flexDirection="column" gap={0}
                                            onMouseDown={() => { _onFocusChange("body"); set_direct_entry_index(i); }}
                                        >
                                            <text fg={direct_entry_index === i && focusArea === "body" ? colors.primary : colors.fg}>
                                                {String(f.icon)} {String(f.label)}:
                                            </text>
                                            <input
                                                value={wizardInputs[f.key]}
                                                onChange={(val) => updateInput(f.key, val, f.ref)}
                                                focused={direct_entry_index === i && focusArea === "body"}
                                                placeholder={f.placeholder}
                                                onKeyDown={(e) => {
                                                    if (e.name === "return" || e.name === "down") {
                                                        set_direct_entry_index(i + 1);
                                                    } else if (e.name === "up" && i > 0) {
                                                        set_direct_entry_index(i - 1);
                                                    }
                                                }}
                                            />
                                        </box>
                                    ))}

                                    <box
                                        marginTop={1}
                                        onMouseOver={() => { _onFocusChange("body"); set_direct_entry_index(fields.length); }}
                                        onMouseDown={handleAction}
                                        border
                                        borderStyle="double"
                                        borderColor={isConnectFocused ? colors.success : colors.dim}
                                        paddingLeft={2}
                                        paddingRight={2}
                                        alignItems="center"
                                    >
                                        <text fg={isConnectFocused ? colors.success : colors.dim}>
                                            {String(isAuthLoading ? "🔄 CONNECTING..." : "[ VERIFY & CONNECT ]")}
                                        </text>
                                    </box>
                                </>
                            );
                        })()}
                    </box>

                    {authStatus ? (
                        <box marginTop={1}>
                            <text fg={authStatus.includes("✅") ? colors.success : colors.danger}>{String(authStatus)}</text>
                        </box>
                    ) : null}
                </box>
            )}

            {step === "dir" && (
                <box flexDirection="column" gap={1} onMouseDown={() => _onFocusChange("body")}>
                    <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: Storage Path</text>
                    <text fg={colors.fg}>📂 Local Sync Directory:</text>
                    <input
                        focused={focusArea === "body" && !isAuthLoading}
                        placeholder="/path/to/schematics"
                        value={(config.local_dir === "" || config.local_dir === "none") ? "" : (config.local_dir || "")}
                        onChange={(val) => updateConfig(prev => ({ ...prev, local_dir: val }))}
                        onKeyDown={(e) => { if (e.name === "return") next(); }}
                    />
                </box>
            )}

            {step === "backup_dir" && (
                <box flexDirection="column" gap={1} onMouseDown={() => _onFocusChange("body")}>
                    <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: Backup Path</text>
                    <text fg={colors.fg}>📂 Remote Backup Folder:</text>
                    <input
                        focused={focusArea === "body" && !isAuthLoading}
                        placeholder={config.backup_provider === "gdrive" ? "SchematicsBackup" : "Folder name"}
                        value={config.backup_dir || ""}
                        onChange={(val) => updateConfig(prev => ({ ...prev, backup_dir: val }))}
                        onKeyDown={(e) => { if (e.name === "return") next(); }}
                    />
                    <box marginTop={1} padding={1} border borderStyle="single" borderColor={colors.dim}>
                        <text fg={colors.primary}>TIP: Leave blank to use {config.backup_provider === "gdrive" ? "SchematicsBackup (Recommended)" : "the root folder"}.</text>
                    </box>
                </box>
            )}

            {step === "mirror" && (
                <box flexDirection="column" gap={1}>
                    <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: Sync Strategy</text>
                    <text fg={colors.fg}>🔄 Mirror Mode (Delete local files not on remote?):</text>
                    <box flexDirection="column" gap={0} marginTop={1}>
                        {[
                            { name: "NO", description: "Safe Mode: Never delete local files", value: false, key: "1" },
                            { name: "YES", description: "Mirror Mode: Keep local perfectly synced with remote", value: true, key: "2" }
                        ].map((opt, i) => (
                            <box
                                key={i}
                                onMouseOver={() => {
                                    _onFocusChange("body");
                                    setSelectedIndex(i);
                                }}
                                onMouseDown={() => confirmSelection(getOptions()[i]!)}
                                paddingLeft={2}
                                border
                                borderStyle="single"
                                borderColor={selectedIndex === i && focusArea === "body" ? colors.success : "transparent"}
                                flexDirection="row"
                                alignItems="center"
                                gap={1}
                            >
                                <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{String(selectedIndex === i && focusArea === "body" ? "▶ " : "  ")}</text>
                                <Hotkey
                                    keyLabel={opt.key}
                                    label={opt.name}
                                    isFocused={selectedIndex === i && focusArea === "body"}
                                />
                                <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {String(opt.description)}</text>
                            </box>
                        ))}
                    </box>
                </box>
            )}



            {step === "source_choice" && (
                <box flexDirection="column" gap={1}>
                    <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: Source Provider</text>
                    <text fg={colors.fg}>🔗 Select your "Source of Truth":</text>
                    <box flexDirection="column" gap={0} marginTop={1}>
                        {getOptions().map((opt, i) => {
                            const providers: Record<string, { name: string, icon: string, desc?: string }> = {
                                copyparty: { name: "CopyParty (IYKYK)", icon: "\ueac2" },
                                gdrive: { name: "Google Drive", icon: "\ueac2" },
                                b2: { name: "Backblaze Cloud", icon: "\ueac2" },
                                pcloud: { name: "pCloud", icon: "\ueac2" },
                                sftp: { name: "SFTP/SSH", icon: "\ueac2" },
                                onedrive: { name: "OneDrive", icon: "\ueac2" },
                                dropbox: { name: "Dropbox", icon: "\ueac2" },
                                mega: { name: "Mega.nz", icon: "\ueac2" },
                                r2: { name: "Cloudflare R2", icon: "\ueac2" }
                            };
                            const p = providers[opt.value as string];
                            return (
                                <box
                                    key={i}
                                    onMouseOver={() => {
                                        _onFocusChange("body");
                                        setSelectedIndex(i);
                                    }}
                                    onMouseDown={() => {
                                        pendingSourceProviderRef.current = opt.value as PortalProvider;
                                        next();
                                    }}
                                    paddingLeft={2}
                                    border
                                    borderStyle="single"
                                    borderColor={selectedIndex === i && focusArea === "body" ? colors.success : "transparent"}
                                    flexDirection="row"
                                    alignItems="center"
                                    gap={1}
                                >
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{String(selectedIndex === i && focusArea === "body" ? "▶ " : "  ")}</text>
                                    <ProviderIcon provider={opt.value as string} version={fontVersion} color={colors.primary} />
                                    <Hotkey
                                        keyLabel={(i + 1).toString()}
                                        label={p?.name || (opt.value as string)}
                                        isFocused={selectedIndex === i && focusArea === "body"}
                                    />
                                </box>
                            );
                        })}
                    </box>
                </box>
            )}

            {
                (step === "dest_cloud_select") && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>
                            Step {getCurrentStepNumber()}: Backup Provider
                        </text>
                        <text fg={colors.fg}>☁️  Select your cloud storage provider:</text>
                        <box flexDirection="column" gap={0} marginTop={1}>
                            {(getOptions() as { value: PortalProvider, type: string }[]).map((opt, i) => {
                                const providers: Record<string, { name: string, icon: string, desc: string }> = {
                                    gdrive: { name: "Google Drive", icon: "\ueac2", desc: "Safe Bet: 2yr safety net, easy auth. (Cons: Files scanned)" },
                                    b2: { name: "Backblaze Cloud", icon: "\ueac2", desc: "Pro Storage: $6/TB, reliable. (Cons: Complex setup)" },
                                    pcloud: { name: "pCloud", icon: "\ueac2", desc: "Forever Silo: Swiss Privacy, No Subs. (Cons: High upfront)" },
                                    sftp: { name: "SFTP/SSH", icon: "\ueac2", desc: "Fortress: 100% Private, Free. (Cons: Self-managed)" },
                                    onedrive: { name: "OneDrive", icon: "\ueac2", desc: "Familiar: Integrated, reliable. (Cons: High scanning)" },
                                    dropbox: { name: "Dropbox", icon: "\ueac2", desc: "Familiar: Integrated, reliable. (Cons: High cost)" },
                                    mega: { name: "Mega.nz", icon: "\ueac2", desc: "Specialized: 20GB Free. (Cons: Slower/Finicky)" },
                                    r2: { name: "Cloudflare R2", icon: "\ueac2", desc: "Specialized: Zero Egress. (Cons: Dev-centric)" }
                                };
                                const p = providers[opt.value];
                                return (
                                    <box
                                        key={i}
                                        onMouseOver={() => {
                                            _onFocusChange("body");
                                            setSelectedIndex(i);
                                        }}
                                        onMouseDown={() => confirmSelection(opt)}
                                        paddingLeft={2}
                                        border
                                        borderStyle="single"
                                        borderColor={selectedIndex === i && focusArea === "body" ? colors.success : "transparent"}
                                        flexDirection="row"
                                        alignItems="center"
                                        gap={1}
                                    >
                                        <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{String(selectedIndex === i && focusArea === "body" ? "▶ " : "  ")}</text>
                                        <ProviderIcon provider={opt.value} version={fontVersion} color={colors.primary} />
                                        <Hotkey
                                            keyLabel={(i + 1).toString()}
                                            label={p?.name || opt.value}
                                            isFocused={selectedIndex === i && focusArea === "body"}
                                        />
                                        {p?.desc ? <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {String(p.desc)}</text> : null}
                                    </box>
                                );
                            })}
                        </box>
                    </box>
                )
            }



            {
                step === "upsync_ask" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: Cloud Backup (Optional)</text>
                        <text fg={colors.fg}>🚀 Do you want to enable Upsync (Backup)?</text>
                        <box flexDirection="column" gap={0} marginTop={1}>
                            {[
                                { name: "NO", description: "Download Only (Standard)", value: "download_only", key: "1", icon: "\ueac2" },
                                { name: "YES", description: "Enable Cloud Backup", value: "sync_backup", key: "2", icon: "\ueac3" }
                            ].map((opt, i) => (
                                <box
                                    key={i}
                                    onMouseOver={() => {
                                        _onFocusChange("body");
                                        setSelectedIndex(i);
                                    }}
                                    onMouseDown={() => confirmSelection(getOptions()[i]!)}
                                    paddingLeft={2}
                                    border
                                    borderStyle="single"
                                    borderColor={selectedIndex === i && focusArea === "body" ? colors.success : "transparent"}
                                    flexDirection="row"
                                    alignItems="center"
                                    gap={1}
                                >
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{String(selectedIndex === i && focusArea === "body" ? "▶ " : "  ")}</text>
                                    <text fg={colors.primary}>{String(opt.icon)}</text>
                                    <Hotkey keyLabel={opt.key} label={opt.name} color={selectedIndex === i && focusArea === "body" ? colors.success : colors.primary} />
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {String(opt.description)}</text>
                                </box>
                            ))}
                        </box>
                    </box>
                )
            }

            {
                step === "security" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: Malware Shield</text>
                        <text fg={colors.fg}>🛡️ Surgical Security Policy (How to handle risky tools):</text>
                        {config.backup_provider === "gdrive" && (
                            <text fg={colors.warning} attributes={TextAttributes.BOLD} marginTop={1}>
                                ⚠️ Mandatory for Google Drive: Projects may be suspended without malware filtering.
                            </text>
                        )}
                        <box flexDirection="column" gap={0} marginTop={1}>
                            {[
                                { name: "RELOCATE & ISOLATE", description: "Move risks to local-only _risk_tools folder", value: "isolate", key: "1" },
                                { name: "SURGICAL PURGE", description: "Delete risks after extraction", value: "purge", key: "2" },
                                { name: "DISABLED", description: "Keep everything as-is (High Cloud Flagging Risk)", value: false, key: "3" }
                            ].map((opt, i) => (
                                <box
                                    key={i}
                                    onMouseOver={() => {
                                        _onFocusChange("body");
                                        setSelectedIndex(i);
                                    }}
                                    onMouseDown={() => confirmSelection(getOptions()[i]!)}
                                    paddingLeft={2}
                                    border
                                    borderStyle="single"
                                    borderColor={selectedIndex === i && focusArea === "body" ? colors.success : "transparent"}
                                >
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{String(selectedIndex === i && focusArea === "body" ? "▶ " : "  ")}</text>
                                    <Hotkey
                                        keyLabel={opt.key}
                                        label={opt.name}

                                        color={selectedIndex === i && focusArea === "body" ? colors.success : colors.primary}
                                    />
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {String(opt.description)}</text>
                                </box>
                            ))}
                        </box>
                    </box>
                )
            }



            {
                step === "gdrive_intro" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>
                            Step {getCurrentStepNumber()}: {wizardContext === "source" ? "[ SOURCE ]" : "[ BACKUP ]"} Google Drive Setup
                        </text>
                        <text fg={colors.fg}>To keep your system backups safe, we need a dedicated Google Cloud Project.</text>
                        <box flexDirection="column" gap={0} marginTop={1}>
                            {[
                                { name: "GUIDED SETUP", description: "Walk me through creating a new GCP Project", value: "guided", key: "1" },
                                { name: "I HAVE CREDENTIALS", description: "I already have a Client ID and Secret", value: "direct", key: "2" }
                            ].map((opt, i) => (
                                <box
                                    onMouseOver={() => {
                                        _onFocusChange("body");
                                        setSelectedIndex(i);
                                    }}
                                    onMouseDown={() => confirmSelection(getOptions()[i]!)}
                                    key={i}
                                    paddingLeft={2}
                                    border
                                    borderStyle="single"
                                    borderColor={selectedIndex === i && focusArea === "body" ? colors.success : "transparent"}
                                >
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{String(selectedIndex === i && focusArea === "body" ? "▶ " : "  ")}</text>
                                    <Hotkey
                                        keyLabel={opt.key}
                                        label={opt.name}

                                        color={selectedIndex === i && focusArea === "body" ? colors.success : colors.primary}
                                    />
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {String(opt.description)}</text>
                                </box>
                            ))}
                        </box>
                        <box marginTop={1} padding={1} border borderStyle="single" borderColor={colors.dim}>
                            <text fg={colors.primary}>INFO: Simplest setup, but requires a Google Account.</text>
                        </box>
                    </box>
                )
            }

            {
                step === "b2_intro" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>
                            Step {getCurrentStepNumber()}: {wizardContext === "source" ? "[ SOURCE ]" : "[ BACKUP ]"} Backblaze B2 Setup
                        </text>
                        <text fg={colors.fg}>Connect your low-cost B2 bucket for secure offsite checks.</text>
                        <box flexDirection="column" gap={0} marginTop={1}>
                            {[
                                { name: "CREATE KEYS", description: "Show me where to get my Application Key", value: "guided", key: "1" },
                                { name: "ENTER KEYS", description: "I already have KeyID and ApplicationKey", value: "direct", key: "2" }
                            ].map((opt, i) => (
                                <box
                                    key={i}
                                    onMouseOver={() => {
                                        _onFocusChange("body");
                                        setSelectedIndex(i);
                                    }}
                                    onMouseDown={() => confirmSelection(getOptions()[i]!)}
                                    paddingLeft={2}
                                    border
                                    borderStyle="single"
                                    borderColor={selectedIndex === i && focusArea === "body" ? colors.success : "transparent"}
                                >
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{String(selectedIndex === i && focusArea === "body" ? "▶ " : "  ")}</text>
                                    <Hotkey
                                        keyLabel={opt.key}
                                        label={opt.name}

                                        color={selectedIndex === i && focusArea === "body" ? colors.success : colors.primary}
                                    />
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {String(opt.description)}</text>
                                </box>
                            ))}
                        </box>
                        <box marginTop={1} padding={1} border borderStyle="single" borderColor={colors.dim}>
                            <text fg={colors.primary}>PRO: Cheapest reliable cloud ($6/TB). CON: No native image previews.</text>
                            {selectedIndex === 0 && <text fg={colors.success} marginTop={1}>GUIDE: Go to Backblaze.com {"->"} App Keys {"->"} Add a New Application Key.</text>}
                        </box>
                    </box>
                )
            }

            {
                step === "b2_guide_1" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: B2 Guide: Key Management</text>
                        <box flexDirection="column">
                            <text fg={colors.fg}>1. Log in to your Backblaze account.</text>
                            <text fg={colors.fg}>2. Go to 'App Keys' in the sidebar.</text>
                            <text fg={colors.fg}>3. Click 'Add a New Application Key'.</text>
                        </box>
                        <box
                            marginTop={1}
                            onMouseOver={() => _onFocusChange("body")}
                            onMouseDown={() => next()}
                            border
                            borderStyle="double"
                            borderColor={focusArea === "body" ? colors.success : colors.dim}
                            paddingLeft={2}
                            paddingRight={2}
                            alignItems="center"
                        >
                            <text fg={focusArea === "body" ? colors.success : colors.dim}>
                                {String(focusArea === "body" ? "▶ " : "  ")}
                            </text>
                            <Hotkey keyLabel="1" label="NEXT STEP" isFocused={focusArea === "body"} />
                        </box>
                    </box>
                )
            }

            {
                step === "b2_guide_2" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: B2 Guide: Creating the Key</text>
                        <box flexDirection="column">
                            <text fg={colors.fg}>1. Name: 'schem-sync-portal'.</text>
                            <text fg={colors.fg}>2. Permissions: 'Read and Write'.</text>
                            <text fg={colors.fg}>3. COPY your KeyID and ApplicationKey!</text>
                        </box>
                        <box
                            marginTop={1}
                            onMouseOver={() => _onFocusChange("body")}
                            onMouseDown={() => next()}
                            border
                            borderStyle="double"
                            borderColor={focusArea === "body" ? colors.success : colors.dim}
                            paddingLeft={2}
                            paddingRight={2}
                            alignItems="center"
                        >
                            <text fg={focusArea === "body" ? colors.success : colors.dim}>
                                {String(focusArea === "body" ? "▶ " : "  ")}
                            </text>
                            <Hotkey keyLabel="1" label="DONE" isFocused={focusArea === "body"} />
                        </box>
                    </box>
                )
            }

            {
                step === "sftp_intro" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>
                            Step {getCurrentStepNumber()}: {wizardContext === "source" ? "[ SOURCE ]" : "[ BACKUP ]"} SFTP / Sovereign Setup
                        </text>
                        <text fg={colors.fg}>Connect your own server, NAS, or generic remote.</text>
                        <box flexDirection="column" gap={0} marginTop={1}>
                            {[
                                { name: "CONNECTION GUIDE", description: "What information do I need?", value: "guided", key: "1" },
                                { name: "ENTER DETAILS", description: "I have Host, User, and Pass/Key", value: "direct", key: "2" }
                            ].map((opt, i) => (
                                <box
                                    key={i}
                                    onMouseOver={() => {
                                        _onFocusChange("body");
                                        setSelectedIndex(i);
                                    }}
                                    onMouseDown={() => confirmSelection(getOptions()[i]!)}
                                    paddingLeft={2}
                                    border
                                    borderStyle="single"
                                    borderColor={selectedIndex === i && focusArea === "body" ? colors.success : "transparent"}
                                >
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{String(selectedIndex === i && focusArea === "body" ? "▶ " : "  ")}</text>
                                    <Hotkey
                                        keyLabel={opt.key}
                                        label={opt.name}

                                        color={selectedIndex === i && focusArea === "body" ? colors.success : colors.primary}
                                    />
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {String(opt.description)}</text>
                                </box>
                            ))}
                        </box>
                        <box marginTop={1} padding={1} border borderStyle="single" borderColor={colors.dim}>
                            <text fg={colors.primary}>PRO: Total Control, $0 fees. CON: You manage uptime.</text>
                            {selectedIndex === 0 && <text fg={colors.success} marginTop={1}>guide: Ensure SSH access is enabled on your target and you know the port (default 22).</text>}
                        </box>
                    </box>
                )
            }

            {
                step === "sftp_guide_1" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: SFTP Guide: Connection Details</text>
                        <box flexDirection="column">
                            <text fg={colors.fg}>1. Ensure SSH is enabled on the remote server.</text>
                            <text fg={colors.fg}>2. Standard port is 22. Note down if different.</text>
                            <text fg={colors.fg}>3. Username and Password/Key required.</text>
                        </box>
                        <box
                            marginTop={1}
                            onMouseOver={() => _onFocusChange("body")}
                            onMouseDown={() => next()}
                            border
                            borderStyle="double"
                            borderColor={focusArea === "body" ? colors.success : colors.dim}
                            paddingLeft={2}
                            paddingRight={2}
                            alignItems="center"
                        >
                            <text fg={focusArea === "body" ? colors.success : colors.dim}>
                                {String(focusArea === "body" ? "▶ " : "  ")}
                            </text>
                            <Hotkey keyLabel="1" label="READY" isFocused={focusArea === "body"} />
                        </box>
                    </box>
                )
            }

            {
                step === "pcloud_intro" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>
                            Step {getCurrentStepNumber()}: {wizardContext === "source" ? "[ SOURCE ]" : "[ BACKUP ]"} pCloud Setup
                        </text>
                        <text fg={colors.fg}>Swiss-hosted secure storage with lifetime plans.</text>
                        <box flexDirection="column" gap={0} marginTop={1}>
                            {[
                                { name: "ACCOUNT INFO", description: "What region should I use?", value: "guided", key: "1" },
                                { name: "LOGIN", description: "Enter Email and Password", value: "direct", key: "2" }
                            ].map((opt, i) => (
                                <box
                                    key={i}
                                    onMouseOver={() => {
                                        _onFocusChange("body");
                                        setSelectedIndex(i);
                                    }}
                                    onMouseDown={() => confirmSelection(getOptions()[i]!)}
                                    paddingLeft={2}
                                    border
                                    borderStyle="single"
                                    borderColor={selectedIndex === i && focusArea === "body" ? colors.success : "transparent"}
                                >
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{String(selectedIndex === i && focusArea === "body" ? "▶ " : "  ")}</text>
                                    <Hotkey
                                        keyLabel={opt.key}
                                        label={opt.name}

                                        color={selectedIndex === i && focusArea === "body" ? colors.success : colors.primary}
                                    />
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {String(opt.description)}</text>
                                </box>
                            ))}
                        </box>
                        <box marginTop={1} padding={1} border borderStyle="single" borderColor={colors.dim}>
                            <text fg={colors.primary}>PRO: Privacy-focused, Swiss laws. CON: API usage limits on free tier.</text>
                        </box>
                    </box>
                )
            }

            {
                step === "pcloud_guide_1" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: pCloud Guide: Credentials</text>
                        <box flexDirection="column">
                            <text fg={colors.fg}>1. Use your pCloud login email and password.</text>
                            <text fg={colors.fg}>2. If using 2FA, create an "App Password" in security.</text>
                        </box>
                        <box
                            marginTop={1}
                            onMouseOver={() => _onFocusChange("body")}
                            onMouseDown={() => next()}
                            border
                            borderStyle="double"
                            borderColor={focusArea === "body" ? colors.success : colors.dim}
                            paddingLeft={2}
                            paddingRight={2}
                            alignItems="center"
                        >
                            <text fg={focusArea === "body" ? colors.success : colors.dim}>
                                {String(focusArea === "body" ? "▶ " : "  ")}
                            </text>
                            <Hotkey keyLabel="1" label="READY" isFocused={focusArea === "body"} />
                        </box>
                    </box>
                )
            }

            {
                step === "onedrive_intro" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>
                            Step {getCurrentStepNumber()}: {wizardContext === "source" ? "[ SOURCE ]" : "[ BACKUP ]"} OneDrive Setup
                        </text>
                        <text fg={colors.fg}>Use your existing Office 365 or Microsoft Storage.</text>
                        <box flexDirection="column" gap={0} marginTop={1}>
                            {[
                                { name: "HELP", description: "How does the handshake work?", value: "guided", key: "1" },
                                { name: "START HANDSHAKE", description: "Open browser to authorize", value: "direct", key: "2" }
                            ].map((opt, i) => (
                                <box
                                    key={i}
                                    onMouseOver={() => {
                                        _onFocusChange("body");
                                        setSelectedIndex(i);
                                    }}
                                    onMouseDown={() => confirmSelection(getOptions()[i]!)}
                                    paddingLeft={2}
                                    border
                                    borderStyle="single"
                                    borderColor={selectedIndex === i && focusArea === "body" ? colors.success : "transparent"}
                                >
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{String(selectedIndex === i && focusArea === "body" ? "▶ " : "  ")}</text>
                                    <Hotkey
                                        keyLabel={opt.key}
                                        label={opt.name}

                                        color={selectedIndex === i && focusArea === "body" ? colors.success : colors.primary}
                                    />
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {String(opt.description)}</text>
                                </box>
                            ))}
                        </box>
                        <box marginTop={1} padding={1} border borderStyle="single" borderColor={colors.dim}>
                            <text fg={colors.primary}>PRO: Fast corporate speed. CON: Scans for content.</text>
                        </box>
                    </box>
                )
            }

            {
                step === "onedrive_guide_1" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: OneDrive Guide: Handshake</text>
                        <box flexDirection="column">
                            <text fg={colors.fg}>1. A browser window will open on your system.</text>
                            <text fg={colors.fg}>2. Log in with your Microsoft account.</text>
                            <text fg={colors.fg}>3. Accept the permissions for 'rclone'.</text>
                        </box>
                        <box
                            marginTop={1}
                            onMouseOver={() => _onFocusChange("body")}
                            onMouseDown={() => next()}
                            border
                            borderStyle="double"
                            borderColor={focusArea === "body" ? colors.success : colors.dim}
                            paddingLeft={2}
                            paddingRight={2}
                            alignItems="center"
                        >
                            <text fg={focusArea === "body" ? colors.success : colors.dim}>
                                {String(focusArea === "body" ? "▶ " : "  ")}
                            </text>
                            <Hotkey keyLabel="1" label="NEXT STEP" isFocused={focusArea === "body"} />
                        </box>
                    </box>
                )
            }

            {
                step === "onedrive_guide_2" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: OneDrive Guide: Success Process</text>
                        <box flexDirection="column">
                            <text fg={colors.fg}>1. After login, you'll see a 'Success' message in browser.</text>
                            <text fg={colors.fg}>2. Portal will automatically receive the encrypted token.</text>
                            <text fg={colors.fg}>3. No need to copy/paste anything if it works!</text>
                        </box>
                        <box
                            marginTop={1}
                            onMouseOver={() => _onFocusChange("body")}
                            onMouseDown={() => next()}
                            border
                            borderStyle="double"
                            borderColor={focusArea === "body" ? colors.success : colors.dim}
                            paddingLeft={2}
                            paddingRight={2}
                            alignItems="center"
                        >
                            <text fg={focusArea === "body" ? colors.success : colors.dim}>
                                {String(focusArea === "body" ? "▶ " : "  ")}
                            </text>
                            <Hotkey keyLabel="1" label="START" isFocused={focusArea === "body"} />
                        </box>
                    </box>
                )
            }

            {
                step === "dropbox_intro" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>
                            Step {getCurrentStepNumber()}: {wizardContext === "source" ? "[ SOURCE ]" : "[ BACKUP ]"} Dropbox Setup
                        </text>
                        <text fg={colors.fg}>Reliable sync with excellent version history.</text>
                        <box flexDirection="column" gap={0} marginTop={1}>
                            {[
                                { name: "HELP", description: "How does the handshake work?", value: "guided", key: "1" },
                                { name: "START HANDSHAKE", description: "Open browser to authorize", value: "direct", key: "2" }
                            ].map((opt, i) => (
                                <box
                                    key={i}
                                    onMouseOver={() => {
                                        _onFocusChange("body");
                                        setSelectedIndex(i);
                                    }}
                                    onMouseDown={() => confirmSelection(getOptions()[i]!)}
                                    paddingLeft={2}
                                    border
                                    borderStyle="single"
                                    borderColor={selectedIndex === i ? colors.success : "transparent"}
                                >
                                    <text fg={selectedIndex === i ? colors.primary : colors.dim}>{String(selectedIndex === i ? "▶ " : "  ")}</text>
                                    <Hotkey
                                        keyLabel={opt.key}
                                        label={opt.name}

                                        color={selectedIndex === i ? colors.success : colors.primary}
                                    />
                                    <text fg={selectedIndex === i ? colors.fg : colors.dim}> - {String(opt.description)}</text>
                                </box>
                            ))}
                        </box>
                        <box marginTop={1} padding={1} border borderStyle="single" borderColor={colors.dim}>
                            <text fg={colors.primary}>PRO: Very reliable. CON: Expensive per GB.</text>
                        </box>
                    </box>
                )
            }

            {
                step === "dropbox_guide_1" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: Dropbox Guide: Handshake</text>
                        <box flexDirection="column">
                            <text fg={colors.fg}>1. Portal will launch rclone authorize dropbox.</text>
                            <text fg={colors.fg}>2. Browser window pops up for authorization.</text>
                            <text fg={colors.fg}>3. Grant access to your Dropbox files.</text>
                        </box>
                        <box
                            marginTop={1}
                            onMouseOver={() => _onFocusChange("body")}
                            onMouseDown={() => next()}
                            border
                            borderStyle="double"
                            borderColor={focusArea === "body" ? colors.success : colors.dim}
                            paddingLeft={2}
                            paddingRight={2}
                            alignItems="center"
                        >
                            <text fg={focusArea === "body" ? colors.success : colors.dim}>
                                {String(focusArea === "body" ? "▶ " : "  ")}
                            </text>
                            <Hotkey keyLabel="1" label="NEXT STEP" isFocused={focusArea === "body"} />
                        </box>
                    </box>
                )
            }

            {
                step === "dropbox_guide_2" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: Dropbox Guide: Success</text>
                        <box flexDirection="column">
                            <text fg={colors.fg}>Wait for the browser to finish its redirect.</text>
                            <text fg={colors.fg}>The token will automatically flow back to Portal.</text>
                        </box>
                        <box
                            marginTop={1}
                            onMouseOver={() => _onFocusChange("body")}
                            onMouseDown={() => next()}
                            border
                            borderStyle="double"
                            borderColor={focusArea === "body" ? colors.success : colors.dim}
                            paddingLeft={2}
                            paddingRight={2}
                            alignItems="center"
                        >
                            <text fg={focusArea === "body" ? colors.success : colors.dim}>
                                {String(focusArea === "body" ? "▶ " : "  ")}
                            </text>
                            <Hotkey keyLabel="1" label="START" isFocused={focusArea === "body"} />
                        </box>
                    </box>
                )
            }

            {
                step === "mega_intro" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>
                            Step {getCurrentStepNumber()}: {wizardContext === "source" ? "[ SOURCE ]" : "[ BACKUP ]"} Mega.nz Setup
                        </text>
                        <text fg={colors.fg}>Zero-knowledge encryption with generous free tier.</text>
                        <box flexDirection="column" gap={0} marginTop={1}>
                            {[
                                { name: "2FA GUIDE", description: "Does it work with 2FA?", value: "guided", key: "1" },
                                { name: "LOGIN", description: "Enter Email and Password", value: "direct", key: "2" }
                            ].map((opt, i) => (
                                <box
                                    key={i}
                                    onMouseOver={() => {
                                        _onFocusChange("body");
                                        setSelectedIndex(i);
                                    }}
                                    onMouseDown={() => confirmSelection(getOptions()[i]!)}
                                    paddingLeft={2}
                                    border
                                    borderStyle="single"
                                    borderColor={selectedIndex === i && focusArea === "body" ? colors.success : "transparent"}
                                >
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{String(selectedIndex === i && focusArea === "body" ? "▶ " : "  ")}</text>
                                    <Hotkey
                                        keyLabel={opt.key}
                                        label={opt.name}

                                        color={selectedIndex === i && focusArea === "body" ? colors.success : colors.primary}
                                    />
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {String(opt.description)}</text>
                                </box>
                            ))}
                        </box>
                        <box marginTop={1} padding={1} border borderStyle="single" borderColor={colors.dim}>
                            <text fg={colors.primary}>PRO: 20GB Free, Encrypted. CON: Bandwidth limits on free plans.</text>
                            {selectedIndex === 0 && <text fg={colors.success} marginTop={1}>NOTE: If you use 2FA, you must disable it temporarily or use an App Password.</text>}
                        </box>
                    </box>
                )
            }

            {
                step === "mega_guide_1" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: Mega Guide: Authentication</text>
                        <box flexDirection="column">
                            <text fg={colors.fg}>1. Use your Mega.nz login email and password.</text>
                            <text fg={colors.fg}>2. Ensure 2FA is handled if enabled.</text>
                        </box>
                        <box
                            marginTop={1}
                            onMouseOver={() => _onFocusChange("body")}
                            onMouseDown={() => next()}
                            border
                            borderStyle="double"
                            borderColor={focusArea === "body" ? colors.success : colors.dim}
                            paddingLeft={2}
                            paddingRight={2}
                            alignItems="center"
                        >
                            <text fg={focusArea === "body" ? colors.success : colors.dim}>
                                {String(focusArea === "body" ? "▶ " : "  ")}
                            </text>
                            <Hotkey keyLabel="1" label="CONTINUE" isFocused={focusArea === "body"} />
                        </box>
                    </box>
                )
            }

            {
                step === "r2_intro" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>
                            Step {getCurrentStepNumber()}: {wizardContext === "source" ? "[ SOURCE ]" : "[ BACKUP ]"} Cloudflare R2 Setup
                        </text>
                        <text fg={colors.fg}>S3-compatible storage with zero egress fees.</text>
                        <box flexDirection="column" gap={0} marginTop={1}>
                            {[
                                { name: "API TOKEN GUIDE", description: "Where do I get R2 keys?", value: "guided", key: "1" },
                                { name: "ENTER KEYS", description: "I have Access Key and Secret", value: "direct", key: "2" }
                            ].map((opt, i) => (
                                <box
                                    key={i}
                                    onMouseOver={() => {
                                        _onFocusChange("body");
                                        setSelectedIndex(i);
                                    }}
                                    onMouseDown={() => confirmSelection(getOptions()[i]!)}
                                    paddingLeft={2}
                                    border
                                    borderStyle="single"
                                    borderColor={selectedIndex === i ? colors.success : "transparent"}
                                >
                                    <text fg={selectedIndex === i ? colors.primary : colors.dim}>{String(selectedIndex === i ? "▶ " : "  ")}</text>
                                    <Hotkey
                                        keyLabel={opt.key}
                                        label={opt.name}

                                        color={selectedIndex === i ? colors.success : colors.primary}
                                    />
                                    <text fg={selectedIndex === i ? colors.fg : colors.dim}> - {String(opt.description)}</text>
                                </box>
                            ))}
                        </box>
                        <box marginTop={1} padding={1} border borderStyle="single" borderColor={colors.dim}>
                            <text fg={colors.primary}>PRO: No bandwidth fees. CON: S3 complexity.</text>
                            {selectedIndex === 0 && <text fg={colors.success} marginTop={1}>GUIDE: Dash {"->"} R2 {"->"} Manage R2 API Tokens {"->"} Create Token (Admin Read/Write).</text>}
                        </box>
                    </box>
                )
            }

            {
                step === "r2_guide_1" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: R2 Guide: API Tokens</text>
                        <box flexDirection="column">
                            <text fg={colors.fg}>1. Go to Cloudflare Dashboard {"->"} R2.</text>
                            <text fg={colors.fg}>2. Click 'Manage R2 API Tokens'.</text>
                            <text fg={colors.fg}>3. Create a token with 'Object Read {"&"} Write' permissions.</text>
                        </box>
                        <box
                            marginTop={1}
                            onMouseOver={() => _onFocusChange("body")}
                            onMouseDown={() => next()}
                            border
                            borderStyle="double"
                            borderColor={focusArea === "body" ? colors.success : colors.dim}
                            paddingLeft={2}
                            paddingRight={2}
                            alignItems="center"
                        >
                            <text fg={focusArea === "body" ? colors.success : colors.dim}>
                                {String(focusArea === "body" ? "▶ " : "  ")}
                            </text>
                            <Hotkey keyLabel="1" label="NEXT STEP" isFocused={focusArea === "body"} />
                        </box>
                    </box>
                )
            }

            {
                step === "r2_guide_2" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.primary}>R2 Guide: The Endpoint</text>
                        <box flexDirection="column">
                            <text fg={colors.fg}>1. Find your 'Account ID' on the R2 homepage.</text>
                            <text fg={colors.fg}>2. Copy the Access Key ID and Secret Access Key.</text>
                            <text fg={colors.fg}>3. Endpoint: https://{"<"}$ACCOUNT_ID{">"}.r2.cloudflarestorage.com</text>
                        </box>
                        <box
                            marginTop={1} paddingLeft={2} border borderStyle="single" borderColor={colors.success}
                            onMouseOver={() => _onFocusChange("body")}
                            onMouseDown={() => next()}
                        >
                            <text fg={colors.primary}>▶ </text>
                            <Hotkey keyLabel="1" label="DONE" color={colors.success} />
                            <text fg={colors.fg}> - I have ID, Key, and Endpoint</text>
                        </box>
                    </box>
                )
            }

            {
                step === "gdrive_guide_1" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: Guide Part 1 (The Google Project)</text>
                        <box flexDirection="column">
                            <text fg={colors.fg}>1. Open the GCP Console at https://console.cloud.google.com/</text>
                            <text fg={colors.fg}>2. Click "Select a Project" -{">"} "New Project"</text>
                            <text fg={colors.fg}>3. Name it: "Schematic Sync Portal"</text>
                        </box>
                        <box
                            marginTop={1}
                            onMouseOver={() => _onFocusChange("body")}
                            onMouseDown={() => confirmSelection(getOptions()[0]!)}
                            border
                            borderStyle="double"
                            borderColor={focusArea === "body" ? colors.success : colors.dim}
                            paddingLeft={2}
                            paddingRight={2}
                            alignItems="center"
                        >
                            <text fg={focusArea === "body" ? colors.success : colors.dim}>
                                {String(focusArea === "body" ? "▶ " : "  ")}
                            </text>
                            <Hotkey keyLabel="1" label="NEXT STEP" isFocused={focusArea === "body"} />
                        </box>
                    </box>
                )
            }

            {
                step === "gdrive_guide_2" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: Guide Part 2 (Activating Drive)</text>
                        <box flexDirection="column">
                            <text fg={colors.fg}>1. Search for "Google Drive API" in the top bar.</text>
                            <text fg={colors.fg}>2. Click the API and hit ENABLE.</text>
                        </box>
                        <box
                            marginTop={1}
                            onMouseOver={() => _onFocusChange("body")}
                            onMouseDown={() => next()}
                            border
                            borderStyle="double"
                            borderColor={focusArea === "body" ? colors.success : colors.dim}
                            paddingLeft={2}
                            paddingRight={2}
                            alignItems="center"
                        >
                            <text fg={focusArea === "body" ? colors.success : colors.dim}>
                                {String(focusArea === "body" ? "▶ " : "  ")}
                            </text>
                            <Hotkey keyLabel="1" label="NEXT STEP" isFocused={focusArea === "body"} />
                        </box>
                    </box>
                )
            }

            {
                step === "gdrive_guide_3" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: Guide Part 3 (Identity {"&"} Scopes)</text>
                        <box flexDirection="column">
                            <text fg={colors.fg}>1. Go to APIs {"&"} Services -{">"} OAuth consent screen.</text>
                            <text fg={colors.fg}>2. Choose External -{">"} Create.</text>
                            <text fg={colors.fg}>3. Add your own email under Test Users.</text>
                        </box>
                        <box
                            marginTop={1}
                            onMouseOver={() => _onFocusChange("body")}
                            onMouseDown={() => next()}
                            border
                            borderStyle="double"
                            borderColor={focusArea === "body" ? colors.success : colors.dim}
                            paddingLeft={2}
                            paddingRight={2}
                            alignItems="center"
                        >
                            <text fg={focusArea === "body" ? colors.success : colors.dim}>
                                {String(focusArea === "body" ? "▶ " : "  ")}
                            </text>
                            <Hotkey keyLabel="1" label="NEXT STEP" isFocused={focusArea === "body"} />
                        </box>
                    </box>
                )
            }

            {
                step === "gdrive_guide_4" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step {getCurrentStepNumber()}: Guide Part 4 (Generating Keys)</text>
                        <box flexDirection="column">
                            <text fg={colors.fg}>1. Go to Credentials -{">"} Create Credentials.</text>
                            <text fg={colors.fg}>2. Select OAuth client ID.</text>
                            <text fg={colors.fg}>3. Application Type: Desktop app.</text>
                        </box>
                        <box
                            marginTop={1}
                            onMouseOver={() => _onFocusChange("body")}
                            onMouseDown={() => next()}
                            border
                            borderStyle="double"
                            borderColor={focusArea === "body" ? colors.success : colors.dim}
                            paddingLeft={2}
                            paddingRight={2}
                            alignItems="center"
                        >
                            <text fg={focusArea === "body" ? colors.success : colors.dim}>
                                {String(focusArea === "body" ? "▶ " : "  ")}
                            </text>
                            <Hotkey keyLabel="1" label="DONE" isFocused={focusArea === "body"} />
                        </box>
                    </box>
                )
            }


            {
                step === "deploy" && (
                    <box flexDirection="column" gap={1} height={7}>
                        <box flexDirection="row" gap={1}>
                            <text fg={colors.fg}>💾</text>
                            <text attributes={TextAttributes.BOLD} fg={colors.fg}>Finalize and Save Configuration?</text>
                        </box>
                        <box flexDirection="column" gap={0} marginTop={1}>
                            {[
                                { name: "SAVE & EXIT", description: "Apply all changes", value: true, key: "1" },
                                { name: "DISCARD", description: "Exit without saving", value: false, key: "2" }
                            ].map((opt, i) => (
                                <box
                                    key={i}
                                    onMouseOver={() => {
                                        _onFocusChange("body");
                                        setSelectedIndex(i);
                                    }}
                                    onMouseDown={() => {
                                        if (opt.value) onComplete(config);
                                        else onCancel();
                                    }}
                                    flexDirection="row"
                                    paddingLeft={selectedIndex === i && focusArea === "body" ? 1 : 0}
                                >
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{String(selectedIndex === i && focusArea === "body" ? "▶ " : "  ")}</text>
                                    <Hotkey
                                        keyLabel={opt.key}
                                        label={opt.name}
                                        isFocused={selectedIndex === i && focusArea === "body"}
                                    />
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {String(opt.description)}</text>
                                </box>
                            ))}
                        </box>
                    </box>
                )
            }
            {
                config.debug_mode ? <box marginTop={1} border borderStyle="single" borderColor={colors.border} padding={1} flexDirection="row">
                    <text attributes={TextAttributes.DIM} fg={colors.dim}>PROGRESS: </text>
                    <text attributes={TextAttributes.DIM} fg={colors.dim}>{String(step).toUpperCase()}</text>
                </box> : null
            }
        </box>
    );
});
Wizard.displayName = "Wizard";
