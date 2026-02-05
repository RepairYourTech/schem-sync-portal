import { spawnSync as bunSpawnSync } from "bun";
import { join, relative, dirname } from "path";
import { existsSync, unlinkSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { glob } from "glob";
import { Env } from "./env";
import { Logger } from "./logger";
import type { CleanupStats, SyncProgress } from "./sync/types";

export const KEEP_EXTS = [".tvw", ".brd", ".fz", ".cad", ".asc", ".pdf", ".bvr", ".pcb", ".sqlite3", ".obdata", ".obdlocal", ".obdlog", ".obdq", ".bin", ".rom", ".cap", ".fd", ".wph", ".hex", ".txt", ".json"];
export const SAFE_PATTERNS = ["flash", "afud", "insyde", "h2o", "utility", "update", "phlash", "ami", "phoenix", "dell", "hp", "lenovo", "bios"];
export const GARBAGE_PATTERNS = ["lpk.dll", "Open boardview using this TVW specific software", "Chinafix", "chinafix", "程序_原厂_迅维版主分享", "crack.exe", "Crack.exe", "patch.exe", "Patch.exe", "keygen.exe", "Keygen.exe", "loader.exe", "Loader.exe", ".exe.bak", ".exe.BAK", "activator", "bypass", "medicine", "fixed", "DOS4GW.EXE", "DOS4GW"];

export const PRIORITY_FILENAMES = [
    "GV-R580AORUS-8GD-1.0-1.01 Boardview.zip", "GV-R580GAMING-8GD-1.0-1.01 Boardview.zip",
    "GV-RX580GAMING-4GD-1.0-1.01 Boardview.zip", "GV-RX580GAMING-8GD-1.0-1.01 Boardview.zip",
    "GV-R939XG1 GAMING-8GD-1.0-1.01 Boardview.zip", "GV-R938WF2-4GD-1.0 Boardview.zip",
    "IOT73 V3.0 TG-B75.zip", "GV-R938G1 GAMING-4GD-1.02 Boardview.zip",
    "GV-RX470G1 GAMING-4GD-0.2 Boardview.zip", "GV-RX480G1 GAMING-4GD-1.1 Boardview.zip",
    "BIOS_K54C usb 3.0_factory-Chinafix.zip", "BIOS_K54LY usb 3.0_factory-Chinafix.zip",
    "GV-RX570AORUS-4GD-1.0 Boardview.zip", "GV-RX580AORUS-4GD-0.2-1.1 Boardview.zip",
    "GV-RX580GAMING-8GD-1.0 Boardview.zip", "GV-RX590GAMING-8GD-1.0 Boardview.zip",
    "BIOS_k53SJ usb 3.0 K53SJFW05300A_factory-Chinafix.zip", "BIOS_k53sv usb 3.0 _factory-Chinafix.zip",
    "BIOS_u310 U410_Chinafix.zip", "GV-N3070EAGLE OC-8GD-1.0 Boardview.zip",
    "DANL9MB18F0 (tvw).rar", "GV-N4090GAMING-OC-24GD r1.0 boardview.zip"
];

export const ShieldManager = {
    getOffenders(localDir: string): string[] {
        const path = Env.getOffenderListPath(localDir);
        if (!existsSync(path)) return [];
        try {
            const data = readFileSync(path, "utf-8");
            const parsed = JSON.parse(data);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) { Logger.error("SHIELD", "Failed to load offender list", e); }
        return [];
    },
    getPriorityFilenames(): string[] { return [...PRIORITY_FILENAMES]; },
    addOffender(relPath: string, localDir: string) {
        const offenders = this.getOffenders(localDir);
        if (!offenders.includes(relPath)) {
            offenders.push(relPath);
            this.saveOffenders(offenders, localDir);
            this.syncWithRclone(localDir);
        }
    },
    saveOffenders(offenders: string[], localDir: string) {
        const path = Env.getOffenderListPath(localDir);
        try {
            if (!existsSync(localDir)) mkdirSync(localDir, { recursive: true });
            writeFileSync(path, JSON.stringify(offenders, null, 2));
        } catch (e) { Logger.error("SHIELD", "Failed to save offender list", e); }
    },
    resetShield(localDir: string) {
        const offenderPath = Env.getOffenderListPath(localDir);
        const excludePath = Env.getExcludeFilePath(localDir);
        try { if (existsSync(offenderPath)) unlinkSync(offenderPath); } catch { /* ignore */ }
        try { if (existsSync(excludePath)) unlinkSync(excludePath); } catch { /* ignore */ }
        this.syncWithRclone(localDir);
        Logger.info("SHIELD", "History cleared.");
    },
    syncWithRclone(localDir: string) {
        const excludeFile = Env.getExcludeFilePath(localDir);
        const offenders = this.getOffenders(localDir);
        try {
            if (!existsSync(localDir)) mkdirSync(localDir, { recursive: true });
            const entries = [...offenders, "_risk_tools/**"];
            writeFileSync(excludeFile, entries.join("\n") + "\n");
        } catch (e) { Logger.error("SHIELD", "Failed to sync exclusion file", e); }
    }
};

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
    policy: "purge" | "isolate" = "purge",
    onProgress?: (stats: CleanupStats | Partial<SyncProgress>) => void,
    abortSignal?: AbortSignal
): Promise<CleanupResult> {
    const engine = getEngine();
    if (!engine) {
        Logger.error("SYSTEM", "Cleanup failed: No tools found.");
        if (onProgress) {
            onProgress({ phase: "clean", description: "Shield: Skipped (Tools not found)", percentage: 0 });
            onProgress({ phase: "clean", description: "Shield: Skipped (Tools not found)", percentage: 100 });
        }
        return { completed: true, scannedArchives: [], unscannedArchives: [] };
    }
    const scannedArchives: string[] = [];
    const unscannedArchives: string[] = [];
    try {
        const archives = await glob("**/*.{zip,7z,rar}", { cwd: targetDir, absolute: true, ignore: ["**/node_modules/**", "**/.git/**"] });
        const stats: CleanupStats = {
            phase: "clean", totalArchives: archives.length, scannedArchives: 0, safePatternCount: 0, riskyPatternCount: 0,
            cleanArchives: 0, flaggedArchives: 0, extractedFiles: 0, purgedFiles: 0, isolatedFiles: 0, policyMode: policy
        };
        if (onProgress) onProgress(stats);
        for (let i = 0; i < archives.length; i++) {
            const archivePath = archives[i]!;
            const relPath = relative(targetDir, archivePath);
            if (abortSignal?.aborted) {
                for (let j = i; j < archives.length; j++) unscannedArchives.push(relative(targetDir, archives[j]!));
                return { completed: false, scannedArchives, unscannedArchives };
            }
            stats.currentArchive = relPath;
            stats.scannedArchives++;
            if (onProgress) onProgress(stats);
            const result = await cleanArchive(archivePath, targetDir, excludeFile, policy, stats, onProgress);
            scannedArchives.push(relPath);
            if (result.failed) {
                Logger.error("SYNC", `Shield: CRITICAL FAILURE during ${policy} of ${relPath}.`);
                if (onProgress) onProgress({ ...stats, phase: "clean", description: `Shield ERROR: Failed to ${policy} ${relPath}.` });
                return { completed: false, scannedArchives, unscannedArchives: archives.slice(i + 1).map(a => relative(targetDir, a)) };
            }
            if (result.flagged) stats.flaggedArchives++; else stats.cleanArchives++;
        }
        stats.currentArchive = undefined;
        if (onProgress) onProgress(stats);
        return { completed: true, scannedArchives, unscannedArchives: [] };
    } catch (err) {
        Logger.error("SYNC", "Error during cleanup sweep", err);
        return { completed: false, scannedArchives, unscannedArchives };
    }
}

