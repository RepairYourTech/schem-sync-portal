import { join } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import pkg from "../../package.json";
import { Logger } from "./logger";

export interface UpdateInfo {
    available: boolean;
    latestVersion: string;
    currentVersion: string;
    url: string;
    publishedAt: string;
    body: string;
}

const REPO = "RepairYourTech/schem-sync-portal";
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const CACHE_FILE = join(process.cwd(), ".update-cache.json");
const CACHE_TTL = 3600000; // 1 hour

function parseVersion(v: string): number[] {
    return v.replace(/^v/, "").split(".").map(Number);
}

/**
 * Compares two semantic version strings.
 * Returns true if latest is strictly newer than current.
 */
export function isNewer(current: string, latest: string): boolean {
    const c = parseVersion(current);
    const l = parseVersion(latest);
    for (let i = 0; i < 3; i++) {
        const valL = l[i] || 0;
        const valC = c[i] || 0;
        if (valL > valC) return true;
        if (valL < valC) return false;
    }
    return false;
}

/**
 * Checks GitHub for the latest release.
 * Uses a local file cache to avoid rate limiting.
 */
export async function checkForUpdates(force = false): Promise<UpdateInfo | null> {
    try {
        // 1. Check cache first
        if (!force && existsSync(CACHE_FILE)) {
            try {
                const cached = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
                if (Date.now() - cached.timestamp < CACHE_TTL) {
                    return cached.data;
                }
            } catch {
                // Ignore corrupt cache
            }
        }

        // 2. Fetch from GitHub
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(API_URL, {
            signal: controller.signal,
            headers: {
                "User-Agent": "SchematicSyncPortal-Updater"
            }
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
            if (res.status === 403) {
                Logger.warn("SYSTEM", "GitHub API rate limit exceeded.");
            } else {
                Logger.warn("SYSTEM", `GitHub API error: ${res.status}`);
            }
            return null;
        }

        const release = await res.json();
        const latestVersion = release.tag_name;
        const currentVersion = pkg.version;

        const info: UpdateInfo = {
            available: isNewer(currentVersion, latestVersion),
            latestVersion,
            currentVersion,
            url: release.html_url,
            publishedAt: release.published_at,
            body: release.body
        };

        // 3. Cache result
        try {
            writeFileSync(CACHE_FILE, JSON.stringify({
                data: info,
                timestamp: Date.now()
            }, null, 2));
        } catch {
            // Ignore cache write failures
        }

        return info;
    } catch (err) {
        if ((err as Error).name === "AbortError") {
            Logger.warn("SYSTEM", "Update check timed out.");
        } else {
            Logger.debug("SYSTEM", "Failed to check for updates", err as Error);
        }
        return null;
    }
}
