import { spawnSync as bunSpawnSync } from "bun";
import { join, relative, dirname, basename } from "path";
import { existsSync, unlinkSync, mkdirSync, readFileSync, writeFileSync, rmSync, renameSync } from "fs";
import { stat } from "fs/promises";
import { glob } from "glob";
import { Env } from "./env";
import { Logger } from "./logger";
import { ShieldManager } from "./shield/ShieldManager";
import { KEEP_EXTS, GARBAGE_PATTERNS, PRIORITY_FILENAMES, SAFE_PATTERNS, LEAN_STRICT_WHITELIST, LEAN_STRICT_BLACKLIST } from "./shield/patterns";
import type { CleanupStats, SyncProgress } from "./sync/types";

let _overrideSpawnSync: typeof bunSpawnSync | null = null;
export function __setSpawnSync(mock: typeof bunSpawnSync) { _overrideSpawnSync = mock; }
function getSpawnSync() { return _overrideSpawnSync || bunSpawnSync; }

interface ArchiveEngine { type: "7z" | "rar"; bin: string; }
function getArchiveEngine(): ArchiveEngine | null {
    const isWin = Env.isWin;
    const sevenZBins = isWin ? ["7z.exe", "7za.exe"] : ["7z", "7za"];
    const rarBins = isWin ? ["rar.exe", "unrar.exe"] : ["rar", "unrar"];
    let bin = Env.findBinary(sevenZBins);
    if (bin) return { type: "7z", bin };
    bin = Env.findBinary(rarBins);
    if (bin) return { type: "rar", bin };
    return null;
}
let _overrideEngine: ArchiveEngine | null = null;
export function __setArchiveEngine(mock: ArchiveEngine | null) { _overrideEngine = mock; }
function getEngine(): ArchiveEngine | null { return _overrideEngine !== null ? _overrideEngine : getArchiveEngine(); }

export interface CleanupResult { completed: boolean; scannedArchives: string[]; unscannedArchives: string[]; }

