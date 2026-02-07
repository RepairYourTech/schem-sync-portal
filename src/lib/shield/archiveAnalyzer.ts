import { spawnSync } from "bun";
import { Env } from "../env";
import { Logger } from "../logger";
import { LEAN_MODE_EXCLUDE_PATTERNS, VALUABLE_ARCHIVE_INDICATORS, SAFE_PATTERNS } from "./patterns";

interface ArchiveEngine { type: "7z" | "rar"; bin: string; }

function getEngine(): ArchiveEngine | null {
    const isWin = Env.isWin;
    const sevenZBins = isWin ? ["7z.exe", "7za.exe"] : ["7z", "7za"];
    const rarBins = isWin ? ["rar.exe", "unrar.exe"] : ["rar", "unrar"];
    let bin = Env.findBinary(sevenZBins);
    if (bin) return { type: "7z", bin };
    bin = Env.findBinary(rarBins);
    if (bin) return { type: "rar", bin };
    return null;
}

export interface ArchiveAnalysis {
    hasValuableFiles: boolean;
    hasBloatOnly: boolean;
    listing: string;
}

/**
 * Inspects archive listing to determine if it contains valuable files or only bloat.
 * Uses the same engine logic as cleanup.ts.
 */
export async function analyzeArchiveContent(archivePath: string): Promise<ArchiveAnalysis> {
    let listing = "";
    try {
        const engine = getEngine();
        if (!engine) return { hasValuableFiles: false, hasBloatOnly: false, listing: "" };

        const cmd = engine.type === "7z" ? [engine.bin, "l", archivePath, "-r"] : [engine.bin, "v", archivePath];
        const res = spawnSync(cmd, { timeout: 30_000 });
        listing = res.stdout.toString();
    } catch (err) {
        Logger.error("SHIELD", `Failed to list archive for analysis: ${archivePath}`, err as Error);
        return { hasValuableFiles: false, hasBloatOnly: false, listing: "" };
    }

    const lowerListing = listing.toLowerCase();

    // Check for valuable indicators
    const hasValuableFiles = VALUABLE_ARCHIVE_INDICATORS.some(ind => lowerListing.includes(ind.toLowerCase()));

    // Check if it appears to be bloat-only
    // A file is "bloat only" if it matches exclude patterns AND DOES NOT contain valuable files
    const hasExcludePattern = LEAN_MODE_EXCLUDE_PATTERNS.some(p => lowerListing.includes(p.toLowerCase()));

    // HEURISTIC: If it has "bios" in the name/content but NO boardview/schematic, it's bloat
    // If it has SAFE_PATTERNS (like flash tools) but NO boardview, it's bloat in lean mode
    // We are strict in lean mode: if we don't see value, we skip/purge

    const hasBloatOnly = !hasValuableFiles && (hasExcludePattern || SAFE_PATTERNS.some(p => lowerListing.includes(p)));

    return { hasValuableFiles, hasBloatOnly, listing };
}

/**
 * Determines if an archive should be downloaded/kept in lean mode.
 * @param filename The name of the archive file
 * @param archiveListing Optional pre-fetched listing content
 */
export function shouldDownloadInLeanMode(filename: string, archiveListing?: string): boolean {
    const lowerName = filename.toLowerCase();

    // 1. Explicit Exclusions (Filename based)
    if (LEAN_MODE_EXCLUDE_PATTERNS.some(p => lowerName.includes(p.toLowerCase()))) {
        return false;
    }

    // 2. Explicit Indicators (Filename based)
    if (VALUABLE_ARCHIVE_INDICATORS.some(ind => lowerName.includes(ind.toLowerCase()))) {
        return true;
    }

    // 3. Content Analysis (if listing provided)
    if (archiveListing) {
        const lowerListing = archiveListing.toLowerCase();
        if (VALUABLE_ARCHIVE_INDICATORS.some(ind => lowerListing.includes(ind.toLowerCase()))) {
            return true;
        }
        if (LEAN_MODE_EXCLUDE_PATTERNS.some(p => lowerListing.includes(p.toLowerCase()))) {
            return false;
        }
    }

    // Default: keep ambiguous files to avoid data loss when content analysis is unavailable.
    return true;
}
