import { spawnSync } from "bun";
import { Env } from "./env";
import { Logger } from "./logger";

let _spawnSync = spawnSync;

/** @internal - Exported for testing only */
export function __setSpawnSync(mock: typeof spawnSync) {
    _spawnSync = mock;
}

export interface CacheRefreshResult {
    success: boolean;
    method: "auto" | "fc-cache" | "manual";
    message: string;
}

/**
 * Refreshes the system font cache if necessary.
 */
export async function refreshFontCache(): Promise<CacheRefreshResult> {
    const platform = Env.platform;

    try {
        if (platform === "win32") {
            Logger.debug('SYSTEM', 'Font cache refresh not needed on Windows');
            return {
                success: true,
                method: 'auto',
                message: 'Windows auto-refreshes font cache'
            };
        }

        if (platform === "darwin") {
            Logger.debug('SYSTEM', 'Font cache refresh handled by fontd on macOS');
            return {
                success: true,
                method: 'auto',
                message: 'macOS fontd daemon handles cache refresh'
            };
        }

        // Linux implementation
        const fcCacheBin = Env.findBinary(['fc-cache']);
        if (!fcCacheBin) {
            Logger.warn('SYSTEM', 'fc-cache not found on Linux');
            return {
                success: true,
                method: 'manual',
                message: 'fc-cache not found. Restart terminal or run: fc-cache -fv'
            };
        }

        Logger.info('SYSTEM', 'Refreshing font cache on Linux');
        const result = _spawnSync([fcCacheBin, '-f', '-v']);

        if (result.success) {
            return {
                success: true,
                method: 'fc-cache',
                message: 'Font cache refreshed successfully'
            };
        } else {
            Logger.error('SYSTEM', 'fc-cache failed');
            return {
                success: false,
                method: 'fc-cache',
                message: 'fc-cache failed. Try manually: fc-cache -fv'
            };
        }

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        Logger.error('SYSTEM', 'Error refreshing font cache', err);
        return {
            success: false,
            method: 'manual',
            message: `Error: ${message}. Try manually: fc-cache -fv`
        };
    }
}
