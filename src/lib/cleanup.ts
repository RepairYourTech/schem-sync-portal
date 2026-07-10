import { join, relative, dirname, basename } from "path";
import { existsSync, unlinkSync, mkdirSync, readFileSync, writeFileSync, rmSync, renameSync } from "fs";
import { stat } from "fs/promises";
import { glob } from "glob";
import { Env } from "./env";
import { Logger } from "./logger";
import { ShieldManager } from "./shield/ShieldManager";
import { isStopRequested } from "./sync/utils";
import { getEngine, getSpawnSync, isExtractorOk } from "./shield/archiveEngine";
import { cleanFile } from "./shield/fileCleaner";
import { KEEP_EXTS, GARBAGE_PATTERNS, PRIORITY_FILENAMES, SAFE_PATTERNS } from "./shield/patterns";
import type { CleanupStats, SyncProgress } from "./sync/types";

export { __setSpawnSync, __setArchiveEngine } from "./shield/archiveEngine";
export { cleanFile } from "./shield/fileCleaner";

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

    // This sweep unlinks files. It is reachable outside runSync (realtime clean, final
    // sweep, standalone), so it validates the target itself rather than trusting callers.
    const unsafeReason = Env.getUnsafeDirectoryReason(targetDir);
    if (unsafeReason) {
        Logger.error("SHIELD", `Refusing to sweep unsafe directory '${targetDir}': ${unsafeReason}`);
        return { completed: false, scannedArchives, unscannedArchives };
    }

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

                if (isStopRequested() || abortSignal?.aborted) {
                    for (let j = i; j < archives.length; j++) unscannedArchives.push(relative(targetDir, archives[j]!));
                    return { completed: false, scannedArchives, unscannedArchives };
                }
                stats.currentArchive = relPath;
                stats.scannedArchives++;
                if (onProgress) onProgress(stats);
                const result = await cleanArchive(archivePath, targetDir, excludeFile, policy, stats, onProgress, mode);
                if (result.failed) {
                    scannedArchives.push(relPath);
                    Logger.error("SYNC", `Shield: CRITICAL FAILURE during ${policy} of ${relPath}.`);
                    if (onProgress) onProgress({ ...stats, phase: "clean", description: `Shield ERROR: Failed to ${policy} ${relPath}.` });
                    return { completed: false, scannedArchives, unscannedArchives: archives.slice(i + 1).map(a => relative(targetDir, a)) };
                }
                if (result.preserved) {
                    // Kept on disk because we could not verify its contents. Not a scan
                    // success: it must not be reported as processed, and the sweep goes on.
                    unscannedArchives.push(relPath);
                    if (result.flagged) stats.flaggedArchives++;
                    if (onProgress) onProgress({ ...stats, phase: "clean", description: `Shield: preserved unverifiable archive ${relPath}.` });
                    continue;
                }
                scannedArchives.push(relPath);
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
                    if (isStopRequested() || abortSignal?.aborted) break;

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
        if (unscannedArchives.length > 0) {
            Logger.warn("SHIELD", `${unscannedArchives.length} archive(s) could not be verified and were left in place: ${unscannedArchives.join(", ")}`);
        }
        // Report what the loop actually skipped. Returning [] here hid preserved and
        // lean-filtered archives from the caller, which then reported a clean sweep.
        return { completed: true, scannedArchives, unscannedArchives };
    } catch (err) {
        Logger.error("SYNC", "Error during cleanup sweep", err);
        return { completed: false, scannedArchives, unscannedArchives };
    }
}

interface CleanArchiveResult {
    flagged: boolean;
    extractedCount: number;
    /** Fatal: the sweep cannot continue safely (e.g. filesystem error mid-delete). */
    failed?: boolean;
    /** Non-fatal: the archive was kept because its contents could not be verified. */
    preserved?: boolean;
}

