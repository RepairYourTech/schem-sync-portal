import { join, isAbsolute, resolve } from "path";
import { existsSync, mkdirSync, realpathSync } from "fs";
import { homedir } from "os";
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

    /**
     * Get path to rclone exclude file (stored in local sync directory).
     */
    static getExcludeFilePath(localDir: string): string {
        return join(localDir, ".shield-exclude.txt");
    }

    /**
     * Get path to shield offenders list (stored in local sync directory).
     */
    static getOffenderListPath(localDir: string): string {
        return join(localDir, ".shield-offenders.json");
    }

    static getRcloneConfigPath(): string {
        // [SAFETY] Block access to system rclone config unless explicitly permitted.
        // This prevents tests or dev sessions from accidentally overwriting user data.
        if (process.env.NODE_ENV === "test" || process.env.MOCK_RCLONE) {
            if (!process.env.RCLONE_CONFIG_PATH) {
                throw new Error("UNAUTHORIZED SYSTEM ACCESS: RCLONE_CONFIG_PATH must be set in test/dev environments.");
            }
            return process.env.RCLONE_CONFIG_PATH;
        }
        return join(Env.getPaths().rcloneConfigDir, "rclone.conf");
    }

    static getLogPath(filename: string = "app.log"): string {
        const { logsDir } = Env.getPaths();
        try {
            if (logsDir && !existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
        } catch (err) {
            console.debug("Failed to create logs directory:", err);
        }
        return join(logsDir || ".", filename);
    }

    /**
     * Guards every destructive filesystem path (mirror sync, shield purge, lean sweep).
     *
     * The sync engine deletes files that are not on the remote and strips any extension
     * outside the schematic whitelist, so pointing it at a home directory, a mount root,
     * or a user data folder is unrecoverable. Returns a reason string when unsafe so the
     * caller can tell the user *why*, and null when the path is acceptable.
     */
    static getUnsafeDirectoryReason(path: string): string | null {
        if (!path || path.trim() === "") return "No directory selected.";

        const raw = path.trim();
        if (raw.startsWith("~")) return "Use an absolute path, not '~'.";
        if (!isAbsolute(raw)) return "Directory must be an absolute path.";

        // Resolve `..` and symlinks so `/home/me/../..` cannot slip through.
        let normalized: string;
        try {
            normalized = existsSync(raw) ? realpathSync(raw) : resolve(raw);
        } catch {
            normalized = resolve(raw);
        }
        normalized = normalized.replace(/\\/g, "/").replace(/\/+$/, "") || "/";

        if (normalized === "/" || /^[a-zA-Z]:$/.test(normalized)) {
            return "Refusing to operate on the filesystem root.";
        }

        // Consider both the env-derived home and the OS-reported one: $HOME can be
        // reassigned (tests, sandboxes, sudo), and a guard that misses the real home
        // directory is worse than no guard at all.
        const homeCandidates = [Env.getPaths().home, homedir()]
            .filter((h): h is string => Boolean(h))
            .map(h => h.replace(/\\/g, "/").replace(/\/+$/, ""));

        if (homeCandidates.includes(normalized)) {
            return "Refusing to operate directly on your home directory. Choose a subfolder.";
        }

        const criticals = [
            "/usr", "/bin", "/sbin", "/lib", "/lib64", "/etc", "/var", "/boot", "/dev",
            "/proc", "/sys", "/run", "/opt", "/srv", "/System", "/Library", "/Applications",
            "/Windows", "/Program Files", "/Program Files (x86)"
        ];
        if (criticals.some(c => normalized === c || normalized.startsWith(c + "/"))) {
            return `Refusing to operate on the system directory ${normalized}.`;
        }

        // Containers of user data or mounts: a subfolder is fine, the root itself is not.
        const rootsNeedingSubfolder = ["/home", "/Users", "/root", "/mnt", "/media", "/tmp", "/Volumes"];
        if (rootsNeedingSubfolder.includes(normalized)) {
            return `Refusing to operate directly on ${normalized}. Choose a subfolder.`;
        }

        // Common user data roots. A subfolder of these is fine; the root itself is not.
        const dataRoots = ["Documents", "Desktop", "Downloads", "Pictures", "Music", "Videos"];
        for (const home of homeCandidates) {
            if (dataRoots.some(d => normalized === `${home}/${d}`)) {
                return `Refusing to operate directly on ${normalized}. Choose a dedicated subfolder.`;
            }
        }

        return null;
    }

    /**
     * Safety check to prevent operations on system roots and user data roots.
     */
    static isSafeDirectory(path: string): boolean {
        return Env.getUnsafeDirectoryReason(path) === null;
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
