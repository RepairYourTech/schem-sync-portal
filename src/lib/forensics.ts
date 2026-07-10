import { runCleanupSweep } from "./cleanup.ts";
import { ShieldManager } from "./shield/ShieldManager";
import type { CleanupStats } from "./sync/types";
import { getRcloneCmd } from "./sync/utils";
import { Env } from "./env";
import { spawn } from "bun";
import { Logger } from "./logger";
import { resolve } from "path";

export interface ForensicProgress {
    currentFile: string;
    filesProcessed: number;
    totalFiles: number;
    status: "scanning" | "cleaning" | "scrubbing" | "done" | "error";
}

export interface ForensicOptions {
    /**
     * Delete the flagged files from the remote as well as locally.
     *
     * Off by default: remote deletion is irreversible and touches storage the user may
     * share with others. The caller must obtain explicit confirmation first.
     */
    scrubRemote?: boolean;
}

export async function runForensicSweep(
    targetDir: string,
    excludeFile: string,
    gdriveRemote: string | null,
    onProgress: (p: ForensicProgress) => void,
    options: ForensicOptions = {}
): Promise<void> {
    Logger.info("SYNC", "Starting Forensic Sweep...");
    try {
        if (!targetDir || targetDir === "" || targetDir === "none") {
            throw new Error("Target directory not set.");
        }

        const unsafeReason = Env.getUnsafeDirectoryReason(targetDir);
        if (unsafeReason) {
            throw new Error(`Unsafe target directory: ${unsafeReason}`);
        }

        const projectRoot = resolve(process.cwd());
        const targetAbs = resolve(targetDir);
        if (targetAbs === projectRoot) {
            throw new Error("Cannot run Forensic Sweep on the project root. Please select a specific schematics folder.");
        }

        onProgress({ currentFile: "Scanning for archives...", filesProcessed: 0, totalFiles: 0, status: "scanning" });

        // Step 1: Local Surgery (The Heavy Lifting)
        await runCleanupSweep(targetDir, excludeFile, "isolate", (cStats) => {
            const stats = cStats as CleanupStats;
            onProgress({
                currentFile: stats.currentArchive || "Processing...",
                filesProcessed: stats.scannedArchives,
                totalFiles: stats.totalArchives,
                status: "cleaning"
            });
        });

        // Step 2: Surgical Cloud Scrub (opt-in, malware only)
        if (gdriveRemote && options.scrubRemote) {
            // Only files removed because they matched a threat pattern. Lean-mode records
            // mean "not a schematic file type" and must never delete remote data.
            const flaggedFiles = Array.from(new Set(
                ShieldManager.getMalwareOffenders(targetDir)
                    .map(o => o.split("/").pop())
                    .filter((f): f is string => Boolean(f))
            ));

            if (flaggedFiles.length === 0) {
                Logger.info("SYNC", "Cloud scrub requested but no malware offenders recorded; nothing to delete.");
            }

            const rcloneCmd = getRcloneCmd();
            for (let i = 0; i < flaggedFiles.length; i++) {
                const file = flaggedFiles[i]!;
                onProgress({
                    currentFile: `Cloud Scrub: ${file}`,
                    filesProcessed: i + 1,
                    totalFiles: flaggedFiles.length,
                    status: "scrubbing"
                });

                const proc = spawn([
                    rcloneCmd[0] as string,
                    ...rcloneCmd.slice(1),
                    "--config", Env.getRcloneConfigPath(),
                    "delete", `${gdriveRemote}:${file}`
                ], { stdout: "pipe", stderr: "pipe" });

                const exitCode = await proc.exited;
                if (exitCode !== 0) {
                    Logger.error("SYNC", `Cloud scrub failed for ${file} (rclone exit ${exitCode}); continuing.`);
                } else {
                    Logger.info("SYNC", `Cloud scrub removed ${file} from ${gdriveRemote}.`);
                }
            }
        } else if (gdriveRemote) {
            Logger.info("SYNC", "Cloud scrub skipped: remote deletion was not explicitly confirmed.");
        }

        onProgress({ currentFile: "Forensic Sweep Complete.", filesProcessed: 100, totalFiles: 100, status: "done" });
        Logger.info("SYNC", "Forensic Sweep Complete.");

    } catch (err: unknown) {
        const error = err as Error;
        onProgress({ currentFile: `Forensic Error: ${error.message}`, filesProcessed: 0, totalFiles: 0, status: "error" });
        Logger.error("SYNC", "Forensic Sweep failed", error);
    }
}
