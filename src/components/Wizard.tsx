import { useKeyboard } from "@opentui/react";
import React, { useState, useCallback, useRef, useEffect } from "react";
import type { PortalConfig, PortalProvider } from "../lib/config.ts";
import { getCopypartyCookie } from "../lib/auth.ts";
import { Hotkey } from "./Hotkey";
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
    val?: string | number | boolean | PortalProvider; // mixed usage in code
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
    | "dest_cloud_select" // Backup Path
    | "security" // Malware Shield (Only if Upsync is on)

    // Cloud Provider Specifics (Shared for Source/Dest - we'll reuse UI but need context)
    // NOTE: To avoid complexity, we can prefix them, or reuse them and depend on `context` state.
    // For safety, let's prefix or use 'generic' steps if possible, but existing code is heavy prefix.
    // Let's stick to existing "intro/id/key" patterns but route dynamically.
    | "gdrive_intro" | "gdrive_guide_1" | "gdrive_guide_2" | "gdrive_guide_3" | "gdrive_guide_4" | "gdrive_id" | "gdrive_secret" | "gdrive_auth"
    | "b2_intro" | "b2_id" | "b2_key"
    | "sftp_intro" | "sftp_host" | "sftp_user" | "sftp_pass"
    | "pcloud_intro" | "pcloud_user" | "pcloud_pass"
    | "onedrive_intro" | "onedrive_auth"
    | "dropbox_intro" | "dropbox_auth"
    | "mega_intro" | "mega_user" | "mega_pass"
    | "r2_intro" | "r2_id" | "r2_key" | "r2_endpoint"
    | "cloud_setup_choice"
    | "cloud_direct_entry"
    | "edit_menu"
    | "deploy";

