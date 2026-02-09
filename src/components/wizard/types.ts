import React from "react";
import type { PortalConfig, PortalProvider } from "../../lib/config.ts";
import type { FocusArea } from "../../hooks/useAppState";

// Step type for wizard navigation
export type Step =
    | "shortcut"
    | "download_mode"
    | "edit_menu"
    | "source_choice"
    | "copyparty_config"
    | "dir"
    | "backup_dir"
    | "mirror"
    | "upsync_ask"
    | "dest_cloud_select"
    | "security"
    | "deploy"
    | "cloud_direct_entry"
    /**
     * Provider-specific steps (dynamic)
     * Convention: `${provider}_intro` or `${provider}_guide_${number}`
     */
    | `${string}_intro`
    | `${string}_guide_${number}`;

// Wizard option types for different use cases
export type WizardOptionType =
    | "back"
    | "deploy"
    | "intro_path"
    | "guide_next"
    | "desktop_shortcut"
    | "download_mode"
    | "jump"
    | "dir_input"
    | "dir_confirm"
    | "sec_policy"
    | "sec_toggle"
    | "source_select"
    | "backup_provider"
    | "sync_mode"
    | "mirror"
    | "bootstrap"
    | "shortcut"
    | "skip";

// Flexible WizardOption that matches actual usage
export interface WizardOption {
    value: PortalProvider | (string & {}) | number | boolean;
    type: WizardOptionType | (string & {});
    label?: string;
    description?: string;
    name?: string;
    key?: string;
    meta?: boolean;
}

// Keyboard event for wizard navigation
export interface WizardKeyEvent {
    name: string;
    shift?: boolean;
    ctrl?: boolean;
    meta?: boolean;
}

// Auth context for provider setup
export interface WizardAuthContext {
    wizardContext: "source" | "dest" | null;
    pendingSourceProvider: PortalProvider;
    pendingBackupProvider: PortalProvider;
    refs: {
        urlRef: React.MutableRefObject<string>;
        userRef: React.MutableRefObject<string>;
        passRef: React.MutableRefObject<string>;
        clientIdRef: React.MutableRefObject<string>;
        clientSecretRef: React.MutableRefObject<string>;
        b2IdRef: React.MutableRefObject<string>;
        b2KeyRef: React.MutableRefObject<string>;
    };
    handleGdriveAuth: (clientId: string, clientSecret: string) => void;
    startGenericAuth: (provider: string) => void;
    updateGenericRemote: (remoteName: string, provider: PortalProvider | string, opts: Record<string, string>) => Promise<void> | void;
    updateConfig: (updater: (prev: PortalConfig) => PortalConfig) => void;
    next: () => void;
}

export interface WizardProps {
    onComplete: (config: PortalConfig) => void;
    onUpdate?: (config: PortalConfig) => void;
    onCancel: () => void;
    onQuit: () => void;
    initialConfig: PortalConfig;
    mode?: "continue" | "restart" | "edit";
    focusArea: FocusArea;
    onFocusChange: (area: FocusArea) => void;
    tabTransition?: "forward" | "backward" | null;
    backSignal: number;
}

export type WizardMode = "continue" | "restart" | "edit";
