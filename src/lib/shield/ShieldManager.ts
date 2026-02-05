import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { Logger } from "../logger";
import { Env } from "../env";
import { ManifestParser, type ShieldManifest } from "./manifestParser";

export interface ShieldMetadata {
    fileCount: number;
    timestamp: number;
    policy: string;
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
            fileCount: files.length,
            timestamp: Date.now(),
            policy
        };

        const manifest: ShieldManifest = {
            generatedAt: new Date(metadata.timestamp).toISOString(),
            version: "2.0.0",
            policy: policy as "purge" | "isolate",
            files
        };

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
     * Loads the upsync manifest from disk.
     */
    loadManifest(localDir: string): ShieldManifest {
        const manifestPath = join(localDir, "upsync-manifest.txt");
        if (!existsSync(manifestPath)) {
            return {
                generatedAt: new Date(0).toISOString(),
                version: "2.0.0",
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
                version: "2.0.0",
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
        const missing = manifest.files.filter(f => !existsSync(join(localDir, f)));
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
    }
};