export async function runCleanupSweep(
    targetDir: string,
    excludeFile: string,
    policy: "purge" | "isolate" | "extract",
    onProgress?: (stats: CleanupStats | Partial<SyncProgress>) => void,
    abortSignal?: AbortSignal,
    initialStats?: CleanupStats,
    mode: "full" | "lean" = "full"
): Promise<CleanupResult> {
    const scannedArchives: string[] = [];
    const unscannedArchives: string[] = [];
    const engine = getEngine();

    try {
        const archives = await glob("**/*.{zip,7z,rar}", { cwd: targetDir, absolute: true, ignore: ["**/node_modules/**", "**/.git/**"] });

        const stats: CleanupStats = initialStats || {
            phase: "clean", totalArchives: archives.length, scannedArchives: 0, safePatternCount: 0, riskyPatternCount: 0,
            cleanArchives: 0, flaggedArchives: 0, extractedFiles: 0, purgedFiles: 0, isolatedFiles: 0, policyMode: policy
        };

        // Ensure totalArchives is updated if reusing stats
        stats.totalArchives = archives.length;
        if (onProgress) onProgress(stats);

        // PHASE 1: Archive Scanning
        if (engine) {
            for (let i = 0; i < archives.length; i++) {
                const archivePath = archives[i]!;
                const relPath = relative(targetDir, archivePath).replace(/\\/g, "/");

                // FIX: Path Filtering Bypass - Check full path for BIOS exclusions in Lean Mode
                if (mode === "lean" && ShieldManager.isFilteredPath(relPath)) {
                    Logger.info("SHIELD", `Lean Mode: Skipping excluded archive path: ${relPath}`);
                    unscannedArchives.push(relPath);
                    continue;
                }

                if (abortSignal?.aborted) {
                    for (let j = i; j < archives.length; j++) unscannedArchives.push(relative(targetDir, archives[j]!));
                    return { completed: false, scannedArchives, unscannedArchives };
                }
                stats.currentArchive = relPath;
                stats.scannedArchives++;
                if (onProgress) onProgress(stats);
                const result = await cleanArchive(archivePath, targetDir, excludeFile, policy, stats, onProgress, mode);
                scannedArchives.push(relPath);
                if (result.failed) {
                    Logger.error("SYNC", `Shield: CRITICAL FAILURE during ${policy} of ${relPath}.`);
                    if (onProgress) onProgress({ ...stats, phase: "clean", description: `Shield ERROR: Failed to ${policy} ${relPath}.` });
                    return { completed: false, scannedArchives, unscannedArchives: archives.slice(i + 1).map(a => relative(targetDir, a)) };
                }
                if (result.flagged) stats.flaggedArchives++; else stats.cleanArchives++;
            }
        } else {
            Logger.warn("SYSTEM", "Shield Archive Loop: Skipped (Tools not found).");
            // If no engine, all archives are unscanned (but respect lean mode filtering)
            for (const a of archives) {
                const relPath = relative(targetDir, a).replace(/\\/g, "/");
                if (mode === "lean" && ShieldManager.isFilteredPath(relPath)) {
                    unscannedArchives.push(relPath);
                    continue;
                }
                unscannedArchives.push(relPath);
            }
        }
        stats.currentArchive = undefined;

        // PHASE 2: Standalone File Scanning
        if (policy === "extract") {
            Logger.info("SHIELD", "Extract Policy: Skipping standalone file scanning phase (Trust Source).");
        } else {
            if (onProgress) onProgress(stats);
            Logger.info("SHIELD", "Starting standalone file scanning phase");

            try {
                const standaloneFiles = await glob("**/*", {
                    cwd: targetDir,
                    absolute: true,
                    ignore: [
                        "**/node_modules/**",
                        "**/.git/**",
                        "**/_risk_tools/**",
                        "**/_shield_isolated/**",
                        "**/*.zip",
                        "**/*.7z",
                        "**/*.rar"
                    ]
                });

                stats.totalStandaloneFiles = standaloneFiles.length;
                const extractedFileSet = new Set(stats.extractedFilePaths || []);

                for (let i = 0; i < standaloneFiles.length; i++) {
                    if (abortSignal?.aborted) break;

                    const filePath = standaloneFiles[i]!;
                    const relPath = relative(targetDir, filePath);

                    // Skip already-verified extracted files
                    if (extractedFileSet.has(relPath)) continue;

                    stats.scannedStandaloneFiles = i + 1;
                    stats.currentStandaloneFile = relPath;
                    if (onProgress) onProgress(stats);

                    const isFile = (await stat(filePath)).isFile();
                    if (isFile) {
                        const cleaned = await cleanFile(filePath, targetDir, policy, stats, onProgress, mode);
                        if (cleaned) {
                            stats.flaggedStandaloneFiles = (stats.flaggedStandaloneFiles || 0) + 1;
                        }
                    }
                }

                stats.currentStandaloneFile = undefined;
                Logger.info("SHIELD", `Standalone file scan complete: ${stats.scannedStandaloneFiles} scanned, ${stats.flaggedStandaloneFiles} flagged`);
            } catch (err) {
                Logger.error("SHIELD", "Error during standalone file scanning", err);
            }
        }

        if (onProgress) onProgress(stats);
        Logger.info("SHIELD", `Cleanup sweep finished. Scanned ${stats.scannedArchives}/${stats.totalArchives} archives. Found ${stats.flaggedArchives} threats and ${stats.riskyPatternCount} patterns. Extracted ${stats.extractedFiles} verified items.`);
        return { completed: true, scannedArchives, unscannedArchives: [] };
    } catch (err) {
        Logger.error("SYNC", "Error during cleanup sweep", err);
        return { completed: false, scannedArchives, unscannedArchives };
    }
}

interface CleanArchiveResult { flagged: boolean; extractedCount: number; failed?: boolean; }

