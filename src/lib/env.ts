import { join } from "path";
import { existsSync, mkdirSync, appendFileSync, statSync } from "fs";
import { which } from "bun";

export type Platform = "win32" | "darwin" | "linux";

export class Env {
    static readonly APP_NAME_PROPER = "Schematic Portal";
    static readonly APP_NAME_ID = "schem-sync-portal";
    static readonly REMOTE_SOURCE_SUFFIX = "_source";
    static readonly REMOTE_DEST_SUFFIX = "_dest";
    static readonly REMOTE_PORTAL_SOURCE = "portal_source";
    static readonly REMOTE_PORTAL_BACKUP = "portal_backup";
    static readonly REMOTE_LEGACY_SOURCE = "schematics_source";

    static get platform(): Platform {
        return process.platform as Platform;
    }

    static get isWin(): boolean {
        return process.platform === "win32";
    }

    static get isMac(): boolean {
        return process.platform === "darwin";
    }

    /**
     * Get the OS-specific display name for shortcuts and files.
     */
    static getDisplayName(): string {
        if (Env.isMac) return `${Env.APP_NAME_PROPER}.command`;
        if (Env.isWin) return `${Env.APP_NAME_PROPER}.bat`;
        return `${Env.APP_NAME_ID}.desktop`;
    }

    static getPaths() {
        const home = process.env.HOME || "";
        const isWin = Env.isWin;
        const isMac = Env.isMac;

        if (isWin) {
            const appData = process.env.APPDATA || "";
            return {
                home,
                configDir: join(appData, Env.APP_NAME_ID),
                logsDir: join(appData, Env.APP_NAME_ID, "logs"),
                rcloneConfigDir: join(appData, "rclone"),
                appsDir: join(appData, "Microsoft", "Windows", "Start Menu", "Programs"),
                desktopDir: join(process.env.USERPROFILE || "", "Desktop"),
                binDir: "" // Not used on Windows
            };
        } else if (isMac) {
            return {
                home,
                configDir: join(home, "Library", "Application Support", Env.APP_NAME_ID),
                logsDir: join(home, "Library", "Logs", Env.APP_NAME_ID),
                rcloneConfigDir: join(home, ".config", "rclone"),
                appsDir: join(home, "Applications"),
                desktopDir: join(home, "Desktop"),
                binDir: "/usr/local/bin"
            };
        } else {
            // Linux / XDG
            const xdgData = process.env.XDG_DATA_HOME || join(home, ".local", "share");
            const xdgConfig = process.env.XDG_CONFIG_HOME || join(home, ".config");
            const xdgState = process.env.XDG_STATE_HOME || join(home, ".local", "state");

            return {
                home,
                configDir: join(xdgConfig, Env.APP_NAME_ID),
                logsDir: join(xdgState, Env.APP_NAME_ID, "logs"),
                rcloneConfigDir: join(xdgConfig, "rclone"),
                appsDir: join(xdgData, "applications"),
                desktopDir: join(home, "Desktop"),
                binDir: join(home, ".local", "bin")
            };
        }
    }

    static getExcludeFilePath(): string {
        return join(Env.getPaths().rcloneConfigDir, "schematics-exclude.txt");
    }

    static getRcloneConfigPath(): string {
        return join(Env.getPaths().rcloneConfigDir, "rclone.conf");
    }

    static getLogPath(filename: string = "app.log"): string {
        const { logsDir } = Env.getPaths();
        try {
            if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
        } catch { }
        return join(logsDir, filename);
    }

    /**
     * Safety check to prevent operations on system roots
     */
    static isSafeDirectory(path: string): boolean {
        if (!path || path.trim() === "") return false;
        const normalized = path.replace(/\\/g, "/");

        // Block roots
        if (normalized === "/" || normalized.match(/^[a-zA-Z]:\/$/)) return false;

        // Block critical system folders (basic heuristic)
        const criticals = ["/usr", "/bin", "/sbin", "/etc", "/var", "/Windows", "/Program Files"];
        if (criticals.some(c => normalized.startsWith(c))) return false;

        return true;
    }

    /**
     * Cross-platform binary lookup
     */
    static findBinary(names: string[]): string | null {
        for (const name of names) {
            // Bun's `which` works cross-platform
            const path = which(name);
            if (path) return path;
        }
        return null;
    }
}
