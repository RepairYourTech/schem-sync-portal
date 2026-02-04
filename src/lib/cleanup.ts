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
    ".bin", ".rom", ".cap", ".fd", ".wph", ".hex", ".txt", ".json"
];

export const SAFE_PATTERNS = ["flash", "afud", "insyde", "h2o", "utility", "update", "phlash", "ami", "phoenix", "dell", "hp", "lenovo", "bios"];
export const GARBAGE_PATTERNS = [
    // === EXACT MALWARE INDICATORS (High Confidence) ===
    "lpk.dll",                                           // DLL hijacking attack vector
    "Open boardview using this TVW specific software",  // Exact cracked software package name
    "Chinafix", "chinafix",                            // Known malware distributor signature
    "程序_原厂_迅维版主分享",                              // Specific Chinese nested RAR pattern

    // === EXECUTABLE PATTERNS (High Confidence) ===
    "crack.exe", "Crack.exe",
    "patch.exe", "Patch.exe",
    "keygen.exe", "Keygen.exe",
    "loader.exe", "Loader.exe",
    ".exe.bak", ".exe.BAK",                            // Backup of cracked executables

    // === GENERIC INDICATORS (Medium Confidence - need context) ===
    "activator", "bypass", "medicine", "fixed",
    "DOS4GW.EXE", "DOS4GW"                             // Suspicious in BIOS context
];

const PRIORITY_FILENAMES = [
    // Static list of Google-flagged filenames for PRIORITY DOWNLOAD only
    // These are used to identify risky files and download them first
    // They are NOT automatically added to exclude file - only processed files are
    "GV-R580AORUS-8GD-1.0-1.01 Boardview.zip",
    "GV-R580GAMING-8GD-1.0-1.01 Boardview.zip",
    "GV-RX580GAMING-4GD-1.0-1.01 Boardview.zip",
    "GV-RX580GAMING-8GD-1.0-1.01 Boardview.zip",
    "GV-R939XG1 GAMING-8GD-1.0-1.01 Boardview.zip",
    "GV-R938WF2-4GD-1.0 Boardview.zip",
    "IOT73 V3.0 TG-B75.zip",
    "GV-R938G1 GAMING-4GD-1.02 Boardview.zip",
    "GV-RX470G1 GAMING-4GD-0.2 Boardview.zip",
    "GV-RX480G1 GAMING-4GD-1.1 Boardview.zip",
    "BIOS_K54C usb 3.0_factory-Chinafix.zip",
    "BIOS_K54LY usb 3.0_factory-Chinafix.zip",
    "GV-RX570AORUS-4GD-1.0 Boardview.zip",
    "GV-RX580AORUS-4GD-0.2-1.1 Boardview.zip",
    "GV-RX580GAMING-8GD-1.0 Boardview.zip",
    "GV-RX590GAMING-8GD-1.0 Boardview.zip",
    "BIOS_k53SJ usb 3.0 K53SJFW05300A_factory-Chinafix.zip",
    "BIOS_k53sv usb 3.0 _factory-Chinafix.zip",
    "BIOS_u310 U410_Chinafix.zip",
    "GV-N3070EAGLE OC-8GD-1.0 Boardview.zip",
    "DANL9MB18F0 (tvw).rar",
    "GV-N4090GAMING-OC-24GD r1.0 boardview.zip"
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
        const archives = await glob("**/*.{zip,7z,rar}", {
            cwd: targetDir,
            absolute: true,
            ignore: ["**/node_modules/**", "**/.git/**"]
        });

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

    const fileName = relPath.split(/[/\\]/).pop() || "";
    const isKnownBad = PRIORITY_FILENAMES.some(p => p.toLowerCase() === fileName.toLowerCase());
    const hasGarbage = isKnownBad || GARBAGE_PATTERNS.some(p => internalListing.toLowerCase().includes(p.toLowerCase()));
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

        // 2. FIRST: Extract safe extensions (using 'x' to preserve full paths)
        Logger.info("SYNC", `Shield: Extracting safe files from ${relPath} before isolation...`);
        for (const ext of KEEP_EXTS) {
            const extractCmd = ENGINE?.type === "7z"
                ? [ENGINE.bin, "x", archivePath, `*${ext}`, `-o${dirPath}`, "-r", "-y"]
                : [ENGINE!.bin, "x", "-r", "-y", archivePath, `*${ext}`, dirPath];

            const result = _spawnSync(extractCmd);
            if (result.success) {
                extractedCount++;
                Logger.debug("SYNC", `Extracted ${ext} files from ${relPath}`);
            }
        }

        stats.extractedFiles += extractedCount;
        Logger.info("SYNC", `Shield: Extracted ${extractedCount} safe file types from ${relPath}`);

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
                    ? [ENGINE.bin, "x", archivePath, `*${pattern}*`, `-o${riskDir}`, "-r", "-y"]
                    : [ENGINE!.bin, "x", "-r", "-y", archivePath, `*${pattern}*`, riskDir];

                _spawnSync(riskExtractCmd);
                stats.isolatedFiles++;
            }
        }

        // 4. Register as Offender
        ShieldManager.addOffender(relPath, baseDir);
        Logger.info("SYNC", `Shield: Neutralized & Blacklisted: ${relPath}`);

        // 5. Remove or Isolate original
        try {
            if (policy === "isolate") {
                const riskDir = join(baseDir, "_risk_tools");
                if (!existsSync(riskDir)) mkdirSync(riskDir, { recursive: true });
                const dest = join(riskDir, fileName);

                // Copy then delete (safest across partitions)
                const content = readFileSync(archivePath);
                writeFileSync(dest, content);
                unlinkSync(archivePath);
                stats.isolatedFiles++;
                Logger.debug("SYNC", `Isolated archive to ${riskDir}`);
            } else {
                unlinkSync(archivePath);
                stats.purgedFiles++;
            }
        } catch (e) {
            Logger.error("SYNC", `Failed to ${policy} original malicious archive`, e);
        }

        if (onProgress) onProgress(stats);
        return { flagged: true, extractedCount };
    }

    return { flagged: false, extractedCount: 0 };
}