async function cleanArchive(
    archivePath: string, baseDir: string, excludeFile: string, policy: "purge" | "isolate" | "extract",
    stats: CleanupStats, onProgress?: (stats: CleanupStats) => void, mode: "full" | "lean" = "full"
): Promise<CleanArchiveResult> {
    const relPath = relative(baseDir, archivePath);
    let internalListing = "";
    let listingReadable = false;
    try {
        const engine = getEngine();
        if (!engine) return { flagged: false, extractedCount: 0 };
        const cmd = engine.type === "7z" ? [engine.bin, "l", archivePath, "-r"] : [engine.bin, "v", archivePath];
        const listResult = getSpawnSync()(cmd);
        internalListing = listResult.stdout.toString();
        // The extractor's exit code is the authoritative readability signal. Scanning the
        // listing text for "error"/"failed" also matches archived *filenames*
        // (e.g. "Error Codes.pdf"), which condemned legitimate archives.
        listingReadable = isExtractorOk(listResult, engine.type);
    } catch (err) {
        Logger.error("SYNC", `Failed to peek inside archive: ${relPath}`, err);
        internalListing = "";
        listingReadable = false;
    }

    const fileName = basename(relPath);
    let failSafeTriggered = false;

    if (!listingReadable) {
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
    // The archive may only be deleted if we can positively account for its contents.
    let extractionVerified = true;
    let unresolvedCollisions = 0;

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

                const extractResult = getSpawnSync()(extractCmd);
                if (!isExtractorOk(extractResult, engine.type)) {
                    extractionVerified = false;
                    Logger.error("SHIELD", `Extractor exited ${extractResult?.exitCode} on pattern '${globPattern}' for ${relPath}; archive will be preserved.`);
                    break;
                }
            }

            if (extractionVerified) {
                // Important: scan for nested archives BEFORE moving files out
                if (policy !== "extract") {
                    await scanForNestedArchives(stagingDir, baseDir, policy, stats, onProgress, mode);
                }

                const matches = await glob("**/*", { cwd: stagingDir, absolute: true });
                for (const match of matches) {
                    const isFile = (await stat(match)).isFile();
                    if (!isFile) continue;

                    const relativeToStaging = relative(stagingDir, match);
                    const destPath = join(dirPath, relativeToStaging);
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
                    } else {
                        // A same-named file already exists at the destination. If the bytes
                        // differ it is a distinct revision, and discarding the staged copy
                        // while deleting the archive would lose it silently.
                        const staged = await stat(match);
                        const existing = await stat(destPath);
                        if (staged.size !== existing.size) {
                            unresolvedCollisions++;
                            Logger.warn("SHIELD", `Name collision with differing content: ${relExtracted} (archive ${relPath} preserved)`);
                        }
                    }
                }
            }
        }
    } catch (err) {
        extractionVerified = false;
        Logger.error("SHIELD", `Error during extraction from ${relPath}`, err);
    } finally {
        try { if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }

    stats.extractedFiles += extractedCount;

    // A single gate for every deletion decision below.
    const safeToDeleteArchive = extractionVerified && unresolvedCollisions === 0;
    if (!safeToDeleteArchive) {
        stats.failedExtractions = (stats.failedExtractions || 0) + 1;
    }

    // Handle "extract" policy (Trust Source)
    if (policy === "extract") {
        if (!safeToDeleteArchive) {
            // Preserve the archive AND leave it out of the exclusion ledger, so a later
            // run can retry it rather than treating it as permanently handled.
            Logger.error("SHIELD", `Extraction unverified; keeping archive and leaving it re-downloadable: ${relPath}`);
            return { flagged: false, extractedCount, preserved: true };
        }
        try {
            if (existsSync(archivePath)) {
                unlinkSync(archivePath);
            }
            ShieldManager.updateExclusions(baseDir, [relPath]);
            Logger.info("SHIELD", `Extract policy: Purged archive after full extraction: ${relPath}`);
            return { flagged: false, extractedCount };
        } catch (e) {
            Logger.error("SYNC", `Failed to purge archive under extract policy (non-fatal): ${relPath}`, e);
            return { flagged: false, extractedCount };
        }
    }

    if (hasGarbage) {
        Logger.info("SHIELD", `Detected risky archive: ${relPath}`);
        stats.riskyPatternCount++;

        // An archive we could not even read has not been *shown* to contain anything.
        // The extractor may simply not support the format, or the download may be
        // truncated. Never destroy it on the strength of a failed read.
        if (failSafeTriggered || !safeToDeleteArchive) {
            ShieldManager.addOffender(baseDir, relPath, "Archive could not be read or verified");
            Logger.error("SHIELD", `Unreadable/unverified archive kept in place for review: ${relPath}`);
            if (onProgress) onProgress(stats);
            return { flagged: true, extractedCount, preserved: true };
        }

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
        if (!safeToDeleteArchive) {
            Logger.error("SHIELD", `Extraction unverified; clean archive preserved and left re-downloadable: ${relPath}`);
            return { flagged: false, extractedCount, preserved: true };
        }
        try {
            unlinkSync(archivePath);
        } catch (e) {
            Logger.error("SYNC", `Failed to purge clean archive: ${relPath}`, e);
            return { flagged: false, extractedCount, failed: true };
        }
        stats.purgedFiles++;
        ShieldManager.updateExclusions(baseDir, [relPath]);
        Logger.info("SHIELD", `Clean archive purged after extraction: ${relPath}`);
    }

    return { flagged: false, extractedCount };
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
