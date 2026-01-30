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

export async function runCleanupSweep(targetDir: string, excludeFile: string, policy: "purge" | "isolate" = "purge"): Promise<void> {
    if (!ENGINE) {
        Logger.error("SYSTEM", "Cleanup failed: No 7-Zip or WinRAR found for cleanup.");
        return;
    }

    try {
        // Use glob to find all archive files
        const archives = await glob("**/*.{zip,7z,rar}", { cwd: targetDir, absolute: true });

        for (const archivePath of archives) {
            await cleanArchive(archivePath, targetDir, excludeFile, policy);
        }
    } catch (err) {
        Logger.error("SYNC", "Error during cleanup sweep", err);
    }
}

async function cleanArchive(archivePath: string, baseDir: string, excludeFile: string, policy: "purge" | "isolate"): Promise<void> {
    const relPath = relative(baseDir, archivePath);

    if (relPath.toLowerCase().includes("bios")) return;

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
        return;
    }

    const hasGarbage = GARBAGE_PATTERNS.some(p => internalListing.toLowerCase().includes(p.toLowerCase()));
    const hasSafeTools = SAFE_PATTERNS.some(p => internalListing.toLowerCase().includes(p.toLowerCase()));

    if (hasGarbage) Logger.debug("SYNC", `Garbage detected in ${relPath}`);
    if (hasSafeTools) Logger.debug("SYNC", `Safe tools detected in ${relPath}`);

    if (hasGarbage && !hasSafeTools) {
        const dirPath = dirname(archivePath);

        // 2. Extract safe extensions
        for (const ext of KEEP_EXTS) {
            const extractCmd = ENGINE?.type === "7z"
                ? [ENGINE.bin, "e", archivePath, `*${ext}`, `-o${dirPath}`, "-r", "-y"]
                : [ENGINE!.bin, "e", "-r", "-y", archivePath, `*${ext}`, dirPath];

            _spawnSync(extractCmd);
        }

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
            }
        }

        // 3. Add to exclusion
        try {
            // Ensure dir exists just in case
            const excludeDir = dirname(excludeFile);
            if (!existsSync(excludeDir)) mkdirSync(excludeDir, { recursive: true });

            appendFileSync(excludeFile, `${relPath}\n`);
            Logger.info("SYNC", `Purged/Isolated malicious archive: ${relPath}`);
        } catch (e) {
            Logger.error("SYNC", "Failed to update exclusion file", e);
        }

        // 4. Remove original
        try {
            unlinkSync(archivePath);
        } catch (e) {
            Logger.error("SYNC", "Failed to remove original malicious archive", e);
        }
    }
}
