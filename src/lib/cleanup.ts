import { spawnSync } from "bun";
import { join, relative, dirname } from "path";
import { existsSync, unlinkSync, mkdirSync, readFileSync, writeFileSync } from "fs";
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

export const KEEP_EXTS = [
    ".tvw", ".brd", ".fz", ".cad", ".asc", ".pdf", ".bvr", ".pcb",
    ".sqlite3", ".obdata", ".obdlocal", ".obdlog", ".obdq",
    ".bin", ".rom", ".cap", ".fd", ".wph", ".hex", ".txt"
];

export const SAFE_PATTERNS = ["flash", "afud", "insyde", "h2o", "utility", "update", "phlash", "ami", "phoenix", "dell", "hp", "lenovo", "bios"];
export const GARBAGE_PATTERNS = [
    "crack", "patch", "keygen", "loader", "bypass", "activator", "lpk.dll",
    "loader.exe", "Chinafix", "TVW specific software", "medicine", "fixed",
    "crack.exe", "patch.exe", "keygen.exe", "viewer", "viewer.exe", "Software",
    "Open boardview", "boardview", "DOS4GW"
];

const INITIAL_KNOWNS = [
    "Schematic and boardview/AMD/07 580/GV-R580AORUS-8GD-1.0-1.01 Boardview.zip",
    "Schematic and boardview/AMD/07 580/GV-R580GAMING-8GD-1.0-1.01 Boardview.zip",
    "Schematic and boardview/AMD/07 580/GV-RX580GAMING-4GD-1.0-1.01 Boardview.zip",
    "Schematic and boardview/AMD/07 580/GV-RX580GAMING-8GD-1.0-1.01 Boardview.zip"
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

    // If it has garbage, we clean it regardless of whether it has safe tools
    if (hasGarbage) {
        const dirPath = dirname(archivePath);
        let extractedCount = 0;

        Logger.info("SYNC", `Cleaning flagged archive: ${relPath}`);

        // 2. Extract safe extensions
        for (const ext of KEEP_EXTS) {
            const extractCmd = ENGINE?.type === "7z"
                ? [ENGINE.bin, "e", archivePath, `*${ext}`, `-o${dirPath}`, "-r", "-y"]
                : [ENGINE!.bin, "e", "-r", "-y", archivePath, `*${ext}`, dirPath];

            const result = _spawnSync(extractCmd);
            if (result.success) {
                // Heuristic to check if something was actually extracted
                // 7z/unrar output can be parsed if we need exact counts, 
                // but for now we increment if the command ran.
                extractedCount++;
            }
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

        // 4. Register as Offender
        ShieldManager.addOffender(relPath);
        Logger.info("SYNC", `Shield: Neutralized & Blacklisted: ${relPath}`);

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

/**
 * Manages the persistent list of identified malicious assets.
 */
export const ShieldManager = {
    /**
     * Get the current set of offenders (relative paths).
     */
    getOffenders(): string[] {
        const path = Env.getOffenderListPath();
        if (!existsSync(path)) return [...INITIAL_KNOWNS];
        try {
            const data = readFileSync(path, "utf-8");
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) {
                // Merge with initial knowns to ensure they are always present
                const combined = new Set([...INITIAL_KNOWNS, ...parsed]);
                return Array.from(combined);
            }
        } catch (e) {
            Logger.error("SHIELD", "Failed to load offender list", e);
        }
        return [...INITIAL_KNOWNS];
    },

    /**
     * Add a path to the offender list persistently.
     */
    addOffender(relPath: string) {
        const offenders = this.getOffenders();
        if (!offenders.includes(relPath)) {
            offenders.push(relPath);
            this.saveOffenders(offenders);
            this.syncWithRclone();
        }
    },

    /**
     * Save the list to disk.
     */
    saveOffenders(offenders: string[]) {
        const path = Env.getOffenderListPath();
        try {
            const dir = dirname(path);
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            writeFileSync(path, JSON.stringify(offenders, null, 2));
        } catch (e) {
            Logger.error("SHIELD", "Failed to save offender list", e);
        }
    },

    /**
     * Clear custom offenders and revert to defaults.
     */
    resetShield() {
        this.saveOffenders([]); // Empty array will be merged with INITIAL_KNOWNS in getOffenders()
        this.syncWithRclone();
        Logger.info("SHIELD", "Intelligence reset to defaults.");
    },

    /**
     * Synchronize the offender list with rclone's exclusion file.
     */
    syncWithRclone() {
        const excludeFile = Env.getExcludeFilePath();
        const offenders = this.getOffenders();
        try {
            const dir = dirname(excludeFile);
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

            // Deduplicate with existing entries if any
            let currentEntries = new Set<string>();
            if (existsSync(excludeFile)) {
                const lines = readFileSync(excludeFile, "utf-8").split("\n");
                lines.forEach(l => { if (l.trim()) currentEntries.add(l.trim()); });
            }

            offenders.forEach(o => currentEntries.add(o));

            writeFileSync(excludeFile, Array.from(currentEntries).join("\n") + "\n");
        } catch (e) {
            Logger.error("SHIELD", "Failed to sync exclusion file", e);
        }
    }
};