interface CleanArchiveResult { flagged: boolean; extractedCount: number; failed?: boolean; }

async function cleanArchive(
    archivePath: string, baseDir: string, excludeFile: string, policy: "purge" | "isolate",
    stats: CleanupStats, onProgress?: (stats: CleanupStats) => void
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
        return { flagged: false, extractedCount: 0 };
    }

    const fileName = relPath.split(/[/\\]/).pop() || "";
    const isKnownBad = PRIORITY_FILENAMES.some(p => p.toLowerCase() === fileName.toLowerCase());
    const hasGarbage = isKnownBad || GARBAGE_PATTERNS.some(p => internalListing.toLowerCase().includes(p.toLowerCase()));

    if (hasGarbage) {
        stats.riskyPatternCount++;
        if (onProgress) onProgress(stats);
        const dirPath = dirname(archivePath);
        let extractedCount = 0;
        const engine = getEngine();
        if (engine) {
            for (const ext of KEEP_EXTS) {
                const extractCmd = engine.type === "7z"
                    ? [engine.bin, "x", archivePath, `*${ext}`, `-o${dirPath}`, "-r", "-y"]
                    : [engine.bin, "x", "-r", "-y", archivePath, `*${ext}`, dirPath];
                if (getSpawnSync()(extractCmd).success) extractedCount++;
            }
        }
        stats.extractedFiles += extractedCount;

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

        ShieldManager.addOffender(relPath, baseDir);
        try {
            if (policy === "isolate") {
                const riskDir = join(baseDir, "_risk_tools");
                if (!existsSync(riskDir)) mkdirSync(riskDir, { recursive: true });
                const dest = join(riskDir, fileName);
                writeFileSync(dest, readFileSync(archivePath));
                if (!existsSync(dest)) throw new Error("Isolation failed.");
                unlinkSync(archivePath);
                if (existsSync(archivePath)) throw new Error("Isolation failed.");
                stats.isolatedFiles++;
            } else {
                unlinkSync(archivePath);
                if (existsSync(archivePath)) throw new Error("Purge failed.");
                stats.purgedFiles++;
            }
        } catch (e) {
            Logger.error("SYNC", `Failed to ${policy} original malicious archive: ${relPath}`, e);
            return { flagged: true, extractedCount, failed: true };
        }
        if (onProgress) onProgress(stats);
        return { flagged: true, extractedCount };
    }
    return { flagged: false, extractedCount: 0 };
}