export function Wizard({ onComplete, onUpdate, onCancel, onQuit: _onQuit, initialConfig, mode, focusArea, onFocusChange: _onFocusChange, tabTransition, backSignal }: WizardProps) {
    const { colors } = useTheme();
    const isBootstrapped = isSystemBootstrapped();
    const savedShortcutState = initialConfig.desktop_shortcut;

    // Helper to determine if we are currently configuring Source or Destination
    // This allows us to reuse the cloud provider steps for both!
    // We'll store a "wizardContext" state: "configuring_source" | "configuring_dest"
    const [wizardContext, setWizardContext] = useState<"source" | "dest">("source");

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
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [copyparty_config_index, set_copyparty_config_index] = useState(0); // 0:URL, 1:User, 2:Pass, 3:Method, 4:Connect
    const [direct_entry_index, set_direct_entry_index] = useState(0);
    const [isAuthLoading, setIsAuthLoading] = useState(false);
    const [authStatus, setAuthStatus] = useState<string | null>(null);
    const pendingSourceProviderRef = useRef<PortalProvider>(initialConfig.source_provider);
    const pendingBackupProviderRef = useRef<PortalProvider>(initialConfig.backup_provider);
    const [cloudExperience, setCloudExperience] = useState<"guided" | "direct">("guided");

    // [SEC] Local Credential Refs - Memory-only, never saved to config.json 🧠🛡️🦅
    const urlRef = useRef("");
    const userRef = useRef("");
    const passRef = useRef("");
    const clientIdRef = useRef("");
    const clientSecretRef = useRef("");
    const b2IdRef = useRef("");
    const b2KeyRef = useRef("");
    const sftpHostRef = useRef("");
    const sftpUserRef = useRef("");
    const sftpPassRef = useRef("");
    const pcloudUserRef = useRef("");
    const pcloudPassRef = useRef("");
    const megaUserRef = useRef("");
    const megaPassRef = useRef("");
    const r2IdRef = useRef("");
    const r2KeyRef = useRef("");
    const r2EndpointRef = useRef("");
    const [wizardInputs, setWizardInputs] = useState({
        url: "",
        user: "",
        pass: "",
        clientId: "",
        clientSecret: "",
        b2Id: "",
        b2Key: "",
        sftpHost: "",
        sftpUser: "",
        sftpPass: "",
        pcloudUser: "",
        pcloudPass: "",
        megaUser: "",
        megaPass: "",
        r2Id: "",
        r2Key: "",
        r2Endpoint: "",
        oauthToken: ""
    });

    // Sync state with refs for zero-lag backend access
    const updateInput = useCallback((key: keyof typeof wizardInputs, val: string, ref: React.MutableRefObject<string>) => {
        Logger.debug("UI", `[WIZARD] Input change: ${key}=${key === "pass" ? "********" : val}`);
        setWizardInputs(prev => ({ ...prev, [key]: val }));
        ref.current = val;
    }, []);

    const oauthTokenRef = useRef("");
    const [history, setHistory] = useState<Step[]>([]);
    const stepStartTime = useRef(Date.now());

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
        sftpHostRef.current = "";
        sftpUserRef.current = "";
        sftpPassRef.current = "";
        pcloudUserRef.current = "";
        pcloudPassRef.current = "";
        megaUserRef.current = "";
        megaPassRef.current = "";
        r2IdRef.current = "";
        r2KeyRef.current = "";
        r2EndpointRef.current = "";
        oauthTokenRef.current = "";
        setWizardInputs({
            url: "",
            user: "",
            pass: "",
            clientId: "",
            clientSecret: "",
            b2Id: "",
            b2Key: "",
            sftpHost: "",
            sftpUser: "",
            sftpPass: "",
            pcloudUser: "",
            pcloudPass: "",
            megaUser: "",
            megaPass: "",
            r2Id: "",
            r2Key: "",
            r2Endpoint: "",
            oauthToken: ""
        });
        setAuthStatus(null);
    }, []);

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
        };
    }, []);

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
                        nextStep = "cloud_setup_choice";
                    }
                    break;

                case "cloud_setup_choice":
                    if (cloudExperience === "direct") {
                        nextStep = "cloud_direct_entry";
                    } else {
                        const provider = (wizardContext === "source" ? currentSource : currentBackup);
                        if (provider === "gdrive") nextStep = "gdrive_intro";
                        else if (provider === "b2") nextStep = "b2_intro";
                        else if (provider === "sftp") nextStep = "sftp_intro";
                        else if (provider === "pcloud") nextStep = "pcloud_intro";
                        else if (provider === "onedrive") nextStep = "onedrive_intro";
                        else if (provider === "dropbox") nextStep = "dropbox_intro";
                        else if (provider === "mega") nextStep = "mega_intro";
                        else if (provider === "r2") nextStep = "r2_intro";
                        else nextStep = (isMenuMode ? "edit_menu" : (wizardContext === "source" ? "dir" : "security"));
                    }
                    break;

                case "cloud_direct_entry":
                    nextStep = (isMenuMode ? "edit_menu" : (wizardContext === "source" ? "dir" : "security"));
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
                    nextStep = "cloud_setup_choice";
                    break;

                case "security": nextStep = (isMenuMode ? "edit_menu" : "deploy"); break;

                case "gdrive_auth": nextStep = (isMenuMode ? "edit_menu" : (wizardContext === "source" ? "dir" : "security")); break;
                case "b2_key": nextStep = (isMenuMode ? "edit_menu" : (wizardContext === "source" ? "dir" : "security")); break;
                case "sftp_pass": nextStep = (isMenuMode ? "edit_menu" : (wizardContext === "source" ? "dir" : "security")); break;
                case "pcloud_pass": nextStep = (isMenuMode ? "edit_menu" : (wizardContext === "source" ? "dir" : "security")); break;
                case "onedrive_auth": nextStep = (isMenuMode ? "edit_menu" : (wizardContext === "source" ? "dir" : "security")); break;
                case "dropbox_auth": nextStep = (isMenuMode ? "edit_menu" : (wizardContext === "source" ? "dir" : "security")); break;
                case "mega_pass": nextStep = (isMenuMode ? "edit_menu" : (wizardContext === "source" ? "dir" : "security")); break;
                case "r2_endpoint": nextStep = (isMenuMode ? "edit_menu" : (wizardContext === "source" ? "dir" : "security")); break;

                // Intermediates
                case "gdrive_intro": nextStep = "gdrive_id"; break;
                case "gdrive_guide_1": nextStep = "gdrive_guide_2"; break;
                case "gdrive_guide_2": nextStep = "gdrive_guide_3"; break;
                case "gdrive_guide_3": nextStep = "gdrive_guide_4"; break;
                case "gdrive_guide_4": nextStep = "gdrive_id"; break;
                case "gdrive_id": nextStep = "gdrive_secret"; break;
                case "gdrive_secret": nextStep = "gdrive_auth"; break;
                case "b2_intro": nextStep = "b2_id"; break;
                case "b2_id": nextStep = "b2_key"; break;
                case "sftp_intro": nextStep = "sftp_host"; break;
                case "sftp_host": nextStep = "sftp_user"; break;
                case "sftp_user": nextStep = "sftp_pass"; break;
                case "pcloud_intro": nextStep = "pcloud_user"; break;
                case "pcloud_user": nextStep = "pcloud_pass"; break;
                case "onedrive_intro": nextStep = "onedrive_auth"; break;
                case "dropbox_intro": nextStep = "dropbox_auth"; break;
                case "mega_intro": nextStep = "mega_user"; break;
                case "mega_user": nextStep = "mega_pass"; break;
                case "r2_intro": nextStep = "r2_id"; break;
                case "r2_id": nextStep = "r2_key"; break;
                case "r2_key": nextStep = "r2_endpoint"; break;

                case "deploy": onComplete(c); break;
            }
            stepStartTime.current = Date.now();
            return nextStep;
        });
    }, [onComplete]);

    const getOptions = useCallback(() => {
        if (step === "shortcut") {
            return isShortcutMissing ? [
                { val: 1, type: "bootstrap" },
                { val: 2, type: "shortcut" },
                { val: 0, type: "skip" }
            ] : [
                { val: 1, type: "desktop_shortcut" },
                { val: 0, type: "desktop_shortcut" }
            ];
        }

        if (step === "edit_menu") {
            return [
                { val: "shortcut", type: "jump" },
                { val: "source_choice", type: "jump" },
                { val: "dir", type: "jump" },
                { val: "mirror", type: "jump" },
                { val: "upsync_ask", type: "jump" },
                { val: "security", type: "jump" },
                { val: "deploy", type: "jump" }
            ];
        }

        if (step === "source_choice") return [
            { val: "copyparty", type: "source_select" },
            { val: "gdrive", type: "source_select" },
            { val: "b2", type: "source_select" },
            { val: "pcloud", type: "source_select" },
            { val: "sftp", type: "source_select" },
            { val: "onedrive", type: "source_select" },
            { val: "dropbox", type: "source_select" },
            { val: "mega", type: "source_select" },
            { val: "r2", type: "source_select" }
        ];


        if (step === "mirror") return [{ val: false, type: "mirror" }, { val: true, type: "mirror" }];

        if (step === "dir") return [
            { val: "confirm", type: "dir_confirm" }
        ];

        if (step === "upsync_ask") return [
            { val: "download_only", type: "sync_mode" },
            { val: "sync_backup", type: "sync_mode" }
        ];

        if (step === "security") {
            return [
                { val: "isolate", type: "sec_policy" },
                { val: "purge", type: "sec_policy" },
                { val: false, type: "sec_toggle" }
            ];
        }


        if (step === "dest_cloud_select") return [
            { val: "gdrive", type: "backup_provider" },
            { val: "b2", type: "backup_provider" },
            { val: "pcloud", type: "backup_provider" },
            { val: "sftp", type: "backup_provider" },
            { val: "onedrive", type: "backup_provider" },
            { val: "dropbox", type: "backup_provider" },
            { val: "mega", type: "backup_provider" },
            { val: "r2", type: "backup_provider" }
        ];

        if (step === "cloud_setup_choice") return [
            { val: "guided", type: "exp_choice" },
            { val: "direct", type: "exp_choice" }
        ];

        if (step === "gdrive_intro") return [{ val: "guided", type: "gdrive_path" }, { val: "direct", type: "gdrive_path" }];
        if (step === "b2_intro") return [{ val: "guided", type: "intro_path" }, { val: "direct", type: "intro_path" }];
        if (step === "sftp_intro") return [{ val: "guided", type: "intro_path" }, { val: "direct", type: "intro_path" }];
        if (step === "pcloud_intro") return [{ val: "guided", type: "intro_path" }, { val: "direct", type: "intro_path" }];
        if (step === "onedrive_intro") return [{ val: "guided", type: "intro_path" }, { val: "direct", type: "intro_path" }];
        if (step === "dropbox_intro") return [{ val: "guided", type: "intro_path" }, { val: "direct", type: "intro_path" }];
        if (step === "mega_intro") return [{ val: "guided", type: "intro_path" }, { val: "direct", type: "intro_path" }];
        if (step === "r2_intro") return [{ val: "guided", type: "intro_path" }, { val: "direct", type: "intro_path" }];

        if (step === "gdrive_guide_1") return [{ val: true, type: "guide_next" }];
        if (step === "gdrive_guide_2") return [{ val: true, type: "guide_next" }];
        if (step === "gdrive_guide_3") return [{ val: true, type: "guide_next" }];
        if (step === "gdrive_guide_4") return [{ val: true, type: "guide_next" }];
        if (step === "deploy") return [{ val: true, type: "deploy" }, { val: false, type: "deploy" }];
        return [];
    }, [step, isShortcutMissing]);

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
        setIsAuthLoading(true);
        setAuthStatus("🔄 Launching Google Handshake...");

        try {
            const token = await authorizeRemote("drive");
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
            const error = err as Error;
            setAuthStatus(`❌ Error: ${error.message}`);
        } finally {
            setIsAuthLoading(false);
        }
    }, [wizardContext, next, updateConfig]);

    const startGenericAuth = useCallback(async (provider: string) => {
        setIsAuthLoading(true);
        setAuthStatus(`🚀 Launching ${provider.toUpperCase()} Authorization...`);

        try {
            const token = await authorizeRemote(provider);
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
            const error = err as Error;
            setAuthStatus(`❌ Error: ${error.message}`);
        } finally {
            setIsAuthLoading(false);
        }
    }, [wizardContext, next, updateConfig]);

    const confirmSelection = useCallback((opt: WizardOption) => {
        if (!opt) return;

        if (opt.type === "deploy") {
            if (opt.val) onComplete(config);
            else onCancel();
            return;
        }

        if (opt.type === "exp_choice") {
            setCloudExperience(opt.val as "guided" | "direct");
            next();
            return;
        }

        if (opt.type === "gdrive_path") {
            if (opt.val === "guided") setStep("gdrive_guide_1");
            else next();
            return;
        }

        if (opt.type === "intro_path") {
            next();
            return;
        }

        if (opt.type === "guide_next") {
            next();
            return;
        }

        if (opt.type === "desktop_shortcut") {
            if (opt.val === 1) {
                bootstrapSystem(join(process.cwd(), "src/index.tsx"));
            }
            updateConfig(prev => ({ ...prev, desktop_shortcut: opt.val as number }));
            next();
            return;
        }

        if (opt.type === "jump") {
            setIsMenuMode(true);
            setStep(opt.val as Step);
            return;
        }

        if (opt.type === "dir_confirm") {
            if (config.local_dir && config.local_dir !== "" && config.local_dir !== "none") {
                next();
            }
            return;
        }

        if (opt.type === "sec_policy") {
            updateConfig(prev => ({ ...prev, enable_malware_shield: true, malware_policy: opt.val as "purge" | "isolate" }));
            next();
        } else if (opt.type === "sec_toggle") {
            updateConfig(prev => ({ ...prev, enable_malware_shield: opt.val as boolean }));
            next();
        } else if (opt.type === "source_select" || opt.type === "source_provider") {
            pendingSourceProviderRef.current = opt.val as PortalProvider;
            next();
        } else if (opt.type === "backup_provider") {
            pendingBackupProviderRef.current = opt.val as PortalProvider;
            next();
        } else if (opt.type === "sync_mode") {
            const newVal = opt.val === "sync_backup";
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
            if (field) updateConfig(prev => ({ ...prev, [field]: opt.val }));
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
                let maxIdx = (provider === "sftp" || provider === "r2") ? 3 : 2;
                if (e.name === "down") set_direct_entry_index(prev => Math.min(maxIdx, prev + 1));
                else if (e.name === "up") set_direct_entry_index(prev => Math.max(0, prev - 1));

                if (e.name === "return" && direct_entry_index === maxIdx) {
                    if (!isAuthLoading) {
                        if (provider === "gdrive" || provider === "onedrive" || provider === "dropbox") handleAuth();
                        else next();
                    }
                    return;
                }
            }

            if (e.name === "return") {
                if (step === "copyparty_config") {
                    if (copyparty_config_index === 4) handleAuth();
                    else set_copyparty_config_index(prev => Math.min(4, prev + 1));
                    return;
                }
            }
        }

        const selectableSteps: Step[] = ["shortcut", "source_choice", "mirror", "upsync_ask", "security", "dest_cloud_select", "edit_menu", "gdrive_intro", "gdrive_guide_1", "gdrive_guide_2", "gdrive_guide_3", "gdrive_guide_4", "b2_intro", "sftp_intro", "pcloud_intro", "onedrive_intro", "dropbox_intro", "mega_intro", "r2_intro", "deploy", "cloud_setup_choice"];
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
                        ].map((opt, i) => (
                            <box
                                key={i}
                                onMouseOver={() => {
                                    _onFocusChange("body");
                                    setSelectedIndex(i);
                                }}
                                onMouseDown={() => confirmSelection({ type: "jump", val: opt.value })}
                                paddingLeft={2}
                                border
                                borderStyle="single"
                                borderColor={selectedIndex === i && focusArea === "body" ? colors.success : colors.dim + "33"}
                            >
                                <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{selectedIndex === i && focusArea === "body" ? "▶ " : "  "}</text>
                                <Hotkey
                                    keyLabel={opt.key}
                                    label={opt.name}
                                    isFocused={selectedIndex === i && focusArea === "body"}
                                />
                                <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {opt.description}</text>
                            </box>
                        ))}
                    </box>
                </box>
            )}

            {step === "shortcut" && (
                <box flexDirection="column" gap={1}>
                    <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step 1: System Integration</text>
                    <text fg={isShortcutMissing ? colors.danger : colors.fg}>
                        {isShortcutMissing ? "⚠️  Shortcut missing! Did you move it standard location?" : "Add Portal to Desktop Apps?"}
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
                                borderColor={selectedIndex === i && focusArea === "body" ? colors.success : colors.dim + "33"}
                            >
                                <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{selectedIndex === i && focusArea === "body" ? "▶ " : "  "}</text>
                                <Hotkey
                                    keyLabel={opt.key}
                                    label={opt.name}
                                    isFocused={selectedIndex === i && focusArea === "body"}
                                />
                                <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {opt.description}</text>
                            </box>
                        ))}
                    </box>
                </box>
            )}

            {step === "copyparty_config" && (
                <box flexDirection="column" gap={1}>
                    <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step 3: CopyParty Source Configuration</text>

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
                                { name: "WebDAV", val: "webdav" },
                                { name: "HTTP", val: "http" }
                            ].map((m, i) => {
                                const isSelected = (config.copyparty_method || "webdav") === m.val;
                                const isFocused = copyparty_config_index === 3 && selectedIndex === i;
                                return (
                                    <box
                                        key={i}
                                        onMouseOver={() => {
                                            setSelectedIndex(i);
                                            set_copyparty_config_index(3);
                                        }}
                                        onMouseDown={() => {
                                            updateConfig(prev => ({ ...prev, copyparty_method: m.val as "webdav" | "http" }));
                                        }}
                                        border
                                        borderStyle="single"
                                        borderColor={isSelected ? colors.success : (isFocused ? colors.primary : "transparent")}
                                        paddingLeft={1}
                                        paddingRight={1}
                                    >
                                        <text fg={isSelected ? colors.success : colors.fg}>{m.name}</text>
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
                            {isAuthLoading ? "🔄 CONNECTING..." : "[ VERIFY & CONNECT ]"}
                        </text>
                    </box>

                    {authStatus ? (
                        <box marginTop={1}>
                            <text fg={authStatus.includes("✅") ? colors.success : colors.danger}>{authStatus}</text>
                        </box>
                    ) : null}
                </box>
            )}

            {step === "dir" && (
                <box flexDirection="column" gap={1} onMouseDown={() => _onFocusChange("body")}>
                    <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step 4: Storage Path</text>
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

            {step === "mirror" && (
                <box flexDirection="column" gap={1}>
                    <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step 5: Sync Strategy</text>
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
                                borderColor={selectedIndex === i && focusArea === "body" ? colors.success : colors.dim + "33"}
                                flexDirection="row"
                                alignItems="center"
                                gap={1}
                            >
                                <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{selectedIndex === i && focusArea === "body" ? "▶ " : "  "}</text>
                                <Hotkey
                                    keyLabel={opt.key}
                                    label={opt.name}
                                    isFocused={selectedIndex === i && focusArea === "body"}
                                />
                                <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {opt.description}</text>
                            </box>
                        ))}
                    </box>
                </box>
            )}

            {step === "cloud_direct_entry" && (
                <box flexDirection="column" gap={1}>
                    <text attributes={TextAttributes.BOLD} fg={colors.fg}>Direct Configuration</text>
                    <text fg={colors.fg}>Enter all credentials for {(wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current).toUpperCase()}:</text>

                    <box flexDirection="column" gap={0} marginTop={1}>
                        {(() => {
                            const provider = wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current;
                            const fields: { label: string, ref: React.MutableRefObject<string>, icon: string }[] = [];

                            if (provider === "gdrive") {
                                fields.push({ label: "Client ID", ref: userRef, icon: "🆔" });
                                fields.push({ label: "Client Secret", ref: passRef, icon: "🔑" });
                            } else if (provider === "b2") {
                                fields.push({ label: "Key ID", ref: userRef, icon: "🆔" });
                                fields.push({ label: "Application Key", ref: passRef, icon: "🔑" });
                            } else if (provider === "sftp") {
                                fields.push({ label: "Host", ref: urlRef, icon: "🌐" });
                                fields.push({ label: "User", ref: userRef, icon: "👤" });
                                fields.push({ label: "Pass", ref: passRef, icon: "🔑" });
                            } else if (provider === "r2") {
                                fields.push({ label: "Access Key ID", ref: userRef, icon: "🆔" });
                                fields.push({ label: "Secret Key", ref: passRef, icon: "🔑" });
                                fields.push({ label: "Endpoint", ref: urlRef, icon: "🌐" });
                            } else if (provider === "pcloud" || provider === "mega" || provider === "onedrive" || provider === "dropbox") {
                                fields.push({ label: "Username/ID", ref: userRef, icon: "👤" });
                                fields.push({ label: "Password/Secret", ref: passRef, icon: "🔑" });
                            }

                            return (
                                <>
                                    {fields.map((f, i) => (
                                        <box key={i} flexDirection="row" gap={1}
                                            border borderStyle="single"
                                            borderColor={direct_entry_index === i ? colors.primary : colors.dim + "33"}
                                            padding={1}
                                        >
                                            <text fg={colors.dim}>{f.icon}</text>
                                            <text width={15} fg={colors.fg}>{f.label}:</text>
                                            <input
                                                value={f.ref.current}
                                                onChange={(val) => { f.ref.current = val; onUpdate?.(configRef.current); }}
                                                focused={direct_entry_index === i && focusArea === "body"}
                                                width={40}
                                            />
                                        </box>
                                    ))}
                                    <box
                                        marginTop={1} padding={1} border borderStyle="double"
                                        borderColor={direct_entry_index === fields.length ? colors.success : colors.dim + "33"}
                                        onMouseDown={() => {
                                            if (provider === "gdrive" || provider === "onedrive" || provider === "dropbox") handleAuth();
                                            else next();
                                        }}
                                    >
                                        <box flexDirection="row" gap={1}>
                                            <text fg={direct_entry_index === fields.length ? colors.primary : colors.dim}>{direct_entry_index === fields.length ? "▶ " : "  "}</text>
                                            <Hotkey keyLabel="ENTER" label="CONNECT & SAVE" isFocused={direct_entry_index === fields.length && focusArea === "body"} />
                                        </box>
                                    </box>
                                </>
                            );
                        })()}
                    </box>
                </box>
            )}

            {step === "cloud_setup_choice" && (
                <box flexDirection="column" gap={1}>
                    <text attributes={TextAttributes.BOLD} fg={colors.fg}>Setup Experience</text>
                    <text fg={colors.fg}>Choose how you want to configure your cloud provider:</text>
                    <box flexDirection="column" gap={0} marginTop={1}>
                        {getOptions().map((opt, i) => {
                            const exp = opt.val === "guided"
                                ? { name: "Guided Walkthrough", desc: "Step-by-step assistant for beginners." }
                                : { name: "Direct Entry", desc: "One screen for all settings. (Fast)" };
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
                                    borderColor={selectedIndex === i && focusArea === "body" ? colors.success : colors.dim + "33"}
                                    flexDirection="column"
                                    padding={1}
                                >
                                    <box flexDirection="row" gap={1}>
                                        <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{selectedIndex === i && focusArea === "body" ? "▶ " : "  "}</text>
                                        <Hotkey
                                            keyLabel={(i + 1).toString()}
                                            label={exp.name}
                                            isFocused={selectedIndex === i && focusArea === "body"}
                                        />
                                    </box>
                                    <text fg={colors.dim} marginLeft={4}>{exp.desc}</text>
                                </box>
                            );
                        })}
                    </box>
                </box>
            )}

            {step === "source_choice" && (
                <box flexDirection="column" gap={1}>
                    <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step 2: Source Provider</text>
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
                            const p = providers[opt.val as string];
                            return (
                                <box
                                    key={i}
                                    onMouseOver={() => {
                                        _onFocusChange("body");
                                        setSelectedIndex(i);
                                    }}
                                    onMouseDown={() => {
                                        pendingSourceProviderRef.current = opt.val as PortalProvider;
                                        next();
                                    }}
                                    paddingLeft={2}
                                    border
                                    borderStyle="single"
                                    borderColor={selectedIndex === i && focusArea === "body" ? colors.success : colors.dim + "33"}
                                    flexDirection="row"
                                    alignItems="center"
                                    gap={1}
                                >
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{selectedIndex === i && focusArea === "body" ? "▶ " : "  "}</text>
                                    <text fg={colors.primary}>{p?.icon || "\ueac2"}</text>
                                    <Hotkey
                                        keyLabel={(i + 1).toString()}
                                        label={p?.name || (opt.val as string)}
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
                            Step 7: Backup Provider
                        </text>
                        <text fg={colors.fg}>☁️  Select your cloud storage provider:</text>
                        <box flexDirection="column" gap={0} marginTop={1}>
                            {(getOptions() as { val: PortalProvider, type: string }[]).map((opt, i) => {
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
                                const p = providers[opt.val];
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
                                        borderColor={selectedIndex === i && focusArea === "body" ? colors.success : colors.dim + "33"}
                                        flexDirection="row"
                                        alignItems="center"
                                        gap={1}
                                    >
                                        <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{selectedIndex === i && focusArea === "body" ? "▶ " : "  "}</text>
                                        <text fg={colors.primary}>{p?.icon || "\ueac2"}</text>
                                        <Hotkey
                                            keyLabel={(i + 1).toString()}
                                            label={p?.name || opt.val}
                                            isFocused={selectedIndex === i && focusArea === "body"}
                                        />
                                        {p?.desc && (
                                            <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {p.desc}</text>
                                        )}
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
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step 6: Cloud Backup (Optional)</text>
                        <text fg={colors.fg}>🚀 Do you want to enable Upsync (Backup)?</text>
                        <box flexDirection="column" gap={0} marginTop={1}>
                            {[
                                { name: "NO", description: "Download Only (Standard)", value: "download_only", key: "1", icon: "\ueac2" },
                                { name: "YES", description: "Enable Backup & Malware Shield", value: "sync_backup", key: "2", icon: "\ueac3" }
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
                                    borderColor={selectedIndex === i && focusArea === "body" ? colors.success : colors.dim + "33"}
                                    flexDirection="row"
                                    alignItems="center"
                                    gap={1}
                                >
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{selectedIndex === i && focusArea === "body" ? "▶ " : "  "}</text>
                                    <text fg={colors.primary}>{opt.icon}</text>
                                    <Hotkey keyLabel={opt.key} label={opt.name} color={selectedIndex === i && focusArea === "body" ? colors.success : colors.primary} />
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {opt.description}</text>
                                </box>
                            ))}
                        </box>
                    </box>
                )
            }

            {
                step === "security" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step 8: Malware Shield</text>
                        <text fg={colors.fg}>🛡️ Surgical Security Policy (How to handle risky tools):</text>
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
                                    borderColor={selectedIndex === i && focusArea === "body" ? colors.success : colors.dim + "33"}
                                >
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{selectedIndex === i && focusArea === "body" ? "▶ " : "  "}</text>
                                    <Hotkey
                                        keyLabel={opt.key}
                                        label={opt.name}

                                        color={selectedIndex === i && focusArea === "body" ? colors.success : colors.primary}
                                    />
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {opt.description}</text>
                                </box>
                            ))}
                        </box>
                    </box>
                )
            }



            {
                step === "gdrive_intro" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step 7: Cloud Setup (Google Drive)</text>
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
                                    borderColor={selectedIndex === i && focusArea === "body" ? colors.success : colors.dim + "33"}
                                >
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{selectedIndex === i && focusArea === "body" ? "▶ " : "  "}</text>
                                    <Hotkey
                                        keyLabel={opt.key}
                                        label={opt.name}

                                        color={selectedIndex === i && focusArea === "body" ? colors.success : colors.primary}
                                    />
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {opt.description}</text>
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
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step 8: Backblaze B2 Setup</text>
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
                                    borderColor={selectedIndex === i && focusArea === "body" ? colors.success : colors.dim + "33"}
                                >
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{selectedIndex === i && focusArea === "body" ? "▶ " : "  "}</text>
                                    <Hotkey
                                        keyLabel={opt.key}
                                        label={opt.name}

                                        color={selectedIndex === i && focusArea === "body" ? colors.success : colors.primary}
                                    />
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {opt.description}</text>
                                </box>
                            ))}
                        </box>
                        <box marginTop={1} padding={1} border borderStyle="single" borderColor={colors.dim}>
                            <text fg={colors.primary}>PRO: Cheapest reliable cloud ($6/TB). CON: No native image previews.</text>
                            {selectedIndex === 0 && <text fg={colors.success} marginTop={1}>GUIDE: Go to Backblaze.com -{">"} App Keys -{">"} Add a New Application Key.</text>}
                        </box>
                    </box>
                )
            }

            {
                step === "sftp_intro" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step 8: SFTP / Sovereign Setup</text>
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
                                    borderColor={selectedIndex === i && focusArea === "body" ? colors.success : colors.dim + "33"}
                                >
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{selectedIndex === i && focusArea === "body" ? "▶ " : "  "}</text>
                                    <Hotkey
                                        keyLabel={opt.key}
                                        label={opt.name}

                                        color={selectedIndex === i && focusArea === "body" ? colors.success : colors.primary}
                                    />
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {opt.description}</text>
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
                step === "pcloud_intro" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step 8: pCloud Setup</text>
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
                                    borderColor={selectedIndex === i && focusArea === "body" ? colors.success : colors.dim + "33"}
                                >
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{selectedIndex === i && focusArea === "body" ? "▶ " : "  "}</text>
                                    <Hotkey
                                        keyLabel={opt.key}
                                        label={opt.name}

                                        color={selectedIndex === i && focusArea === "body" ? colors.success : colors.primary}
                                    />
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {opt.description}</text>
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
                step === "onedrive_intro" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step 8: OneDrive Setup</text>
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
                                    borderColor={selectedIndex === i && focusArea === "body" ? colors.success : colors.dim + "33"}
                                >
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{selectedIndex === i && focusArea === "body" ? "▶ " : "  "}</text>
                                    <Hotkey
                                        keyLabel={opt.key}
                                        label={opt.name}

                                        color={selectedIndex === i && focusArea === "body" ? colors.success : colors.primary}
                                    />
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {opt.description}</text>
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
                step === "dropbox_intro" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step 8: Dropbox Setup</text>
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
                                    borderColor={selectedIndex === i ? colors.success : colors.dim + "33"}
                                >
                                    <text fg={selectedIndex === i ? colors.primary : colors.dim}>{selectedIndex === i ? "▶ " : "  "}</text>
                                    <Hotkey
                                        keyLabel={opt.key}
                                        label={opt.name}

                                        color={selectedIndex === i ? colors.success : colors.primary}
                                    />
                                    <text fg={selectedIndex === i ? colors.fg : colors.dim}> - {opt.description}</text>
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
                step === "mega_intro" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step 8: Mega.nz Setup</text>
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
                                    borderColor={selectedIndex === i && focusArea === "body" ? colors.success : colors.dim + "33"}
                                >
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{selectedIndex === i && focusArea === "body" ? "▶ " : "  "}</text>
                                    <Hotkey
                                        keyLabel={opt.key}
                                        label={opt.name}

                                        color={selectedIndex === i && focusArea === "body" ? colors.success : colors.primary}
                                    />
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {opt.description}</text>
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
                step === "r2_intro" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Step 8: Cloudflare R2 Setup</text>
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
                                    borderColor={selectedIndex === i ? colors.success : colors.dim + "33"}
                                >
                                    <text fg={selectedIndex === i ? colors.primary : colors.dim}>{selectedIndex === i ? "▶ " : "  "}</text>
                                    <Hotkey
                                        keyLabel={opt.key}
                                        label={opt.name}

                                        color={selectedIndex === i ? colors.success : colors.primary}
                                    />
                                    <text fg={selectedIndex === i ? colors.fg : colors.dim}> - {opt.description}</text>
                                </box>
                            ))}
                        </box>
                        <box marginTop={1} padding={1} border borderStyle="single" borderColor={colors.dim}>
                            <text fg={colors.primary}>PRO: No bandwidth fees. CON: S3 complexity.</text>
                            {selectedIndex === 0 && <text fg={colors.success} marginTop={1}>GUIDE: Dash -{">"} R2 -{">"} Manage R2 API Tokens -{">"} Create Token (Admin Read/Write).</text>}
                        </box>
                    </box>
                )
            }

            {
                step === "gdrive_guide_1" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.primary}>Guide Part 1: The Google Project</text>
                        <box flexDirection="column">
                            <text fg={colors.fg}>1. Open the GCP Console at https://console.cloud.google.com/</text>
                            <text fg={colors.fg}>2. Click "Select a Project" -{">"} "New Project"</text>
                            <text fg={colors.fg}>3. Name it: "Schematic Sync Portal"</text>
                        </box>
                        <box
                            marginTop={1}
                            paddingLeft={2}
                            border
                            borderStyle="single"
                            borderColor={focusArea === "body" ? colors.success : colors.dim + "33"}
                            flexDirection="row"
                            onMouseOver={() => _onFocusChange("body")}
                            onMouseDown={() => confirmSelection(getOptions()[0]!)}
                        >
                            <text fg={focusArea === "body" ? colors.primary : colors.dim}>▶ </text>
                            <Hotkey keyLabel="1" label="NEXT" color={focusArea === "body" ? colors.success : colors.primary} />
                            <text fg={focusArea === "body" ? colors.fg : colors.dim}> - I have created the project</text>
                        </box>
                    </box>
                )
            }

            {
                step === "gdrive_guide_2" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.primary}>Guide Part 2: Activating Drive</text>
                        <box flexDirection="column">
                            <text fg={colors.fg}>1. Search for "Google Drive API" in the top bar.</text>
                            <text fg={colors.fg}>2. Click the API and hit ENABLE.</text>
                        </box>
                        <box
                            marginTop={1}
                            paddingLeft={2}
                            border
                            borderStyle="single"
                            borderColor={colors.success}
                            onMouseOver={() => _onFocusChange("body")}
                            onMouseDown={() => confirmSelection(getOptions()[0]!)}
                        >
                            <text fg={colors.primary}>▶ </text>
                            <Hotkey keyLabel="1" label="NEXT" color={colors.success} />
                            <text fg={colors.fg}> - API is enabled</text>
                        </box>
                    </box>
                )
            }

            {
                step === "gdrive_guide_3" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.primary}>Guide Part 3: Identity & Scopes</text>
                        <box flexDirection="column">
                            <text fg={colors.fg}>1. Go to APIs & Services -{">"} OAuth consent screen.</text>
                            <text fg={colors.fg}>2. Choose External -{">"} Create.</text>
                            <text fg={colors.fg}>3. Add your own email under Test Users.</text>
                        </box>
                        <box
                            marginTop={1}
                            paddingLeft={2}
                            border
                            borderStyle="single"
                            borderColor={colors.success}
                            onMouseOver={() => _onFocusChange("body")}
                            onMouseDown={() => confirmSelection(getOptions()[0]!)}
                        >
                            <text fg={colors.primary}>▶ </text>
                            <Hotkey keyLabel="1" label="NEXT" color={colors.success} />
                            <text fg={colors.fg}> - Consent screen is configured</text>
                        </box>
                    </box>
                )
            }

            {
                step === "gdrive_guide_4" && (
                    <box flexDirection="column" gap={1}>
                        <text attributes={TextAttributes.BOLD} fg={colors.primary}>Guide Part 4: Generating Keys</text>
                        <box flexDirection="column">
                            <text fg={colors.fg}>1. Go to Credentials -{">"} Create Credentials.</text>
                            <text fg={colors.fg}>2. Select OAuth client ID.</text>
                            <text fg={colors.fg}>3. Application Type: Desktop app.</text>
                        </box>
                        <box
                            marginTop={1}
                            paddingLeft={2}
                            border
                            borderStyle="single"
                            borderColor={colors.success}
                            onMouseOver={() => _onFocusChange("body")}
                            onMouseDown={() => confirmSelection(getOptions()[0]!)}
                        >
                            <text fg={colors.primary}>▶ </text>
                            <Hotkey keyLabel="1" label="NEXT" color={colors.success} />
                            <text fg={colors.fg}> - I have my Client ID and Secret</text>
                        </box>
                    </box>
                )
            }

            {
                step === "gdrive_id" && (
                    <box flexDirection="column" gap={1} onMouseDown={() => _onFocusChange("body")}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Google Drive: Client ID</text>
                        <text fg={colors.fg}>🔑 Enter your GCP Client ID:</text>
                        <input
                            focused={focusArea === "body"}
                            placeholder="123456789-abc.apps.googleusercontent.com"
                            value={wizardInputs.clientId}
                            onChange={(val) => updateInput("clientId", val, clientIdRef)}
                            onKeyDown={(e) => { if (e.name === "return") next(); }}
                        />
                    </box>
                )
            }

            {
                step === "gdrive_secret" && (
                    <box flexDirection="column" gap={1} onMouseDown={() => _onFocusChange("body")}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Google Drive: Client Secret</text>
                        <text fg={colors.fg}>🔒 Enter your GCP Client Secret:</text>
                        <input
                            focused={focusArea === "body"}
                            placeholder="GOCSPX-..."
                            value={wizardInputs.clientSecret}
                            onChange={(val) => updateInput("clientSecret", val, clientSecretRef)}
                            onKeyDown={(e) => { if (e.name === "return") next(); }}
                        />
                    </box>
                )
            }

            {
                step === "gdrive_auth" && (
                    <box flexDirection="column" gap={1} alignItems="center">
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Google Drive: Handshake</text>
                        <text fg={colors.fg}>Connecting to project with ID: {clientIdRef.current.slice(0, 10)}...</text>
                        <box marginTop={1} flexDirection="column" alignItems="center">
                            <text fg={colors.success} attributes={TextAttributes.BOLD}>{authStatus || "READY TO AUTHORIZE"}</text>
                            {!authStatus && (
                                <box border padding={1} onMouseOver={() => _onFocusChange("body")} onMouseDown={() => handleGdriveAuth(clientIdRef.current, clientSecretRef.current)} borderColor={colors.success}>
                                    <text fg={colors.fg}> [ CLICK HERE OR HIT ENTER TO AUTHORIZE ] </text>
                                </box>
                            )}
                            {!authStatus && (
                                <input focused={focusArea === "body"} value="" onChange={() => { }} onKeyDown={(e) => { if (e.name === "return") handleGdriveAuth(clientIdRef.current, clientSecretRef.current); }} />
                            )}
                        </box>
                    </box>
                )
            }

            {
                step === "b2_id" && (
                    <box flexDirection="column" gap={1} onMouseDown={() => _onFocusChange("body")}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Backblaze B2: Key ID</text>
                        <text fg={colors.fg}>🔑 Enter your B2 keyID:</text>
                        <input
                            focused={focusArea === "body"}
                            placeholder="005..."
                            value={wizardInputs.b2Id}
                            onChange={(val) => updateInput("b2Id", val, b2IdRef)}
                            onKeyDown={(e) => { if (e.name === "return") next(); }}
                        />
                    </box>
                )
            }

            {
                step === "b2_key" && (
                    <box flexDirection="column" gap={1} onMouseDown={() => _onFocusChange("body")}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Backblaze B2: Application Key</text>
                        <text fg={colors.fg}>🔒 Enter your B2 applicationKey:</text>
                        <input
                            focused={focusArea === "body"}
                            placeholder="K005..."
                            value={wizardInputs.b2Key}
                            onChange={(val) => updateInput("b2Key", val, b2KeyRef)}
                            onKeyDown={(e) => {
                                if (e.name === "return") {
                                    const remoteName = wizardContext === "source" ? Env.REMOTE_PORTAL_SOURCE : Env.REMOTE_PORTAL_BACKUP;
                                    updateGenericRemote(remoteName, "b2", { account: b2IdRef.current, key: b2KeyRef.current });
                                    // COMMIT
                                    const field = wizardContext === "source" ? "source_provider" : "backup_provider";
                                    updateConfig(prev => ({ ...prev, [field]: wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current }));
                                    next();
                                }
                            }}
                        />
                    </box>
                )
            }

            {
                step === "sftp_host" && (
                    <box flexDirection="column" gap={1} onMouseDown={() => _onFocusChange("body")}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>SFTP: Server Address</text>
                        <text fg={colors.fg}>🌐 Enter SFTP Host (e.g., example.com):</text>
                        <input
                            focused={focusArea === "body"}
                            placeholder="sftp.example.com"
                            value={wizardInputs.sftpHost}
                            onChange={(val) => updateInput("sftpHost", val, sftpHostRef)}
                            onKeyDown={(e) => { if (e.name === "return") next(); }}
                        />
                    </box>
                )
            }

            {
                step === "sftp_user" && (
                    <box flexDirection="column" gap={1} onMouseDown={() => _onFocusChange("body")}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>SFTP: Username</text>
                        <text fg={colors.fg}>👤 Enter SSH/SFTP User:</text>
                        <input
                            focused={focusArea === "body"}
                            placeholder="root"
                            value={wizardInputs.sftpUser}
                            onChange={(val) => updateInput("sftpUser", val, sftpUserRef)}
                            onKeyDown={(e) => { if (e.name === "return") next(); }}
                        />
                    </box>
                )
            }

            {
                step === "sftp_pass" && (
                    <box flexDirection="column" gap={1} onMouseDown={() => _onFocusChange("body")}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>SFTP: Security</text>
                        <text fg={colors.fg}>🔑 Enter SSH/SFTP Password (or leave empty for key):</text>
                        <input
                            focused={focusArea === "body"}
                            placeholder="Password"
                            value={wizardInputs.sftpPass}
                            onChange={(val) => updateInput("sftpPass", val, sftpPassRef)}
                            onKeyDown={(e) => {
                                if (e.name === "return") {
                                    const remoteName = wizardContext === "source" ? Env.REMOTE_PORTAL_SOURCE : Env.REMOTE_PORTAL_BACKUP;
                                    updateGenericRemote(remoteName, "sftp", { host: sftpHostRef.current, user: sftpUserRef.current, pass: sftpPassRef.current });
                                    // COMMIT
                                    const field = wizardContext === "source" ? "source_provider" : "backup_provider";
                                    updateConfig(prev => ({ ...prev, [field]: wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current }));
                                    next();
                                }
                            }}
                        />
                    </box>
                )
            }

            {
                step === "pcloud_user" && (
                    <box flexDirection="column" gap={1} onMouseDown={() => _onFocusChange("body")}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>pCloud: Identity</text>
                        <text fg={colors.fg}>👤 Enter pCloud Email:</text>
                        <input
                            focused={focusArea === "body"}
                            placeholder="user@example.com"
                            value={wizardInputs.pcloudUser}
                            onChange={(val) => updateInput("pcloudUser", val, pcloudUserRef)}
                            onKeyDown={(e) => { if (e.name === "return") next(); }}
                        />
                    </box>
                )
            }

            {
                step === "pcloud_pass" && (
                    <box flexDirection="column" gap={1} onMouseDown={() => _onFocusChange("body")}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>pCloud: Security</text>
                        <text fg={colors.fg}>🔑 Enter pCloud Password:</text>
                        <input
                            focused={focusArea === "body"}
                            placeholder="Password"
                            value={wizardInputs.pcloudPass}
                            onChange={(val) => updateInput("pcloudPass", val, pcloudPassRef)}
                            onKeyDown={(e) => {
                                if (e.name === "return") {
                                    const remoteName = wizardContext === "source" ? Env.REMOTE_PORTAL_SOURCE : Env.REMOTE_PORTAL_BACKUP;
                                    updateGenericRemote(remoteName, "pcloud", { username: pcloudUserRef.current, password: pcloudPassRef.current });
                                    // COMMIT
                                    const field = wizardContext === "source" ? "source_provider" : "backup_provider";
                                    updateConfig(prev => ({ ...prev, [field]: wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current }));
                                    next();
                                }
                            }}
                        />
                    </box>
                )
            }

            {
                step === "onedrive_auth" && (
                    <box flexDirection="column" gap={1} alignItems="center">
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>OneDrive Configuration: Handshake</text>
                        <text fg={colors.fg}>This will open a browser to authorize Microsoft OneDrive.</text>

                        <box marginTop={1} flexDirection="column" alignItems="center">
                            <text fg={colors.success} attributes={TextAttributes.BOLD}>{authStatus || "READY TO AUTHORIZE MICROSOFT"}</text>
                            {!authStatus && (
                                <box border padding={1} onMouseOver={() => _onFocusChange("body")} onMouseDown={() => startGenericAuth("onedrive")} borderColor={colors.success}>
                                    <text fg={colors.fg}> [ CLICK HERE OR HIT ENTER TO AUTHORIZE ] </text>
                                </box>
                            )}
                            {!authStatus && (
                                <input focused={focusArea === "body"} value="" onChange={() => { }} onKeyDown={(e) => { if (e.name === "return") startGenericAuth("onedrive"); }} />
                            )}

                            {oauthTokenRef.current ? (
                                <box marginTop={1}>
                                    <text fg={colors.success}>✅ TOKEN CAPTURED. Microsoft Connected.</text>
                                    <box marginTop={1} border padding={1} borderColor={colors.primary}>
                                        <text fg={colors.fg}> [ HIT ENTER TO FINALIZE ] </text>
                                    </box>
                                    <input focused value="" onChange={() => { }} onKeyDown={(e) => { if (e.name === "return") next(); }} />
                                </box>
                            ) : (
                                authStatus?.includes("📡") && (
                                    <box marginTop={1} flexDirection="column" onMouseDown={() => _onFocusChange("body")}>
                                        <text fg={colors.dim}>Paste the Token JSON here:</text>
                                        <input
                                            focused={focusArea === "body"}
                                            placeholder='{"access_token":"..."}'
                                            value={wizardInputs.oauthToken}
                                            onChange={(val) => {
                                                const token = val.trim();
                                                updateInput("oauthToken", token, oauthTokenRef);

                                                const remoteName = wizardContext === "source" ? Env.REMOTE_PORTAL_SOURCE : Env.REMOTE_PORTAL_BACKUP;
                                                updateGenericRemote(remoteName, "onedrive", { token: token });
                                                // COMMIT
                                                const field = wizardContext === "source" ? "source_provider" : "backup_provider";
                                                updateConfig(prev => ({ ...prev, [field]: wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current }));
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.name === "return" && oauthTokenRef.current) next();
                                            }}
                                        />
                                    </box>
                                ) || null
                            )}
                        </box>
                    </box>
                )
            }

            {
                step === "dropbox_auth" && (
                    <box flexDirection="column" gap={1} alignItems="center">
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Dropbox Configuration: Handshake</text>
                        <text fg={colors.fg}>This will open a browser to authorize Dropbox.</text>

                        <box marginTop={1} flexDirection="column" alignItems="center">
                            <text fg={colors.success} attributes={TextAttributes.BOLD}>{authStatus || "READY TO AUTHORIZE DROPBOX"}</text>
                            {!authStatus && (
                                <box border padding={1} onMouseOver={() => _onFocusChange("body")} onMouseDown={() => startGenericAuth("dropbox")} borderColor={colors.success}>
                                    <text fg={colors.fg}> [ CLICK HERE OR HIT ENTER TO AUTHORIZE ] </text>
                                </box>
                            )}
                            {!authStatus && (
                                <input focused={focusArea === "body"} value="" onChange={() => { }} onKeyDown={(e) => { if (e.name === "return") startGenericAuth("dropbox"); }} />
                            )}

                            {oauthTokenRef.current ? (
                                <box marginTop={1}>
                                    <text fg={colors.success}>✅ TOKEN CAPTURED. Dropbox Connected.</text>
                                    <box marginTop={1} border padding={1} borderColor={colors.primary}>
                                        <text fg={colors.fg}> [ HIT ENTER TO FINALIZE ] </text>
                                    </box>
                                    <input focused value="" onChange={() => { }} onKeyDown={(e) => { if (e.name === "return") next(); }} />
                                </box>
                            ) : (
                                authStatus?.includes("📡") && (
                                    <box marginTop={1} flexDirection="column" onMouseDown={() => _onFocusChange("body")}>
                                        <text fg={colors.dim}>Paste the Token JSON here:</text>
                                        <input
                                            focused={focusArea === "body"}
                                            placeholder='{"access_token":"..."}'
                                            value={wizardInputs.oauthToken}
                                            onChange={(val) => {
                                                const token = val.trim();
                                                updateInput("oauthToken", token, oauthTokenRef);

                                                const remoteName = wizardContext === "source" ? Env.REMOTE_PORTAL_SOURCE : Env.REMOTE_PORTAL_BACKUP;
                                                updateGenericRemote(remoteName, "dropbox", { token: token });
                                                // COMMIT
                                                const field = wizardContext === "source" ? "source_provider" : "backup_provider";
                                                updateConfig(prev => ({ ...prev, [field]: wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current }));
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.name === "return" && oauthTokenRef.current) next();
                                            }}
                                        />
                                    </box>
                                ) || null
                            )}
                        </box>
                    </box>
                )
            }

            {
                step === "mega_user" && (
                    <box flexDirection="column" gap={1} onMouseDown={() => _onFocusChange("body")}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Mega.nz Configuration: Identity</text>
                        <text fg={colors.fg}>👤 Enter Mega.nz Email:</text>
                        <input
                            focused={focusArea === "body"}
                            placeholder="user@example.com"
                            value={wizardInputs.megaUser}
                            onChange={(val) => updateInput("megaUser", val, megaUserRef)}
                            onKeyDown={(e) => { if (e.name === "return") next(); }}
                        />
                    </box>
                )
            }

            {
                step === "mega_pass" && (
                    <box flexDirection="column" gap={1} onMouseDown={() => _onFocusChange("body")}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Mega.nz Configuration: Security</text>
                        <text fg={colors.fg}>🔑 Enter Mega.nz Password:</text>
                        <input
                            focused={focusArea === "body"}
                            placeholder="Password"
                            value={wizardInputs.megaPass}
                            onChange={(val) => updateInput("megaPass", val, megaPassRef)}
                            onKeyDown={(e) => {
                                if (e.name === "return") {
                                    const remoteName = wizardContext === "source" ? Env.REMOTE_PORTAL_SOURCE : Env.REMOTE_PORTAL_BACKUP;
                                    updateGenericRemote(remoteName, "mega", { user: megaUserRef.current, pass: megaPassRef.current });
                                    // COMMIT
                                    const field = wizardContext === "source" ? "source_provider" : "backup_provider";
                                    updateConfig(prev => ({ ...prev, [field]: wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current }));
                                    next();
                                }
                            }}
                        />
                    </box>
                )
            }

            {
                step === "r2_id" && (
                    <box flexDirection="column" gap={1} onMouseDown={() => _onFocusChange("body")}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Cloudflare R2: Access Key</text>
                        <text fg={colors.fg}>🔑 Enter R2 Access Key ID:</text>
                        <input
                            focused={focusArea === "body"}
                            placeholder="abc123..."
                            value={wizardInputs.r2Id}
                            onChange={(val) => updateInput("r2Id", val, r2IdRef)}
                            onKeyDown={(e) => { if (e.name === "return") next(); }}
                        />
                    </box>
                )
            }

            {
                step === "r2_key" && (
                    <box flexDirection="column" gap={1} onMouseDown={() => _onFocusChange("body")}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Cloudflare R2: Secret Key</text>
                        <text fg={colors.fg}>🔒 Enter R2 Secret Access Key:</text>
                        <input
                            focused={focusArea === "body"}
                            placeholder="xyz789..."
                            value={wizardInputs.r2Key}
                            onChange={(val) => updateInput("r2Key", val, r2KeyRef)}
                            onKeyDown={(e) => { if (e.name === "return") next(); }}
                        />
                    </box>
                )
            }

            {
                step === "r2_endpoint" && (
                    <box flexDirection="column" gap={1} onMouseDown={() => _onFocusChange("body")}>
                        <text attributes={TextAttributes.BOLD} fg={colors.fg}>Cloudflare R2: Endpoint</text>
                        <text fg={colors.fg}>🌐 Enter R2 S3 Endpoint URL:</text>
                        <input
                            focused={focusArea === "body"}
                            placeholder="https://<account_id>.r2.cloudflarestorage.com"
                            value={wizardInputs.r2Endpoint}
                            onChange={(val) => updateInput("r2Endpoint", val, r2EndpointRef)}
                            onKeyDown={(e) => {
                                if (e.name === "return") {
                                    const remoteName = wizardContext === "source" ? Env.REMOTE_PORTAL_SOURCE : Env.REMOTE_PORTAL_BACKUP;
                                    updateGenericRemote(remoteName, "s3", {
                                        provider: "Cloudflare",
                                        access_key_id: r2IdRef.current,
                                        secret_access_key: r2KeyRef.current,
                                        endpoint: r2EndpointRef.current
                                    });
                                    // COMMIT
                                    const field = wizardContext === "source" ? "source_provider" : "backup_provider";
                                    updateConfig(prev => ({ ...prev, [field]: wizardContext === "source" ? pendingSourceProviderRef.current : pendingBackupProviderRef.current }));
                                    next();
                                }
                            }}
                        />
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
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.primary : colors.dim}>{selectedIndex === i && focusArea === "body" ? "▶ " : "  "}</text>
                                    <Hotkey
                                        keyLabel={opt.key}
                                        label={opt.name}
                                        isFocused={selectedIndex === i && focusArea === "body"}
                                    />
                                    <text fg={selectedIndex === i && focusArea === "body" ? colors.fg : colors.dim}> - {opt.description}</text>
                                </box>
                            ))}
                        </box>
                    </box>
                )
            }
            {
                config.debug_mode && (
                    <box marginTop={1} border borderStyle="single" borderColor={colors.border} padding={1} flexDirection="row">
                        <text attributes={TextAttributes.DIM} fg={colors.dim}>PROGRESS: </text>
                        <text attributes={TextAttributes.DIM} fg={colors.dim}>{step.toUpperCase()}</text>
                    </box>
                )
            }
        </box>
    );
}