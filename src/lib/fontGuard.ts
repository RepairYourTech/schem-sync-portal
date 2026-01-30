import { Logger } from "./logger";
import { detectNerdFonts } from "./doctor";
import type { PortalConfig } from "./config";

export interface FontGuardStatus {
    isInstalled: boolean;
    version: 2 | 3 | null;
    requiresInstallation: boolean;
    requiresUpgrade: boolean;
    canAutoInstall: boolean;
    message: string;
    installedFamily: string | null;
}

/**
 * Checks if Nerd Fonts are installed and determines if any action is needed.
 * Implements a 7-day cache for detection results.
 */
export async function checkFontGuard(config: PortalConfig): Promise<FontGuardStatus> {
    const SEVEN_DAYS_MS = 604800000;

    // Check cache
    if (config.nerd_font_last_check && (Date.now() - config.nerd_font_last_check < SEVEN_DAYS_MS)) {
        Logger.debug('SYSTEM', 'Font check skipped (recently verified)');
        return {
            isInstalled: true, // Assume true if we're skipping
            version: config.nerd_font_version || 3,
            requiresInstallation: false,
            requiresUpgrade: false,
            canAutoInstall: true,
            message: 'Font check skipped (recently verified)',
            installedFamily: config.nerd_font_installed_family || null
        };
    }

    Logger.debug('SYSTEM', 'Performing fresh Nerd Font detection');
    const detection = await detectNerdFonts();
    const installedFamily = detection.installedFonts.length > 0 ? detection.installedFonts[0] : null;

    const status: FontGuardStatus = {
        isInstalled: detection.isInstalled,
        version: detection.version,
        requiresInstallation: false,
        requiresUpgrade: false,
        canAutoInstall: true, // Ready for Phase 2
        message: '',
        installedFamily: installedFamily || null
    };

    if (!detection.isInstalled) {
        status.requiresInstallation = true;
        status.message = 'Nerd Fonts not detected. Install recommended for optimal experience.';
    } else if (detection.version === 2) {
        status.requiresUpgrade = true;
        status.message = 'Nerd Fonts v2 detected. Upgrade to v3 recommended.';
    } else if (detection.version === 3) {
        status.message = 'Nerd Fonts v3 detected and ready.';
    }

    Logger.debug('SYSTEM', `Font Guard Result: ${status.message}`);

    return status;
}