/**
 * Handle non-archive risky files.
 */
export async function cleanFile(
    filePath: string,
    baseDir: string,
    policy: "purge" | "isolate",
    stats?: CleanupStats
): Promise<boolean> {
    const relPath = relative(baseDir, filePath);
    const fileName = relPath.split(/[/\\]/).pop() || "";

    // Safety check: Don't touch files that are explicitly in KEEP_EXTS
    const ext = "." + (fileName.split(".").pop() || "").toLowerCase();
    if (KEEP_EXTS.includes(ext)) {
        Logger.debug("SYNC", `Skipping cleanup for useful file: ${relPath}`);
        return false;
    }

    const isGarbage = PRIORITY_FILENAMES.some(p => p.toLowerCase() === fileName.toLowerCase()) || GARBAGE_PATTERNS.some(p => fileName.toLowerCase().includes(p.toLowerCase()));

    if (isGarbage) {
        Logger.info("SYNC", `Shield: Identified independent threat: ${relPath}`);
        if (stats) stats.riskyPatternCount++;

        if (policy === "isolate") {
            const riskDir = join(baseDir, "_risk_tools");
            if (!existsSync(riskDir)) mkdirSync(riskDir, { recursive: true });
            const dest = join(riskDir, fileName);
            try {
                // Bun's native move or rename
                const content = readFileSync(filePath);
                writeFileSync(dest, content);
                unlinkSync(filePath);
                if (stats) stats.isolatedFiles++;
                Logger.debug("SYNC", `Isolated file to ${riskDir}`);
            } catch (e) {
                Logger.error("SYNC", `Failed to isolate file: ${relPath}`, e);
            }
        } else {
            try {
                unlinkSync(filePath);
                if (stats) stats.purgedFiles++;
                Logger.debug("SYNC", `Purged file: ${relPath}`);
            } catch (e) {
                Logger.error("SYNC", `Failed to purge file: ${relPath}`, e);
            }
        }

        ShieldManager.addOffender(relPath, baseDir);
        return true;
    }

    return false;
}

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