export async function cleanFile(
    filePath: string, baseDir: string, policy: "purge" | "isolate", stats?: CleanupStats
): Promise<boolean> {
    const relPath = relative(baseDir, filePath);
    const fileName = relPath.split(/[/\\]/).pop() || "";
    if (KEEP_EXTS.includes("." + (fileName.split(".").pop() || "").toLowerCase())) return false;
    const isGarbage = PRIORITY_FILENAMES.some(p => p.toLowerCase() === fileName.toLowerCase()) ||
        GARBAGE_PATTERNS.some(p => fileName.toLowerCase().includes(p.toLowerCase()));
    if (isGarbage) {
        if (stats) stats.riskyPatternCount++;
        const riskDir = join(baseDir, "_risk_tools");
        try {
            if (policy === "isolate") {
                if (!existsSync(riskDir)) mkdirSync(riskDir, { recursive: true });
                const dest = join(riskDir, fileName);
                writeFileSync(dest, readFileSync(filePath));
                if (!existsSync(dest)) throw new Error("Isolation failed.");
                unlinkSync(filePath);
                if (existsSync(filePath)) throw new Error("Isolation failed.");
                if (stats) stats.isolatedFiles++;
            } else {
                unlinkSync(filePath);
                if (existsSync(filePath)) throw new Error("Purge failed.");
                if (stats) stats.purgedFiles++;
            }
            ShieldManager.addOffender(relPath, baseDir);
            return true;
        } catch (e) { Logger.error("SYNC", `Failed to ${policy} item: ${relPath}`, e); return false; }
    }
    return false;
}
