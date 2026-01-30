import { join } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { Logger } from "./logger";

export type PortalProvider = "copyparty" | "gdrive" | "b2" | "sftp" | "pcloud" | "onedrive" | "dropbox" | "mega" | "r2" | "none";

export interface PortalConfig {
    // 1. Connection & Providers (One SSoT) 🧠🛡️🦅
    // Remotes are ALWAYS: Env.REMOTE_PORTAL_SOURCE, Env.REMOTE_PORTAL_BACKUP in rclone.conf
    source_provider: PortalProvider;
    backup_provider: PortalProvider;
    upsync_enabled: boolean;

    // 2. Preferences
    local_dir: string;
    strict_mirror: boolean; // true = sync, false = copy

    // 3. Security & Policy
    enable_malware_shield: boolean;
    malware_policy: "purge" | "isolate";

    // 4. Persistence & UI State
    last_sync_stats?: {
        timestamp: number;
        files_processed: number;
        bytes_transferred: number;
        status: "success" | "error";
    };
    desktop_shortcut: number; // 0=unset, 1=on, 2=skipped
    debug_mode: boolean;
    nerd_font_version?: 2 | 3;
    cookie?: string; // Opt-in cookie for CopyParty or other HTTP remotes

    // Font Presence tracking
    nerd_font_auto_install?: boolean;
    nerd_font_auto_install_dismissed?: boolean;
    nerd_font_installed_family?: string;
    nerd_font_last_check?: number; // Unix timestamp
}

// Project root is two levels up from src/lib/config.ts
const PROJECT_ROOT = join(import.meta.dir, "..", "..");
const CONFIG_PATH = join(PROJECT_ROOT, "config.json");

/**
 * Pure Default Template
 */
export const EMPTY_CONFIG: PortalConfig = {
    source_provider: "none",
    backup_provider: "none",
    upsync_enabled: false,
    local_dir: "none",
    strict_mirror: false,
    malware_policy: "purge",
    enable_malware_shield: false,
    desktop_shortcut: 0,
    debug_mode: false,
    nerd_font_auto_install: undefined,
    nerd_font_auto_install_dismissed: undefined,
    nerd_font_installed_family: undefined,
    nerd_font_last_check: undefined
};

export function loadConfig(): PortalConfig {
    try {
        if (existsSync(CONFIG_PATH)) {
            const data = readFileSync(CONFIG_PATH, "utf-8");
            const parsed = JSON.parse(data);
            // Merge with empty config to ensure all keys exist
            return { ...EMPTY_CONFIG, ...parsed };
        }
    } catch (err: unknown) {
        Logger.error("SYSTEM", "Error loading config", err as Error);
    }
    return { ...EMPTY_CONFIG };
}

export function saveConfig(config: PortalConfig): void {
    try {
        // Clean save: only include fields defined in the type
        const clean: PortalConfig = {
            source_provider: config.source_provider,
            backup_provider: config.backup_provider,
            upsync_enabled: config.upsync_enabled,
            local_dir: config.local_dir,
            strict_mirror: config.strict_mirror,
            enable_malware_shield: config.enable_malware_shield,
            malware_policy: config.malware_policy,
            last_sync_stats: config.last_sync_stats,
            desktop_shortcut: config.desktop_shortcut,
            debug_mode: config.debug_mode,
            nerd_font_version: config.nerd_font_version,
            cookie: config.cookie,
            nerd_font_auto_install: config.nerd_font_auto_install,
            nerd_font_auto_install_dismissed: config.nerd_font_auto_install_dismissed,
            nerd_font_installed_family: config.nerd_font_installed_family,
            nerd_font_last_check: config.nerd_font_last_check
        };

        const data = JSON.stringify(clean, null, 2);
        writeFileSync(CONFIG_PATH, data, "utf-8");
    } catch (err: unknown) {
        Logger.error("SYSTEM", "Error saving config", err as Error);
    }
}

export function isConfigComplete(config: PortalConfig): boolean {
    if (!config.local_dir || config.local_dir === "none") return false;
    if (config.source_provider === "none") return false;

    // If backup is intended, it must have a provider
    if (config.upsync_enabled && config.backup_provider === "none") return false;

    return true;
}

export function isConfigEmpty(config: PortalConfig): boolean {
    const noRemote = config.source_provider === "none" && config.backup_provider === "none";
    const noLocal = !config.local_dir || config.local_dir === "" || config.local_dir === "none";
    return noRemote && noLocal && config.desktop_shortcut === 0;
}

export function clearConfig(): void {
    saveConfig(EMPTY_CONFIG);
}
