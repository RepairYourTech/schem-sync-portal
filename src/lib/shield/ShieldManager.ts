import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { Env } from "../env";
import { Logger } from "../logger";
import { PRIORITY_FILENAMES } from "./patterns";

/**
 * Manages the persistent list of identified malicious assets.
 */
export const ShieldManager = {
    /**
     * Get the current set of offenders (relative paths).
     * Returns ONLY files that have actually been processed by the shield.
     */
    getOffenders(localDir: string): string[] {
        const path = Env.getOffenderListPath(localDir);
        if (!existsSync(path)) return [];  // Start empty - only processed files
        try {
            const data = readFileSync(path, "utf-8");
            const parsed = JSON.parse(data);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            Logger.error("SHIELD", "Failed to load offender list", e);
        }
        return [];
    },

    /**
     * Get the static priority filenames list (for download ordering).
     * These are known risky files that should be downloaded and processed first.
     */
    getPriorityFilenames(): string[] {
        return [...PRIORITY_FILENAMES];
    },

    /**
     * Add a path to the offender list persistently.
     */
    addOffender(relPath: string, localDir: string) {
        const offenders = this.getOffenders(localDir);
        if (!offenders.includes(relPath)) {
            offenders.push(relPath);
            Logger.info("SHIELD", `Added new offender to blocklist: ${relPath}`);
            this.saveOffenders(offenders, localDir);
            this.syncWithRclone(localDir);
        }
    },

    /**
     * Save the list to disk.
     */
    saveOffenders(offenders: string[], localDir: string) {
        const path = Env.getOffenderListPath(localDir);
        try {
            // localD ir is the parent, just ensure it exists
            if (!existsSync(localDir)) mkdirSync(localDir, { recursive: true });
            writeFileSync(path, JSON.stringify(offenders, null, 2));
        } catch (e) {
            Logger.error("SHIELD", "Failed to save offender list", e);
        }
    },

    /**
     * Clear custom offenders and revert to defaults.
     */
    resetShield(localDir: string) {
        const offenderPath = Env.getOffenderListPath(localDir);
        const excludePath = Env.getExcludeFilePath(localDir);

        try { if (existsSync(offenderPath)) unlinkSync(offenderPath); } catch { /* ignore */ }
        try { if (existsSync(excludePath)) unlinkSync(excludePath); } catch { /* ignore */ }

        this.syncWithRclone(localDir);
        Logger.info("SHIELD", "Intelligence reset to defaults. All history cleared.");
    },

    /**
     * Synchronize the offender list with rclone's exclusion file.
     */
    syncWithRclone(localDir: string) {
        const excludeFile = Env.getExcludeFilePath(localDir);
        const offenders = this.getOffenders(localDir);

        try {
            if (!existsSync(localDir)) mkdirSync(localDir, { recursive: true });

            // Overwrite with current offenders + metadata path
            const entries = [...offenders, "_risk_tools/**"];
            writeFileSync(excludeFile, entries.join("\n") + "\n");
        } catch (e) {
            Logger.error("SHIELD", "Failed to sync exclusion file", e);
        }
    }
};
