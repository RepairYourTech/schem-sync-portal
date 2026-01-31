import { spawnSync } from "bun";
import { join, relative, dirname } from "path";
import { existsSync, appendFileSync, unlinkSync, mkdirSync } from "fs";
import { glob } from "glob";
import { Env } from "./env";
import { Logger } from "./logger";

let _spawnSync = spawnSync;

/** @internal - Exported for testing only */
export function __setSpawnSync(mock: typeof spawnSync) {
    _spawnSync = mock;
}

interface ArchiveEngine {
    type: "7z" | "rar";
    bin: string;
}

const KEEP_EXTS = [
    ".tvw", ".brd", ".fz", ".cad", ".asc", ".pdf", ".bvr", ".pcb",
    ".sqlite3", ".obdata", ".obdlocal", ".obdlog", ".obdq",
    ".bin", ".rom", ".cap", ".fd", ".wph", ".hex", ".txt"
];

const SAFE_PATTERNS = ["flash", "afud", "insyde", "h2o", "utility", "update", "phlash", "ami", "phoenix", "dell", "hp", "lenovo", "bios"];
const GARBAGE_PATTERNS = [
    "crack", "patch", "keygen", "loader", "bypass", "activator", "lpk.dll",
    "loader.exe", "Chinafix", "TVW specific software", "medicine", "fixed",
    "crack.exe", "patch.exe", "keygen.exe"
];

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

let ENGINE = getArchiveEngine();

/** @internal - Exported for testing only */
export function __setArchiveEngine(mock: ArchiveEngine | null) {
    ENGINE = mock;
}

/**
 * Statistics for the cleanup sweep operation.
 */
export interface CleanupStats {
    totalArchives: number;
    scannedArchives: number;
    currentArchive?: string;
    currentArchiveSize?: number;
    safePatternCount: number;
    riskyPatternCount: number;
    cleanArchives: number;
    flaggedArchives: number;
    extractedFiles: number;
    purgedFiles: number;
    isolatedFiles: number;
    policyMode: "purge" | "isolate";
}

/**
 * Result of a cleanup sweep operation, including tracking for state persistence.
 */
export interface CleanupResult {
    completed: boolean;
    scannedArchives: string[];
    unscannedArchives: string[];
}

/**
 * Run cleanup sweep across all archives in target directory.
 * Scans archives for malicious patterns and extracts safe files before purging.
 * 
 * @param targetDir - Directory to scan for archives
 * @param excludeFile - Path to exclusion file
 * @param policy - "purge" to delete flagged archives, "isolate" to move risky content
 * @param onProgress - Optional progress callback for UI updates
 * @param abortSignal - Optional AbortSignal for graceful cancellation between archives
 * @returns CleanupResult with completion status and archive tracking
 */
export async function runCleanupSweep(
    targetDir: string,
    excludeFile: string,
    policy: "purge" | "isolate" = "purge",
    onProgress?: (stats: CleanupStats) => void,
    abortSignal?: AbortSignal
): Promise<CleanupResult> {
    if (!ENGINE) {
        Logger.error("SYSTEM", "Cleanup failed: No 7-Zip or WinRAR found for cleanup.");
        return { completed: false, scannedArchives: [], unscannedArchives: [] };
    }

    const scannedArchives: string[] = [];
    const unscannedArchives: string[] = [];

    try {
        // Use glob to find all archive files
        const archives = await glob("**/*.{zip,7z,rar}", { cwd: targetDir, absolute: true });

        const stats: CleanupStats = {
            totalArchives: archives.length,
            scannedArchives: 0,
            safePatternCount: 0,
            riskyPatternCount: 0,
            cleanArchives: 0,
            flaggedArchives: 0,
            extractedFiles: 0,
            purgedFiles: 0,
            isolatedFiles: 0,
            policyMode: policy
        };

        if (onProgress) onProgress(stats);

        for (let i = 0; i < archives.length; i++) {
            const archivePath = archives[i]!;
            const relPath = relative(targetDir, archivePath);

            // Check for abort BEFORE processing each archive
            if (abortSignal?.aborted) {
                Logger.info("SYNC", "Cleanup sweep aborted by user");
                // Mark remaining archives as unscanned
                for (let j = i; j < archives.length; j++) {
                    unscannedArchives.push(relative(targetDir, archives[j]!));
                }
                return { completed: false, scannedArchives, unscannedArchives };
            }

            stats.currentArchive = relPath;
            stats.scannedArchives++;
            if (onProgress) onProgress(stats);

            const result = await cleanArchive(archivePath, targetDir, excludeFile, policy, stats, onProgress);
            scannedArchives.push(relPath);

            // Update stats based on result
            if (result.flagged) {
                stats.flaggedArchives++;
            } else {
                stats.cleanArchives++;
            }
        }

        // Final update
        stats.currentArchive = undefined;
        if (onProgress) onProgress(stats);

        return { completed: true, scannedArchives, unscannedArchives: [] };

    } catch (err) {
        Logger.error("SYNC", "Error during cleanup sweep", err);
        return { completed: false, scannedArchives, unscannedArchives };
    }
}

