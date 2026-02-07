import { join } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { Logger, type LogLevel } from "./logger";

export type PortalProvider = "copyparty" | "gdrive" | "b2" | "sftp" | "pcloud" | "onedrive" | "dropbox" | "mega" | "r2" | "s3" | "none" | "unconfigured";

export interface PortalConfig {
    // 1. Connection & Providers (One SSoT) 🧠🛡️🦅
    source_provider: PortalProvider;
    backup_provider: PortalProvider;
    backup_dir: string;
    upsync_enabled: boolean | undefined;

    // 2. Preferences
    local_dir: string;
    strict_mirror: boolean | undefined;
    download_mode?: "full" | "lean";

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
    last_shield_stats?: {
        timestamp: number;
        totalArchives: number;
        riskyPatternCount: number;
        extractedFiles: number;
    };
    desktop_shortcut: number; // 0=unset, 1=on, 2=skipped
    debug_mode: boolean;
    log_level?: LogLevel;
    nerd_font_version?: 2 | 3;
    copyparty_method?: "webdav" | "http";

    // Font Presence tracking
    nerd_font_auto_install?: boolean;
    nerd_font_auto_install_dismissed?: boolean;
    nerd_font_installed_family?: string;
    nerd_font_last_check?: number;

    // 5. Performance
    downsync_transfers?: 4 | 6 | 8;
    upsync_transfers?: 4 | 6 | 8;
}

const PROJECT_ROOT = join(process.cwd());

/**
 * Gets the current configuration path.
 * Evaluated lazily to ensure environment variable changes (e.g. in tests) are respected.
 */
export function getConfigPath(): string {
    return process.env.PORTAL_CONFIG_PATH || join(PROJECT_ROOT, "config.json");
}

/**
 * Pure Default Template - Uses "unconfigured" to force interaction.
 */
export const EMPTY_CONFIG: PortalConfig = {
    source_provider: "unconfigured",
    backup_provider: "unconfigured",
    backup_dir: "",
    upsync_enabled: false,
    local_dir: "",
    strict_mirror: false,
    download_mode: "full",
    malware_policy: "purge",
    enable_malware_shield: false,
    desktop_shortcut: 0,
    debug_mode: false,
    log_level: "NORMAL",
    nerd_font_auto_install: false,
    nerd_font_auto_install_dismissed: false,
    nerd_font_installed_family: undefined,
    nerd_font_last_check: undefined,
    downsync_transfers: 4,
    upsync_transfers: 4
};

export function loadConfig(): PortalConfig {
    const configPath = getConfigPath();
    try {
        if (existsSync(configPath)) {
            const data = readFileSync(configPath, "utf-8");
            let parsed = JSON.parse(data);

            // MIGRATION: Convert legacy "none" defaults to "unconfigured" or ""
            if (parsed.source_provider === "none") parsed.source_provider = "unconfigured";
            if (parsed.local_dir === "none") parsed.local_dir = "";

            // MIGRATION: Default download_mode to "full" if missing (Backward Compatibility)
            if (!parsed.download_mode) parsed.download_mode = "full";

            // MIGRATION: log_level replacement for debug_mode
            if (parsed.log_level === undefined && parsed.debug_mode === true) {
                parsed.log_level = "DEBUG";
            } else if (parsed.log_level === undefined) {
                parsed.log_level = "NORMAL";
            }

            // MIGRATION: SECURITY HARDENING - Remove plaintext credentials (Issue #12)
            if (parsed.cookie) delete parsed.cookie;
            if (parsed.webdav_user) delete parsed.webdav_user;
            if (parsed.webdav_pass) delete parsed.webdav_pass;

            return { ...EMPTY_CONFIG, ...parsed };
        }
    } catch (err: unknown) {
        Logger.error("SYSTEM", "Error loading config", err as Error);
    }
    return { ...EMPTY_CONFIG };
}

export function saveConfig(config: PortalConfig): void {
    const configPath = getConfigPath();
    try {
        // ENFORCEMENT: Shield is REQUIRED for Google Drive to prevent account suspension.
        if (config.backup_provider === "gdrive") {
            config.enable_malware_shield = true;
            config.malware_policy = "isolate"; // Recommended for forensics
        }

        // THOROUGH SAVE: Ensure ALL fields defined in the type are explicitly picked.
        const clean: PortalConfig = {
            source_provider: config.source_provider,
            backup_provider: config.backup_provider,
            backup_dir: config.backup_dir || "",
            upsync_enabled: config.upsync_enabled,
            local_dir: config.local_dir,
            strict_mirror: config.strict_mirror,
            download_mode: config.download_mode || "full",
            enable_malware_shield: config.enable_malware_shield,
            malware_policy: config.malware_policy,
            last_sync_stats: config.last_sync_stats,
            last_shield_stats: config.last_shield_stats,
            desktop_shortcut: config.desktop_shortcut,
            debug_mode: config.debug_mode,
            log_level: config.log_level || "NORMAL",
            nerd_font_version: config.nerd_font_version,
            copyparty_method: config.copyparty_method,
            nerd_font_auto_install: config.nerd_font_auto_install,
            nerd_font_auto_install_dismissed: config.nerd_font_auto_install_dismissed,
            nerd_font_installed_family: config.nerd_font_installed_family,
            nerd_font_last_check: config.nerd_font_last_check,
            downsync_transfers: config.downsync_transfers || 4,
            upsync_transfers: config.upsync_transfers || 4
        };

        const data = JSON.stringify(clean, null, 2);
        writeFileSync(configPath, data, "utf-8");
    } catch (err: unknown) {
        Logger.error("SYSTEM", "Error saving config", err as Error);
    }
}

export function isConfigComplete(config: PortalConfig): boolean {
    if (!config.local_dir || config.local_dir === "" || config.local_dir === "none") return false;
    if (config.source_provider === "unconfigured" || config.source_provider === "none") return false;

    // If backup is intended, it must have a provider (unconfigured is NOT allowed if upsync is on)
    if (config.upsync_enabled && (config.backup_provider === "unconfigured")) return false;

    return true;
}

export function isConfigEmpty(config: PortalConfig): boolean {
    const noRemote = (config.source_provider === "none" || config.source_provider === "unconfigured") &&
        (config.backup_provider === "none" || config.backup_provider === "unconfigured");
    const noLocal = !config.local_dir || config.local_dir === "" || config.local_dir === "none";
    return noRemote && noLocal && config.desktop_shortcut === 0;
}

export function clearConfig(): void {
    saveConfig(EMPTY_CONFIG);
}
