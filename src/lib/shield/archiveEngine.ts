import { spawnSync as bunSpawnSync } from "bun";
import { Env } from "../env";

export interface ArchiveEngine { type: "7z" | "rar"; bin: string; }

let _overrideSpawnSync: typeof bunSpawnSync | null = null;
export function __setSpawnSync(mock: typeof bunSpawnSync) { _overrideSpawnSync = mock; }
export function getSpawnSync() { return _overrideSpawnSync || bunSpawnSync; }

function detectArchiveEngine(): ArchiveEngine | null {
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
export function getEngine(): ArchiveEngine | null {
    return _overrideEngine !== null ? _overrideEngine : detectArchiveEngine();
}

/**
 * Whether an extractor invocation completed without error.
 *
 * Verified against 7z 24.x: a pattern that matches nothing still exits 0, while a
 * corrupt, truncated, or wrongly-password-protected archive exits 2. unrar signals
 * "no files matched" with code 10, which is likewise not a failure.
 *
 * Anything else means we could not account for the archive's contents, and the
 * caller must not delete it.
 */
export function isExtractorOk(result: { exitCode?: number } | null | undefined, engineType: "7z" | "rar"): boolean {
    if (!result) return false;
    const code = result.exitCode ?? 1;
    if (code === 0) return true;
    if (engineType === "rar" && code === 10) return true;
    return false;
}
