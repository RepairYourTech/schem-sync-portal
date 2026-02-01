import { spawnSync } from "bun";
import { readdirSync } from "fs";
import type { Dirent } from "fs";
import { join } from "path";
import { Env } from "./env";
import { Logger } from "./logger";

let _spawnSync = spawnSync;
let _readdirSync = readdirSync;
let _detectNerdFonts = internalDetectNerdFonts;

/** @internal - Exported for testing only */
export function __setSpawnSync(mock: typeof spawnSync) {
    _spawnSync = mock;
}

/** @internal - Exported for testing only */
export function __setReaddirSync(mock: typeof readdirSync) {
    _readdirSync = mock;
}

/** @internal - Exported for testing only */
export function __setDetectNerdFonts(mock: typeof internalDetectNerdFonts) {
    _detectNerdFonts = mock;
}

export interface FontDetectionResult {
    isInstalled: boolean;
    version: 2 | 3 | null;
    method: 'fc-list' | 'filesystem' | 'heuristic' | 'none';
    confidence: 'high' | 'medium' | 'low';
    installedFonts: string[];
}

export interface DependencyStatus {
    bun: string | null;
    zig: string | null;
    rclone: string | null;
    rcloneVersion?: string;
    isRcloneModern?: boolean; // v1.73+ or slog detected
    archive: string | null;
    diskSpace: string | null;
    nerdFont: string | null;
    clipboard: string | null;
    recommendedVersion: 2 | 3;
    nerdFontDetailed: FontDetectionResult;
}

/**
 * Enhanced Nerd Font detection using multiple methods
 */
export async function detectNerdFonts(): Promise<FontDetectionResult> {
    return _detectNerdFonts();
}

async function internalDetectNerdFonts(): Promise<FontDetectionResult> {
    const result: FontDetectionResult = {
        isInstalled: false,
        version: null,
        method: 'none',
        confidence: 'low',
        installedFonts: []
    };

    try {
        // Method 1 - fc-list codepoint check (Linux/macOS preferred)
        if (!Env.isWin) {
            Logger.debug('SYSTEM', 'Attempting font detection via fc-list');
            const v3Result = _spawnSync(['fc-list', ':charset=eeed']);
            if (v3Result.success && v3Result.stdout.toString().trim().length > 0) {
                const fonts = v3Result.stdout.toString().split('\n')
                    .map(line => line.split(':')[1]?.trim())
                    .filter((f): f is string => !!f);

                return {
                    isInstalled: true,
                    version: 3,
                    method: 'fc-list',
                    confidence: 'high',
                    installedFonts: fonts
                };
            }

            const v2Result = _spawnSync(['fc-list', ':charset=f61a']);
            if (v2Result.success && v2Result.stdout.toString().trim().length > 0) {
                const fonts = v2Result.stdout.toString().split('\n')
                    .map(line => line.split(':')[1]?.trim())
                    .filter((f): f is string => !!f);

                return {
                    isInstalled: true,
                    version: 2,
                    method: 'fc-list',
                    confidence: 'high',
                    installedFonts: fonts
                };
            }
        }

        // Method 2 - Filesystem scan
        Logger.debug('SYSTEM', 'Attempting font detection via filesystem scan');
        const home = Env.getPaths().home;
        let fontDirs: string[] = [];

        if (Env.isWin) {
            const localAppData = process.env.LOCALAPPDATA || "";
            fontDirs = [join(localAppData, 'Microsoft', 'Windows', 'Fonts')];
        } else if (Env.isMac) {
            fontDirs = [join(home, 'Library', 'Fonts')];
        } else {
            fontDirs = [join(home, '.local', 'share', 'fonts')];
        }

        const nerdFontPattern = /Nerd.*Font.*\.(ttf|otf)$/i;
        const foundFonts: string[] = [];

        const walk = (dir: string) => {
            try {
                const entries = _readdirSync(dir, { withFileTypes: true }) as unknown as Dirent[];
                for (const entry of entries) {
                    const fullPath = join(dir, entry.name);
                    if (entry.isDirectory()) {
                        walk(fullPath);
                    } else if (entry.isFile() && nerdFontPattern.test(entry.name)) {
                        foundFonts.push(fullPath);
                    }
                }
            } catch {
                // Directory might not exist or be readable
            }
        };

        for (const dir of fontDirs) {
            walk(dir);
        }

        if (foundFonts.length > 0) {
            // Determine version by checking for v3 indicators (e.g., "NF" suffix in filenames)
            const isV3 = foundFonts.some(f => f.includes('NF') || f.includes('v3'));
            return {
                isInstalled: true,
                version: isV3 ? 3 : 2,
                method: 'filesystem',
                confidence: 'medium',
                installedFonts: foundFonts.map(f => f.split(/[\\/]/).pop()!)
            };
        }

        // Method 3 - Terminal heuristics (fallback)
        Logger.debug('SYSTEM', 'Falling back to terminal heuristics for font version');
        const heuristicVersion = detectNerdFontVersion();
        return {
            isInstalled: false, // Heuristics don't guarantee installation
            version: heuristicVersion,
            method: 'heuristic',
            confidence: 'low',
            installedFonts: []
        };

    } catch (err) {
        Logger.error('SYSTEM', 'Error during Nerd Font detection', err as Error);
    }

    return result;
}

