import { glob } from "glob";
import { runCleanupSweep } from "./cleanup.ts";
import { spawn } from "bun";
import { Logger } from "./logger";

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
        onProgress({ currentFile: "Scanning for archives...", filesProcessed: 0, totalFiles: 0, status: "scanning" });

        const archives = await glob("**/*.{zip,7z,rar}", { cwd: targetDir, absolute: true });
        const total = archives.length;

        // Step 1: Local Surgery
        for (let i = 0; i < total; i++) {
            const archive = archives[i];
            if (!archive) continue;
            onProgress({
                currentFile: `Local: ${archive.split("/").pop() || ""}`,
                filesProcessed: i + 1,
                totalFiles: total,
                status: "cleaning"
            });

            await runCleanupSweep(targetDir, excludeFile, "isolate");
        }

        // Step 2: Surgical Cloud Scrub (Due Diligence)
        if (gdriveRemote) {
            const flaggedFiles = [
                "GV-R939XG1 GAMING-8GD-1.0-1.01 Boardview.zip",
                "GV-R938WF2-4GD-1.0 Boardview.zip",
                "IOT73 V3.0 TG-B75.zip",
                "GV-R938G1 GAMING-4GD-1.02 Boardview.zip",
                "GV-RX470G1 GAMING-4GD-0.2 Boardview.zip",
                "GV-RX480G1 GAMING-4GD-1.1 Boardview.zip",
                "BIOS_K54C usb 3.0_factory-Chinafix.zip",
                "BIOS_K54LY usb 3.0_factory-Chinafix.zip",
                "DANL9MB18F0 (tvw).rar"
            ];

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

        onProgress({ currentFile: "Forensic Sweep Complete.", filesProcessed: total, totalFiles: total, status: "done" });
        Logger.info("SYNC", "Forensic Sweep Complete.");

    } catch (err: unknown) {
        const error = err as Error;
        onProgress({ currentFile: `Forensic Error: ${error.message}`, filesProcessed: 0, totalFiles: 0, status: "error" });
        Logger.error("SYNC", "Forensic Sweep failed", error);
    }
}
