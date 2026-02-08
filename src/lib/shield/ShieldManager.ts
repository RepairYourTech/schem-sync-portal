import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { Logger } from "../logger";
import { Env } from "../env";
import { ManifestParser } from "./manifestParser";
import { type ShieldManifest } from "./types";
import { PRIORITY_FILENAMES, LEAN_MODE_EXCLUDE_PATTERNS } from "./patterns";
import pkg from "../../../package.json";

export interface ShieldMetadata {
    generatedAt: string;
    fileCount: number;
    timestamp: number;
    policy: "purge" | "isolate" | "extract";
}

export const ShieldManager = {
    /**
     * Resets the local shield state.
     */
    resetShield(localDir: string) {
        Logger.info("SHIELD", `Resetting shield state in ${localDir}`);
        const excludeFile = Env.getExcludeFilePath(localDir);
        const offenderList = Env.getOffenderListPath(localDir);

        try {
            if (existsSync(excludeFile)) writeFileSync(excludeFile, "");
            if (existsSync(offenderList)) writeFileSync(offenderList, "[]");
            Logger.info("SHIELD", "Shield state reset successfully.");
        } catch (err) {
            Logger.error("SHIELD", "Failed to reset shield state", err as Error);
        }
    },

    /**
     * Saves the upsync manifest to disk.
     */
    saveUpsyncManifest(localDir: string, files: string[], policy: string): ShieldMetadata {
        const manifestPath = join(localDir, "upsync-manifest.txt");
        const metadata: ShieldMetadata = {
            generatedAt: new Date().toISOString(),
            fileCount: files.length,
            timestamp: Date.now(),
            policy: policy as "purge" | "isolate" | "extract"
        };

        const filteredFiles = files.filter(f => {
            const low = f.toLowerCase();
            return !low.startsWith("_risk_tools") && !low.startsWith("_shield_isolated");
        });

        const manifest: ShieldManifest = {
            generatedAt: new Date(metadata.timestamp).toISOString(),
            version: pkg.version,
            policy: policy as "purge" | "isolate" | "extract",
            files: filteredFiles
        };

        metadata.fileCount = filteredFiles.length;

        try {
            writeFileSync(manifestPath, ManifestParser.stringify(manifest), "utf8");
            Logger.info("SHIELD", `Saved manifest to ${manifestPath} (${files.length} files)`);
            return metadata;
        } catch (err) {
            Logger.error("SHIELD", `Failed to save manifest to ${manifestPath}`, err as Error);
            throw err;
        }
    },

    /**
     * Incrementally updates the existing upsync manifest.
     */
    updateUpsyncManifest(localDir: string, newFiles: string[]): ShieldMetadata {
        const manifest = this.loadManifest(localDir);
        const existingFiles = new Set(manifest.files);
        let addedCount = 0;

        for (const file of newFiles) {
            if (!existingFiles.has(file)) {
                manifest.files.push(file);
                existingFiles.add(file);
                addedCount++;
            }
        }

        if (addedCount === 0) {
            return {
                generatedAt: manifest.generatedAt,
                fileCount: manifest.files.length,
                timestamp: Date.now(),
                policy: manifest.policy
            };
        }

        manifest.generatedAt = new Date().toISOString();
        const metadata: ShieldMetadata = {
            generatedAt: manifest.generatedAt,
            fileCount: manifest.files.length,
            timestamp: Date.now(),
            policy: manifest.policy
        };

        const manifestPath = join(localDir, "upsync-manifest.txt");
        try {
            writeFileSync(manifestPath, ManifestParser.stringify(manifest), "utf8");
            Logger.info("SHIELD", `Updated manifest at ${manifestPath} (added ${addedCount} files, total ${manifest.files.length})`);
            return metadata;
        } catch (err) {
            Logger.error("SHIELD", `Failed to update manifest at ${manifestPath}`, err as Error);
            throw err;
        }
    },

    /**
     * Loads the upsync manifest from disk.
     */
    loadManifest(localDir: string): ShieldManifest {
        const manifestPath = join(localDir, "upsync-manifest.txt");
        if (!existsSync(manifestPath)) {
            return {
                generatedAt: new Date(0).toISOString(),
                version: "1.0.0-alpha.1",
                policy: "purge",
                files: []
            };
        }

        try {
            const content = readFileSync(manifestPath, "utf8");
            return ManifestParser.parse(content);
        } catch (err) {
            Logger.error("SHIELD", `Failed to load manifest from ${manifestPath}`, err as Error);
            return {
                generatedAt: new Date(0).toISOString(),
                version: "1.0.0-alpha.1",
                policy: "purge",
                files: []
            };
        }
    },

    /**
     * Verifies that all files in the manifest actually exist on disk.
     */
    verifyManifest(localDir: string): { total: number; missing: string[]; valid: boolean } {
        const manifest = this.loadManifest(localDir);
        const missing = manifest.files.filter((f: string) => !existsSync(join(localDir, f)));
        return {
            total: manifest.files.length,
            missing,
            valid: missing.length === 0
        };
    },

    /**
     * Appends an offender to the offender list.
     */
    addOffender(localDir: string, relPath: string, reason: string) {
        const listPath = Env.getOffenderListPath(localDir);
        let offenders: { path: string; reason: string; timestamp: number }[] = [];

        if (existsSync(listPath)) {
            try {
                offenders = JSON.parse(readFileSync(listPath, "utf8"));
            } catch {
                offenders = [];
            }
        }

        offenders.push({
            path: relPath,
            reason,
            timestamp: Date.now()
        });

        writeFileSync(listPath, JSON.stringify(offenders, null, 2), "utf8");
    },

    /**
     * Merges user exclusions with internal shield exclusions.
     */
    updateExclusions(localDir: string, patterns: string[]) {
        const excludeFile = Env.getExcludeFilePath(localDir);
        let currentPatterns: string[] = [];

        if (existsSync(excludeFile)) {
            currentPatterns = readFileSync(excludeFile, "utf8")
                .split("\n")
                .map(l => l.trim())
                .filter(l => l && !l.startsWith("#"));
        }

        const merged = Array.from(new Set([...currentPatterns, ...patterns]));
        writeFileSync(excludeFile, merged.join("\n"), "utf8");
    },

    /**
     * Gets the list of previously identified offenders.
     */
    getOffenders(localDir: string): string[] {
        const listPath = Env.getOffenderListPath(localDir);
        if (!existsSync(listPath)) return [];
        try {
            const offenders = JSON.parse(readFileSync(listPath, "utf8"));
            return Array.isArray(offenders) ? offenders.map((o: { path: string }) => o.path) : [];
        } catch {
            return [];
        }
    },

    /**
     * Gets the static list of filenames and extensions that trigger immediate shielding.
     */
    getPriorityFilenames(): string[] {
        return [...PRIORITY_FILENAMES];
    },

    /**
     * Checks if a path should be filtered based on BIOS/Lean Mode patterns.
     */
    isFilteredPath(relPath: string): boolean {
        const lower = relPath.toLowerCase().replace(/\\/g, "/");
        // Check for exact matches with boundaries
        const matches = LEAN_MODE_EXCLUDE_PATTERNS.some((p: string) => {
            const lowerP = p.toLowerCase().replace(/\\/g, "/");
            // If pattern starts with /, check if path starts with it (after root normalization) or contains it
            if (lowerP.startsWith("/")) {
                return ("/" + lower).includes(lowerP);
            }
            return lower.includes(lowerP);
        });
        if (matches) Logger.info("SHIELD", `Path ${relPath} matched an exclude pattern.`);
        return matches;
    }
};