interface CleanArchiveResult {
    flagged: boolean;
    extractedCount: number;
}

async function cleanArchive(
    archivePath: string,
    baseDir: string,
    excludeFile: string,
    policy: "purge" | "isolate",
    stats: CleanupStats,
    onProgress?: (stats: CleanupStats) => void
): Promise<CleanArchiveResult> {
    const relPath = relative(baseDir, archivePath);

    if (relPath.toLowerCase().includes("bios")) {
        return { flagged: false, extractedCount: 0 };
    }

    // 1. Peek inside
    let internalListing = "";
    try {
        const cmd = ENGINE?.type === "7z"
            ? [ENGINE.bin, "l", archivePath, "-r"]
            : [ENGINE!.bin, "v", archivePath];

        const result = _spawnSync(cmd);
        internalListing = result.stdout.toString();
        Logger.debug("SYNC", `Peeked inside archive: ${relPath}`);
    } catch (err) {
        Logger.error("SYNC", `Failed to peek inside archive: ${relPath}`, err);
        return { flagged: false, extractedCount: 0 };
    }

    const hasGarbage = GARBAGE_PATTERNS.some(p => internalListing.toLowerCase().includes(p.toLowerCase()));
    const hasSafeTools = SAFE_PATTERNS.some(p => internalListing.toLowerCase().includes(p.toLowerCase()));

    if (hasGarbage) {
        stats.riskyPatternCount++;
        Logger.debug("SYNC", `Garbage detected in ${relPath}`);
    }
    if (hasSafeTools) {
        stats.safePatternCount++;
        Logger.debug("SYNC", `Safe tools detected in ${relPath}`);
    }

    if (onProgress) onProgress(stats);

    if (hasGarbage && !hasSafeTools) {
        const dirPath = dirname(archivePath);
        let extractedCount = 0;

        // 2. Extract safe extensions
        for (const ext of KEEP_EXTS) {
            const extractCmd = ENGINE?.type === "7z"
                ? [ENGINE.bin, "e", archivePath, `*${ext}`, `-o${dirPath}`, "-r", "-y"]
                : [ENGINE!.bin, "e", "-r", "-y", archivePath, `*${ext}`, dirPath];

            _spawnSync(extractCmd);
            extractedCount++;
        }

        stats.extractedFiles += extractedCount;

        // 3. ISOLATE: Extract risky patterns to _risk_tools if policy is isolate
        if (policy === "isolate") {
            const riskDir = join(baseDir, "_risk_tools");
            try {
                if (!existsSync(riskDir)) mkdirSync(riskDir, { recursive: true });
            } catch (e) {
                Logger.error("SYNC", "Failed to create risk isolation directory", e);
            }

            for (const pattern of GARBAGE_PATTERNS) {
                const riskExtractCmd = ENGINE?.type === "7z"
                    ? [ENGINE.bin, "e", archivePath, `*${pattern}*`, `-o${riskDir}`, "-r", "-y"]
                    : [ENGINE!.bin, "e", "-r", "-y", archivePath, `*${pattern}*`, riskDir];

                _spawnSync(riskExtractCmd);
                stats.isolatedFiles++;
            }
        }

        // 4. Add to exclusion
        try {
            const excludeDir = dirname(excludeFile);
            if (!existsSync(excludeDir)) mkdirSync(excludeDir, { recursive: true });

            appendFileSync(excludeFile, `${relPath}\n`);
            Logger.info("SYNC", `Purged/Isolated malicious archive: ${relPath}`);
        } catch (e) {
            Logger.error("SYNC", "Failed to update exclusion file", e);
        }

        // 5. Remove original
        try {
            unlinkSync(archivePath);
            stats.purgedFiles++;
        } catch (e) {
            Logger.error("SYNC", "Failed to remove original malicious archive", e);
        }

        if (onProgress) onProgress(stats);
        return { flagged: true, extractedCount };
    }

    return { flagged: false, extractedCount: 0 };
}
