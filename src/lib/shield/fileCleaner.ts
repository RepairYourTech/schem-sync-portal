import { join, relative, basename } from "path";
import { existsSync, unlinkSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { Logger } from "../logger";
import { ShieldManager } from "./ShieldManager";
import { KEEP_EXTS, GARBAGE_PATTERNS, PRIORITY_FILENAMES, LEAN_STRICT_WHITELIST, LEAN_STRICT_BLACKLIST } from "./patterns";
import type { CleanupStats } from "../sync/types";

/**
 * Inspects a single standalone (non-archive) file and removes it if it is a threat
 * or, in lean mode, if it is not a schematic file type.
 *
 * Returns true when the file was removed.
 */
export async function cleanFile(
    filePath: string, baseDir: string, policy: "purge" | "isolate" | "extract",
    stats?: CleanupStats, onProgress?: (stats: CleanupStats) => void,
    mode: "full" | "lean" = "full"
): Promise<boolean> {
    // Contract: Extract policy strictly trusts source content (bypass all surgery)
    if (policy === "extract") return false;

    const relPath = relative(baseDir, filePath);
    const fileName = basename(relPath);
    const ext = "." + (fileName.split(".").pop() || "").toLowerCase();

    // LEAN MODE: Surgical Whitelist Filtering
    if (mode === "lean") {
        if (LEAN_STRICT_WHITELIST.includes(ext.toLowerCase())) return false;
        // If not in whitelist, treat as bloat (continue to purge/isolate logic)
        Logger.info("SHIELD", `Lean Mode: Detected non-essential bloat: ${relPath}`);
    } else {
        // FULL MODE: Standard Extension Protection
        if (KEEP_EXTS.includes(ext)) return false;
    }

    // Distinguish "this is a threat" from "this is not a schematic file type". Only the
    // former may later justify deleting the file from the user's cloud storage.
    const matchedMalware = PRIORITY_FILENAMES.some(p => p.toLowerCase() === fileName.toLowerCase()) ||
        GARBAGE_PATTERNS.some(p => fileName.toLowerCase().includes(p.toLowerCase())) ||
        (mode === "lean" && LEAN_STRICT_BLACKLIST.includes(ext.toLowerCase()));

    const isGarbage = matchedMalware ||
        (mode === "lean" && !LEAN_STRICT_WHITELIST.includes(ext.toLowerCase()));

    if (isGarbage) {
        if (mode !== "lean") {
            Logger.info("SHIELD", `Detected risky individual file: ${relPath}`);
        }
        if (stats) {
            stats.riskyPatternCount++;
            stats.currentArchive = relPath; // Handle individual file as "currentArchive" for UI
            if (onProgress) onProgress(stats);
        }
        const riskDir = join(baseDir, "_risk_tools");
        try {
            if (policy === "isolate") {
                if (!existsSync(riskDir)) mkdirSync(riskDir, { recursive: true });
                const dest = join(riskDir, fileName);
                const fileData = readFileSync(filePath);
                writeFileSync(dest, fileData);
                if (!existsSync(dest)) throw new Error("Isolation copy failed.");
                unlinkSync(filePath);
                if (existsSync(filePath)) throw new Error("Isolation original removal failed.");
                if (stats) stats.isolatedFiles++;
                Logger.info("SHIELD", (mode === "lean" ? `Lean Mode: Isolated bloat: ${relPath}` : `Isolated individual file: ${relPath}`));
            } else {
                unlinkSync(filePath);
                if (existsSync(filePath)) throw new Error("Purge failed.");
                if (stats) stats.purgedFiles++;
                Logger.info("SHIELD", (mode === "lean" ? `Lean Mode: Purged bloat: ${relPath}` : `Purged individual file: ${relPath}`));
            }
            ShieldManager.addOffender(
                baseDir,
                relPath,
                matchedMalware ? "File matches malware pattern" : "Lean Mode: Excess data stripped",
                matchedMalware ? "malware" : "bloat"
            );
            ShieldManager.updateExclusions(baseDir, [relPath]);
            if (stats && onProgress) onProgress(stats);
            return true;
        } catch (e) {
            Logger.error("SYNC", `Failed to ${policy} item: ${relPath}`, e);
            return false;
        }
    }
    return false;
}
