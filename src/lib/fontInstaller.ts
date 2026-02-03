import { spawnSync } from "bun";
import { writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { Env } from "./env";
import { Logger } from "./logger";
import { detectNerdFonts } from "./doctor";

let _spawnSync = spawnSync;
let _fetch = fetch;
let _readdirSync = readdirSync;
let _copyFileSync = copyFileSync;
let _mkdirSync = mkdirSync;
let _existsSync = existsSync;
let _writeFileSync = writeFileSync;
let _rmSync = rmSync;

/** @internal - Exported for testing only */
export function __setSpawnSync(mock: typeof spawnSync) {
    _spawnSync = mock;
}

/** @internal - Exported for testing only */
export function __setFilesystem(mocks: {
    mkdirSync?: typeof mkdirSync;
    existsSync?: typeof existsSync;
    writeFileSync?: typeof writeFileSync;
    rmSync?: typeof rmSync;
    readdirSync?: typeof readdirSync;
    copyFileSync?: typeof copyFileSync;
}) {
    if (mocks.mkdirSync) _mkdirSync = mocks.mkdirSync;
    if (mocks.existsSync) _existsSync = mocks.existsSync;
    if (mocks.writeFileSync) _writeFileSync = mocks.writeFileSync;
    if (mocks.rmSync) _rmSync = mocks.rmSync;
    if (mocks.readdirSync) _readdirSync = mocks.readdirSync;
    if (mocks.copyFileSync) _copyFileSync = mocks.copyFileSync;
}

/** @internal - Exported for testing only */
export function __setFetch(mock: typeof fetch) {
    _fetch = mock;
}

export type NerdFontName = "JetBrainsMono" | "FiraCode" | "Hack" | "Meslo" | "CascadiaCode";

export interface InstallOptions {
    font: NerdFontName;
    version: 3;
    onProgress?: (progress: { stage: string; percent: number }) => void;
    signal?: AbortSignal;
}

export interface InstallResult {
    success: boolean;
    installedPath: string;
    installedFamily: string;
    error?: string;
    requiresRestart: boolean;
}

/**
 * Installs a Nerd Font based on the provided options.
 */
export async function installNerdFont(options: InstallOptions): Promise<InstallResult> {
    const { font, onProgress, signal } = options;
    const tmpDir = join(Env.getPaths().configDir, 'font-install-tmp');
    const zipPath = join(tmpDir, `${font}.zip`);

    // Determine target directory
    const home = Env.getPaths().home;
    let targetDir = "";
    if (Env.isWin) {
        targetDir = join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Fonts');
    } else if (Env.isMac) {
        targetDir = join(home, 'Library', 'Fonts');
    } else {
        targetDir = join(home, '.local', 'share', 'fonts');
    }

    try {
        Logger.info('SYSTEM', `Starting installation of ${font} Nerd Font`);
        onProgress?.({ stage: 'starting', percent: 10 });

        // Create temporary directory
        if (!_existsSync(tmpDir)) {
            _mkdirSync(tmpDir, { recursive: true });
        }

        if (signal?.aborted) return { success: false, installedPath: '', installedFamily: font, error: 'Installation Canceled', requiresRestart: false };

        const url = `https://github.com/ryanoasis/nerd-fonts/releases/latest/download/${font}.zip`;
        onProgress?.({ stage: 'downloading', percent: 20 });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        if (signal) {
            signal.addEventListener('abort', () => controller.abort());
        }

        let response;
        try {
            response = await _fetch(url, { signal: controller.signal });
        } catch (err: unknown) {
            const isAborted = (signal?.aborted) || (err instanceof Error && err.name === 'AbortError');
            if (isAborted) {
                return { success: false, installedPath: '', installedFamily: font, error: 'Installation Canceled', requiresRestart: false };
            }
            const message = err instanceof Error ? err.message : String(err);
            Logger.error('SYSTEM', `Network error during font download: ${message}`);
            return { success: false, installedPath: '', installedFamily: font, error: 'Network error', requiresRestart: false };
        } finally {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            Logger.error('SYSTEM', `Failed to download font: ${response.status} ${response.statusText}`);
            return { success: false, installedPath: '', installedFamily: font, error: `Download failed: ${response.status}`, requiresRestart: false };
        }

        const contentLength = response.headers.get('Content-Length');
        if (contentLength && parseInt(contentLength, 10) > 200 * 1024 * 1024) {
            Logger.error('SYSTEM', 'Font archive is too large (> 200MB)');
            return { success: false, installedPath: '', installedFamily: font, error: 'Font archive too large', requiresRestart: false };
        }

        const arrayBuffer = await response.arrayBuffer();
        if (signal?.aborted) return { success: false, installedPath: '', installedFamily: font, error: 'Installation Canceled', requiresRestart: false };
        _writeFileSync(zipPath, Buffer.from(arrayBuffer));
        onProgress?.({ stage: 'downloading', percent: 50 });
        Logger.info('SYSTEM', 'Downloaded font archive');

        // 2. Extract Phase
        onProgress?.({ stage: 'extracting', percent: 60 });
        const archiveTool = Env.findBinary(['7z', '7za', 'unzip']);
        if (!archiveTool) {
            return { success: false, installedPath: '', installedFamily: font, error: 'No extraction tool found', requiresRestart: false };
        }

        let extractResult;
        if (archiveTool.endsWith('7z') || archiveTool.endsWith('7za')) {
            extractResult = _spawnSync([archiveTool, 'e', zipPath, '*.ttf', '*.otf', `-o${tmpDir}`, '-r', '-y']);
        } else {
            extractResult = _spawnSync([archiveTool, '-j', zipPath, '*.ttf', '*.otf', '-d', tmpDir]);
        }

        if (!extractResult.success) {
            Logger.error('SYSTEM', 'Font extraction failed');
            return { success: false, installedPath: '', installedFamily: font, error: 'Extraction failed', requiresRestart: false };
        }

        const variantPattern = /^[^-]+-?(Regular|Bold|Italic|BoldItalic)?\.(ttf|otf)$/i;
        const files = _readdirSync(tmpDir, { withFileTypes: true });
        const fontFiles = files
            .filter((f) => f.isFile() && variantPattern.test(f.name))
            .slice(0, 4);

        if (fontFiles.length === 0) {
            return { success: false, installedPath: '', installedFamily: font, error: 'No valid font files found in archive', requiresRestart: false };
        }

        onProgress?.({ stage: 'extracting', percent: 70 });
        Logger.debug('SYSTEM', 'Extracted font files');

        // 3. Install Phase
        if (signal?.aborted) return { success: false, installedPath: '', installedFamily: font, error: 'Installation Canceled', requiresRestart: false };
        onProgress?.({ stage: 'installing', percent: 80 });
        if (!_existsSync(targetDir)) {
            _mkdirSync(targetDir, { recursive: true });
        }

        for (const file of fontFiles) {
            if (signal?.aborted) return { success: false, installedPath: '', installedFamily: font, error: 'Installation Canceled', requiresRestart: false };
            // Sanitize: ensure no path traversal (though readdirSync should be safe)
            const safeName = file.name.replace(/[\\/]/g, '_');
            _copyFileSync(join(tmpDir, file.name), join(targetDir, safeName));
        }

        onProgress?.({ stage: 'installing', percent: 90 });
        Logger.info('SYSTEM', 'Installed fonts to ' + targetDir);

        // Update font cache on Linux
        if (!Env.isWin && !Env.isMac) {
            onProgress?.({ stage: 'refreshing-cache', percent: 95 });
            Logger.info('SYSTEM', 'Refreshing font cache...');
            _spawnSync(['fc-cache', '-f']);
        }

        // 4. Verify Phase
        const detection = await detectNerdFonts();
        if (!detection.isInstalled || detection.version !== 3) {
            Logger.error('SYSTEM', 'Post-install verification failed: Font not detected or version mismatch');
            return {
                success: false,
                installedPath: targetDir,
                installedFamily: font,
                error: 'Installation verification failed: Font not detected as v3 after install',
                requiresRestart: Env.isWin
            };
        }

        onProgress?.({ stage: 'complete', percent: 100 });
        return { success: true, installedPath: targetDir, installedFamily: font, requiresRestart: Env.isWin };

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        Logger.error('SYSTEM', 'Font installation failed', err);
        return { success: false, installedPath: '', installedFamily: font, error: message || 'Unknown error', requiresRestart: false };
    } finally {
        try {
            if (_existsSync(tmpDir)) {
                _rmSync(tmpDir, { recursive: true, force: true });
            }
        } catch {
            Logger.debug('SYSTEM', 'Failed to cleanup font-install-tmp directory');
        }
    }
}