function detectNerdFontVersion(): 2 | 3 {
    try {
        // Check for v3 first (Font Awesome 6 Cat face)
        const v3Result = _spawnSync(["fc-list", ":charset=eeed"]);
        if (v3Result.success && v3Result.stdout.toString().trim().length > 0) {
            return 3;
        }

        // Check for v2 (Material Design Cat face)
        const v2Result = _spawnSync(["fc-list", ":charset=f61a"]);
        if (v2Result.success && v2Result.stdout.toString().trim().length > 0) {
            return 2;
        }
    } catch {
        // Silently fail, move to heuristics
    }

    const term = process.env.TERM_PROGRAM || "";
    const termName = process.env.TERM || "";

    // Warp, Ghostty, WezTerm, Alacritty, and Kitty are modern and almost always use v3
    const isModern = term.includes("Warp") ||
        term.includes("Ghostty") ||
        termName.includes("wezterm") ||
        termName.includes("alacritty") ||
        termName.includes("xterm-kitty") ||
        term.includes("rio");

    if (isModern) {
        return 3;
    }

    // Older or more conservative environments default to v2
    return 2;
}

export async function checkDependencies(): Promise<DependencyStatus> {
    const isWin = Env.isWin;

    const getVersion = (cmd: string, args: string[] = ["--version"]) => {
        try {
            const result = _spawnSync([cmd, ...args]);
            if (result.success) {
                const version = result.stdout.toString().split("\n")[0]?.trim() || "Detected";
                Logger.debug("SYSTEM", `Dependency check: ${cmd} -> ${version}`);
                return version;
            }
        } catch {
            Logger.error("SYSTEM", `Failed to check dependency: ${cmd}`);
        }
        return null;
    };

    const getDiskSpace = () => {
        try {
            if (isWin) {
                const result = _spawnSync(["powershell", "-Command", "(([WmiSearcher]'Select FreeSpace from Win32_LogicalDisk where DeviceID=\"C:\"').Get() | Select-Object -ExpandProperty FreeSpace) / 1GB"]);
                if (result.success) {
                    const gb = parseFloat(result.stdout.toString().trim());
                    return isNaN(gb) ? "Unknown" : `${gb.toFixed(1)} GB`;
                }
            } else {
                const result = _spawnSync(["df", "-h", "."]);
                if (result.success) {
                    const lines = result.stdout.toString().split("\n");
                    const parts = lines[1]?.split(/\s+/);
                    if (parts?.length && parts[3]) return parts[3];
                }
            }
        } catch (err) {
            Logger.error("SYSTEM", "Failed to check disk space", err);
        }
        return "Unknown";
    };

    const checkArchive = () => {
        const bins = isWin ? ["7z.exe", "7za.exe", "rar.exe"] : ["7z", "7za", "rar", "unrar"];
        // Use Env service if we had a dedicated helper, but findBinary works:
        const binary = Env.findBinary(bins);
        return binary ? "Available" : null;
    };

    const checkFont = () => {
        // Nerd Fonts can't be strictly detected by binary, but we can check terminal environments
        // or just return a suggestion for visual check.
        const term = process.env.TERM_PROGRAM || "";
        const terminal = process.env.LC_TERMINAL || "";

        if (term.includes("vscode") || term.includes("iTerm") || term.includes("Warp") ||
            term.includes("Apple_Terminal") || terminal.includes("iterm2")) {
            return "Detected (Visual verification required)";
        }

        // ZSH check (user mentioned zsh)
        if (process.env.ZSH_NAME || process.env.SHELL?.includes("zsh")) {
            return "Likely Patchable (User ZSH detected)";
        }

        return "Requires Visual Verification";
    };

    const checkClipboard = () => {
        const bins = isWin ? ["clip.exe"] : (Env.isMac ? ["pbcopy"] : ["wl-copy", "xclip", "xsel"]);
        const binary = Env.findBinary(bins);
        if (binary) {
            return binary.split(/[\\/]/).pop() || "Available";
        }

        // Dynamic hint based on environment
        if (Env.isMac) return "NOT FOUND (brew install xclip)"; // pbcopy is native, but if missing...
        if (isWin) return "NOT FOUND (clip.exe missing)";

        // Arch specific hints
        const hasYay = !!Env.findBinary(["yay"]);
        const hasPacman = !!Env.findBinary(["pacman"]);
        const isWayland = !!process.env.WAYLAND_DISPLAY;

        if (isWayland) {
            if (hasYay) return "NOT FOUND (yay -S wl-clipboard)";
            if (hasPacman) return "NOT FOUND (pacman -S wl-clipboard)";
            return "NOT FOUND (Install wl-clipboard)";
        }
        return "NOT FOUND (Install xclip)";
    };

    const nerdFontDetailed = await detectNerdFonts();

    const rcloneRaw = getVersion("rclone", ["version"]);
    let rcloneVersion = "";
    let isRcloneModern = false;

    if (rcloneRaw) {
        const match = rcloneRaw.match(/v(\d+\.\d+\.\d+)/);
        if (match && match[1]) {
            rcloneVersion = match[1];
            const parts = rcloneVersion.split(".").map(Number);
            if (parts[0] > 1 || (parts[0] === 1 && parts[1] >= 73)) {
                isRcloneModern = true;
            }
        }
    }

    return {
        bun: getVersion("bun"),
        zig: getVersion("zig", ["version"]),
        rclone: rcloneRaw,
        rcloneVersion: rcloneVersion || undefined,
        isRcloneModern,
        archive: checkArchive(),
        diskSpace: getDiskSpace(),
        nerdFont: checkFont(),
        clipboard: checkClipboard(),
        recommendedVersion: nerdFontDetailed.version || 2,
        nerdFontDetailed
    };
}

