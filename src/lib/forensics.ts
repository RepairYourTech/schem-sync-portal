import { runCleanupSweep } from "./cleanup.ts";
import { ShieldManager } from "./shield/ShieldManager";
import type { CleanupStats } from "./sync/types";
import { spawn } from "bun";
import { Logger } from "./logger";
import { resolve } from "path";

export interface ForensicProgress {
    currentFile: string;
    filesProcessed: number;
    totalFiles: number;
    status: "scanning" | "cleaning" | "scrubbing" | "done" | "error";
}

export async function runForensicSweep(
    targetDir: string,
    excludeFile: string,
    gdriveRemote: string | null,
    onProgress: (p: ForensicProgress) => void
): Promise<void> {
    Logger.info("SYNC", "Starting Forensic Sweep...");
    try {
        if (!targetDir || targetDir === "" || targetDir === "none") {
            throw new Error("Target directory not set.");
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

        // Step 2: Surgical Cloud Scrub (Due Diligence)
        if (gdriveRemote) {
            // Merge hardcoded knowns with dynamic offenders from ShieldManager
            const dynamicOffenders = ShieldManager.getOffenders(targetDir).map(o => o.split("/").pop()).filter(Boolean) as string[];
            const flaggedFiles = Array.from(new Set([
                "GV-R939XG1 GAMING-8GD-1.0-1.01 Boardview.zip",
                "GV-R938WF2-4GD-1.0 Boardview.zip",
                "IOT73 V3.0 TG-B75.zip",
                "GV-R938G1 GAMING-4GD-1.02 Boardview.zip",
                "GV-RX470G1 GAMING-4GD-0.2 Boardview.zip",
                "GV-RX480G1 GAMING-4GD-1.1 Boardview.zip",
                "BIOS_K54C usb 3.0_factory-Chinafix.zip",
                "BIOS_K54LY usb 3.0_factory-Chinafix.zip",
                "DANL9MB18F0 (tvw).rar",
                ...dynamicOffenders
            ]));

            for (let i = 0; i < flaggedFiles.length; i++) {
                const file = flaggedFiles[i];
                onProgress({
                    currentFile: `Cloud Scrub: ${file}`,
                    filesProcessed: i + 1,
                    totalFiles: flaggedFiles.length,
                    status: "scrubbing"
                });

                await new Promise<void>((resolve) => {
                    const proc = spawn(["rclone", "delete", `${gdriveRemote}:${file}`, "--ignore-errors"]);
                    const check = async () => {
                        await proc.exited;
                        resolve();
                    };
                    check();
                });
            }
        }

        onProgress({ currentFile: "Forensic Sweep Complete.", filesProcessed: 100, totalFiles: 100, status: "done" });
        Logger.info("SYNC", "Forensic Sweep Complete.");

    } catch (err: unknown) {
        const error = err as Error;
        onProgress({ currentFile: `Forensic Error: ${error.message}`, filesProcessed: 0, totalFiles: 0, status: "error" });
        Logger.error("SYNC", "Forensic Sweep failed", error);
    }
}
