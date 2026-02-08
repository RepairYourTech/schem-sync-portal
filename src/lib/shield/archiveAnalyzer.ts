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
 * Keywords that indicate bloat content when found in path segments.
 * These are checked case-insensitively against each folder/file name in the path.
 */
const LEAN_BLOAT_KEYWORDS = ["bios", "firmware", "driver", "drivers", "utility", "utilities", "software", "update", "updates", "me_region", "tools"];

/**
 * Exact folder names that should be blocked (case-insensitive).
 * Used for top-level folder matching like "10 BIOS".
 */
const LEAN_BLOAT_FOLDERS = ["10 bios", "bios", "firmware", "drivers", "driver", "utilities", "utility", "tools", "software", "update", "updates"];

/**
 * Determines if an archive should be downloaded/kept in lean mode.
 * Uses segment-based matching to catch folder names like "10 BIOS" that contain bloat keywords.
 * @param relPath The full relative path of the file
 */
export function shouldDownloadInLeanMode(relPath: string): boolean {
    const lowerPath = relPath.toLowerCase().replace(/\\/g, "/");
    const segments = lowerPath.split("/");

    // Only check DIRECTORY segments (not the filename itself)
    // Files like "update.exe" should pass through to Shield for further inspection
    const directorySegments = segments.slice(0, -1);

    // Check each directory segment for bloat indicators
    for (const segment of directorySegments) {
        // 1. Exact folder name match (e.g., "10 bios" matches folder "10 BIOS")
        if (LEAN_BLOAT_FOLDERS.some(folder => segment === folder)) {
            return false;
        }

        // 2. Keyword detection within segment (e.g., "Various BIOS" contains "bios")
        // Be careful: "autobios.pdf" should pass, but "BIOS dumps" should not
        // We check if the keyword is a word boundary
        for (const keyword of LEAN_BLOAT_KEYWORDS) {
            const keywordIndex = segment.indexOf(keyword);
            if (keywordIndex !== -1) {
                const charBefore: string = keywordIndex === 0 ? " " : (segment[keywordIndex - 1] ?? " ");
                const charAfter: string = keywordIndex + keyword.length >= segment.length ? " " : (segment[keywordIndex + keyword.length] ?? " ");
                // Is it a word boundary? (space, number, start/end, or common separators)
                const isWordBoundaryBefore = /[\s0-9_\-.]/.test(charBefore) || keywordIndex === 0;
                const isWordBoundaryAfter = /[\s0-9_\-.]/.test(charAfter) || (keywordIndex + keyword.length >= segment.length);
                if (isWordBoundaryBefore && isWordBoundaryAfter) {
                    return false;
                }
            }
        }
    }

    // Also check original patterns for explicit paths like /me_region/, /ec/, /fw/
    const isExcluded = LEAN_MODE_EXCLUDE_PATTERNS.some(p => {
        const lowerP = p.toLowerCase().replace(/\\/g, "/");
        const normalizedPattern = lowerP.startsWith("/") ? lowerP : "/" + lowerP;
        return ("/" + lowerPath).includes(normalizedPattern);
    });

    if (isExcluded) {
        return false;
    }

    // Everyone else passes through to the "Integrity" layer (Shield)
    return true;
}
