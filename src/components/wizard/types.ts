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
    | "ntfy_config"
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
    | `${PortalProvider}_intro`
    | `${PortalProvider}_guide_${number}`;

/**
 * The edit-menu entries, in display order.
 *
 * This is the single source of truth for both the rendered list and the container's
 * keyboard `getOptions()`. They were previously two hardcoded arrays that had drifted,
 * so pressing Enter on an item opened a different screen than the one it named.
 */
export interface EditMenuEntry {
    label: string;
    value: Step;
    key: string;
}

export const EDIT_MENU_ENTRIES: readonly EditMenuEntry[] = [
    { label: "SYSTEM INTEGRATION", value: "shortcut", key: "1" },
    { label: "DOWNLOAD STRATEGY", value: "download_mode", key: "2" },
    { label: "SOURCE PROVIDER", value: "source_choice", key: "3" },
    { label: "STORAGE PATH", value: "dir", key: "4" },
    { label: "SYNC STRATEGY", value: "mirror", key: "5" },
    { label: "BACKUP SETTINGS", value: "upsync_ask", key: "6" },
    { label: "SECURITY POLICY", value: "security", key: "7" },
    { label: "NOTIFICATIONS", value: "ntfy_config", key: "8" },
    { label: "DEPLOY & FINISH", value: "deploy", key: "9" }
] as const;

/**
 * Steps whose body contains a focused text input. Global navigation keys (`b` to go
 * back, digits to jump) must not fire while the user is typing a path or a URL.
 */
export const TEXT_INPUT_STEPS: readonly Step[] = [
    "dir", "backup_dir", "copyparty_config", "ntfy_config", "cloud_direct_entry"
] as const;

/**
 * Focusable row indices on the CopyParty step, shared by the renderer and the keyboard
 * handler. These were duplicated as magic numbers; when the Method row was inserted the
 * handler was not updated, so Enter on "TEST & CONNECT" triggered Back.
 */
export const COPYPARTY_ROW = {
    URL: 0,
    USER: 1,
    PASS: 2,
    METHOD: 3,
    CONNECT: 4,
    BACK: 5
} as const;
export const COPYPARTY_LAST_ROW = COPYPARTY_ROW.BACK;

/**
 * Credential fields each provider collects on the direct-entry screen, in render order.
 *
 * The container derives its focus bounds from this rather than hardcoding `maxIdx`,
 * which previously assumed two fields for every provider and walked keyboard focus onto
 * widgets that did not exist for the zero-field OAuth providers.
 */
export const DIRECT_ENTRY_FIELDS: Partial<Record<PortalProvider, readonly string[]>> = {
    gdrive: ["clientId", "clientSecret"],
    b2: ["b2Id", "b2Key"],
    sftp: ["url", "user", "pass"],
    pcloud: ["user", "pass"],
    mega: ["user", "pass"],
    r2: ["user", "pass", "url"],
    s3: ["user", "pass", "url"],
    onedrive: [],
    dropbox: []
};

export function directEntryFieldCount(provider: PortalProvider): number {
    return DIRECT_ENTRY_FIELDS[provider]?.length ?? 0;
}

/** Focusable row indices on the ntfy step. */
export const NTFY_ROW = {
    URL: 0,
    TEST: 1,
    DAEMON: 2,
    DONE: 3,
    BACK: 4
} as const;
export const NTFY_LAST_ROW = NTFY_ROW.BACK;

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
    updateGenericRemote: (remoteName: string, provider: string, opts: Record<string, string>) => void;
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