async function cleanArchive(
    archivePath: string, baseDir: string, excludeFile: string, policy: "purge" | "isolate" | "extract",
    stats: CleanupStats, onProgress?: (stats: CleanupStats) => void, mode: "full" | "lean" = "full"
): Promise<CleanArchiveResult> {
    const relPath = relative(baseDir, archivePath);
    let internalListing = "";
    try {
        const engine = getEngine();
        if (!engine) return { flagged: false, extractedCount: 0 };
        const cmd = engine.type === "7z" ? [engine.bin, "l", archivePath, "-r"] : [engine.bin, "v", archivePath];
        internalListing = getSpawnSync()(cmd).stdout.toString();
    } catch (err) {
        Logger.error("SYNC", `Failed to peek inside archive: ${relPath}`, err);
        internalListing = ""; // Ensure it triggers invalid listing check
    }

    // Validate archive listing
    const isValidListing = (listing: string): boolean => {
        if (!listing || listing.trim().length === 0) return false;

        // Check for error indicators
        const errorKeywords = ["error", "failed", "cannot open", "corrupted", "invalid"];
        const lowerListing = listing.toLowerCase();
        if (errorKeywords.some(kw => lowerListing.includes(kw))) return false;

        // Check if listing contains at least one file entry (basic heuristic)
        const hasFileEntries = /\.\w{2,4}\s|^\s*\d+\s+\d{4}-\d{2}-\d{2}/m.test(listing);
        return hasFileEntries;
    };

    const fileName = basename(relPath);
    let failSafeTriggered = false;

    if (!isValidListing(internalListing)) {
        Logger.warn("SHIELD", `Archive listing validation failed for ${relPath} - treating as suspicious (fail-safe)`);
        stats.invalidListingArchives = (stats.invalidListingArchives || 0) + 1;
        failSafeTriggered = true;
    }

    const isKnownBad = PRIORITY_FILENAMES.some(p => p.toLowerCase() === fileName.toLowerCase());

    // Context-aware garbage detection
    const hasGarbage = failSafeTriggered || isKnownBad || (() => {
        const lowerListing = internalListing.toLowerCase();
        if (GARBAGE_PATTERNS.some(p => lowerListing.includes(p.toLowerCase()))) return true;

        const mediumConfidence = ["activator", "bypass", "medicine", "fixed"];
        const hasMedium = mediumConfidence.some(p => {
            if (!lowerListing.includes(p)) return false;
            return lowerListing.includes(p + ".exe") ||
                lowerListing.includes(p + "/") ||
                lowerListing.includes("/" + p);
        });

        if (hasMedium) {
            const hasSafe = SAFE_PATTERNS.some((p: string) => lowerListing.includes(p.toLowerCase()));
            if (hasSafe) {
                Logger.info("SHIELD", `Archive ${fileName} contains safe patterns, suppressing medium-confidence alert.`);
                return false;
            }
            return true;
        }
        return false;
    })();

    // DECISION: Decouple extraction from detection. Always extract unless policy prohibits.
    const dirPath = dirname(archivePath);
    const stagingDir = join(dirPath, `.shield_staging_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    let extractedCount = 0;

    try {
        if (!existsSync(stagingDir)) mkdirSync(stagingDir, { recursive: true });
        const engine = getEngine();
        if (engine) {
            // Determine patterns to extract: schematic files + nested archives
            // If policy is "extract", we extract ALL files (*)
            const extractPatterns = policy === "extract" ? ["*"] : [...KEEP_EXTS, ".zip", ".7z", ".rar"];

            for (const pattern of extractPatterns) {
                // Determine if we need a wildcard prefix
                const globPattern = pattern === "*" ? "*" : `*${pattern}`;

                const extractCmd = engine.type === "7z"
                    ? [engine.bin, "x", archivePath, globPattern, `-o${stagingDir}`, "-r", "-y"]
                    : [engine.bin, "x", "-r", "-y", archivePath, globPattern, stagingDir];

                const spawnRes = getSpawnSync()(extractCmd);
                if (spawnRes.success) {
                    const patternToGlob = pattern === "*" ? "**/*" : `**/*${pattern}`;
                    const matches = await glob(patternToGlob, { cwd: stagingDir, absolute: true });

                    for (const match of matches) {
                        const isFile = (await stat(match)).isFile();
                        if (!isFile) continue;

                        const relativeToStaging = relative(stagingDir, match);
                        const destPath = join(dirPath, relativeToStaging); // FIX: Preserve folder structure
                        const relExtracted = relative(baseDir, destPath);

                        // Ensure destination directory exists
                        const destSubDir = dirname(destPath);
                        if (!existsSync(destSubDir)) mkdirSync(destSubDir, { recursive: true });

                        if (!existsSync(destPath)) {
                            renameSync(match, destPath);

                            // Skip deep verification if policy is "extract" (trust source)
                            if (policy !== "extract") {
                                await cleanFile(destPath, baseDir, policy, stats, onProgress, mode);
                            }

                            if (existsSync(destPath)) {
                                Logger.info("SHIELD", `Extracted: ${relExtracted} from ${fileName}`);
                                extractedCount++;
                                const paths = stats.extractedFilePaths || [];
                                paths.push(relExtracted);
                                stats.extractedFilePaths = paths;
                            }
                        }
                    }
                }
            }

            // RECURSIVE SCANNING: Skip if policy is "extract"
            if (policy !== "extract") {
                await scanForNestedArchives(stagingDir, baseDir, policy, stats, onProgress, mode);
            }
        }
    } catch (err) {
        Logger.error("SHIELD", `Error during extraction from ${relPath}`, err);
    } finally {
        try { if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }

    stats.extractedFiles += extractedCount;

    // Handle "extract" policy (Trust Source)
    if (policy === "extract") {
        try {
            unlinkSync(archivePath);
            // stats.purgedFiles++; // Skip counting as threat purge in extract mode
            Logger.info("SHIELD", `Extract policy: Purged archive after full extraction: ${relPath}`);
            return { flagged: false, extractedCount };
        } catch (e) {
            Logger.error("SYNC", `Failed to purge archive under extract policy: ${relPath}`, e);
            return { flagged: false, extractedCount, failed: true };
        }
    }

    if (hasGarbage) {
        Logger.info("SHIELD", `Detected risky archive: ${relPath}`);
        stats.riskyPatternCount++;

        if (policy === "isolate") {
            const riskDir = join(baseDir, "_risk_tools");
            if (!existsSync(riskDir)) mkdirSync(riskDir, { recursive: true });
            const engine = getEngine();
            if (engine) {
                for (const pattern of GARBAGE_PATTERNS) {
                    const rCmd = engine.type === "7z"
                        ? [engine.bin, "x", archivePath, `*${pattern}*`, `-o${riskDir}`, "-r", "-y"]
                        : [engine.bin, "x", "-r", "-y", archivePath, `*${pattern}*`, riskDir];
                    getSpawnSync()(rCmd);
                }
            }
        }

        ShieldManager.addOffender(baseDir, relPath, "Archive contains malware patterns");
        ShieldManager.updateExclusions(baseDir, [relPath]);

        try {
            if (policy === "isolate") {
                const riskDir = join(baseDir, "_risk_tools");
                if (!existsSync(riskDir)) mkdirSync(riskDir, { recursive: true });
                const dest = join(riskDir, fileName);
                const archiveData = readFileSync(archivePath);
                writeFileSync(dest, archiveData);
                unlinkSync(archivePath);
                stats.isolatedFiles++;
                Logger.info("SHIELD", `Isolated archive: ${relPath} -> _risk_tools/${fileName}`);
            } else if (policy === "purge" || mode === "lean") {
                unlinkSync(archivePath);
                stats.purgedFiles++;
                Logger.info("SHIELD", mode === "lean" ? `Lean Mode: Purged archive after extraction: ${relPath}` : `Purged archive: ${relPath}`);
            }
        } catch (e) {
            Logger.error("SYNC", `Failed to ${policy} original malicious archive: ${relPath}`, e);
            return { flagged: true, extractedCount, failed: true };
        }
        if (onProgress) onProgress(stats);
        return { flagged: true, extractedCount };
    }

    // Clean archive - extract according to policy
    if (policy === "purge") {
        unlinkSync(archivePath);
        stats.purgedFiles++;
        Logger.info("SHIELD", `Clean archive purged after extraction: ${relPath}`);
    }

    return { flagged: false, extractedCount };
}

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

    const isGarbage = PRIORITY_FILENAMES.some(p => p.toLowerCase() === fileName.toLowerCase()) ||
        GARBAGE_PATTERNS.some(p => fileName.toLowerCase().includes(p.toLowerCase())) ||
        (mode === "lean" && LEAN_STRICT_BLACKLIST.includes(ext.toLowerCase())) ||
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
            ShieldManager.addOffender(baseDir, relPath, (mode === "lean" ? "Lean Mode: Excess data stripped" : "File matches malware pattern"));
            if (stats && onProgress) onProgress(stats);
            return true;
        } catch (e) {
            Logger.error("SYNC", `Failed to ${policy} item: ${relPath}`, e);
            return false;
        }
    }
    return false;
}

/**
 * Scans a directory recursively for any nested archives and cleans them.
 */
async function scanForNestedArchives(
    stagingDir: string,
    baseDir: string,
    policy: "purge" | "isolate",
    stats: CleanupStats,

    onProgress?: (stats: CleanupStats) => void,
    mode: "full" | "lean" = "full"
): Promise<void> {
    const engine = getEngine();
    if (!engine) return;

    try {
        const nestedArchives = await glob("**/*.{zip,7z,rar}", {
            cwd: stagingDir,
            absolute: true
        });

        if (nestedArchives.length === 0) return;

        stats.nestedArchivesFound = (stats.nestedArchivesFound || 0) + nestedArchives.length;
        Logger.info("SHIELD", `Found ${nestedArchives.length} nested archive(s) in staging directory`);

        for (const nestedArchivePath of nestedArchives) {
            const relPath = relative(baseDir, nestedArchivePath);
            Logger.info("SHIELD", `Scanning nested archive: ${relPath}`);

            // Pass empty exclude file for nested scans
            const result = await cleanArchive(nestedArchivePath, baseDir, "", policy, stats, onProgress, mode);
            if (result.flagged) {
                stats.nestedArchivesCleaned = (stats.nestedArchivesCleaned || 0) + 1;
            }
        }
    } catch (err) {
        Logger.error("SHIELD", `Error scanning for nested archives in ${stagingDir}`, err);
    }
}
