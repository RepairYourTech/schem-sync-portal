import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { Logger } from "../lib/logger";
import { join } from "path";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { ShieldManager } from "../lib/shield/ShieldManager";
import { runCleanupSweep, __setArchiveEngine, __setSpawnSync } from "../lib/cleanup";
import type { CleanupStats } from "../lib/sync/types";

describe("Malware Shield (Hardening)", () => {
    const getTestDir = () => join(process.cwd(), `test_hardening_dir_${Math.random().toString(36).substring(2, 7)}`);
    let testDir = "";
    let excludeFile = "";

    beforeEach(() => {
        testDir = getTestDir();
        excludeFile = join(testDir, ".shield-exclude.txt");
        if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });

        // Reset ShieldManager for this directory
        ShieldManager.resetShield(testDir);

        __setArchiveEngine({ type: "7z", bin: "7z" });
        Logger.setLevel("DEBUG");
        Logger.clearLogs();
    });

    afterEach(() => {
        if (testDir && existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    });

    test("should handle archive listing failure (fail-safe)", async () => {
        // Mock spawnSync to simulate a failed listing command
        __setSpawnSync(((options: string[] | { cmd: string[] }) => {
            const args = Array.isArray(options) ? options : (options as { cmd: string[] }).cmd;
            const cmd = args.join(" ");

            if (cmd.includes(" l ") || cmd.includes(" v ")) {
                return {
                    stdout: Buffer.from("ERROR: Cannot open archive"),
                    stderr: Buffer.from("Failed to list"),
                    success: false,
                    exitCode: 1
                };
            }
            return { stdout: Buffer.from(""), success: true, exitCode: 0 };
        }) as any); // eslint-disable-line @typescript-eslint/no-explicit-any

        const corruptPath = join(testDir, "corrupt.zip");
        writeFileSync(corruptPath, "corrupt zip content");

        const stats: CleanupStats = {
            phase: "clean", totalArchives: 0, scannedArchives: 0, safePatternCount: 0, riskyPatternCount: 0,
            cleanArchives: 0, flaggedArchives: 0, extractedFiles: 0, purgedFiles: 0, isolatedFiles: 0, policyMode: "purge",
            extractedFilePaths: []
        };

        await runCleanupSweep(testDir, excludeFile, "purge", undefined, undefined, stats);

        // Fail-safe should have purged it
        expect(existsSync(corruptPath)).toBe(false);
        expect(stats.flaggedArchives).toBe(1);
        expect(stats.invalidListingArchives).toBe(1);
    });

    test("should detect and clean standalone malicious files", async () => {
        // Mock listing to return empty for all archives
        __setSpawnSync(((_options: unknown) => ({ stdout: Buffer.from(""), success: true, exitCode: 0 })) as any); // eslint-disable-line @typescript-eslint/no-explicit-any

        // Create a standalone malicious file
        const malwarePath = join(testDir, "lpk.dll");
        writeFileSync(malwarePath, "fake malware");

        const stats: CleanupStats = {
            phase: "clean", totalArchives: 0, scannedArchives: 0, safePatternCount: 0, riskyPatternCount: 0,
            cleanArchives: 0, flaggedArchives: 0, extractedFiles: 0, purgedFiles: 0, isolatedFiles: 0, policyMode: "purge",
            extractedFilePaths: []
        };

        await runCleanupSweep(testDir, excludeFile, "purge", undefined, undefined, stats);

        // Should be detected by standalone scan
        expect(existsSync(malwarePath)).toBe(false);
        expect(stats.flaggedStandaloneFiles).toBe(1);
        expect(stats.totalStandaloneFiles).toBeGreaterThan(0);
    });

    test("should recursively clean nested archives", async () => {
        const parentPath = join(testDir, "parent.zip");
        writeFileSync(parentPath, "parent zip content");

        let nestedPathInStaging = "";

        __setSpawnSync(((options: string[] | { cmd: string[] }) => {
            const args = Array.isArray(options) ? options : (options as { cmd: string[] }).cmd;
            const cmd = args.join(" ");

            const res = { stdout: Buffer.from(""), success: true, exitCode: 0 };

            if (cmd.includes(" l ") || cmd.includes(" v ")) {
                if (cmd.includes("parent.zip")) {
                    res.stdout = Buffer.from("lpk.dll\nnested.zip\nsafe.tvw");
                } else if (cmd.includes("nested.zip")) {
                    res.stdout = Buffer.from("crack.exe\nmanual.pdf");
                }
            } else if (cmd.includes(" x ")) {
                let stagingDir: string = "";
                if (cmd.includes("-o")) {
                    const match = cmd.match(/-o([^ ]+)/);
                    if (match && match[1]) stagingDir = match[1];
                } else {
                    stagingDir = args[args.length - 1] || "";
                }

                if (stagingDir && existsSync(stagingDir)) {
                    if (cmd.includes("parent.zip")) {
                        // Create nested archive and safe file in staging
                        nestedPathInStaging = join(stagingDir, "nested.zip");
                        writeFileSync(nestedPathInStaging, "nested zip content");
                        writeFileSync(join(stagingDir, "safe.tvw"), "safe content");
                    }
                }
            }
            return res;
        }) as any); // eslint-disable-line @typescript-eslint/no-explicit-any

        const stats: CleanupStats = {
            phase: "clean", totalArchives: 0, scannedArchives: 0, safePatternCount: 0, riskyPatternCount: 0,
            cleanArchives: 0, flaggedArchives: 0, extractedFiles: 0, purgedFiles: 0, isolatedFiles: 0, policyMode: "purge",
            extractedFilePaths: []
        };

        await runCleanupSweep(testDir, excludeFile, "purge", undefined, undefined, stats);

        // Parent should be purged
        expect(existsSync(parentPath)).toBe(false);

        // Nested stats should be updated
        expect(stats.nestedArchivesFound).toBe(1);
        expect(stats.nestedArchivesCleaned).toBe(1);

        // Safe file should have been extracted to testDir
        expect(existsSync(join(testDir, "safe.tvw"))).toBe(true);
    });

    test("should skip already-verified extracted files during standalone scan", async () => {
        // Mock extraction
        const stats: CleanupStats = {
            phase: "clean", totalArchives: 0, scannedArchives: 0, safePatternCount: 0, riskyPatternCount: 0,
            cleanArchives: 0, flaggedArchives: 0, extractedFiles: 0, purgedFiles: 0, isolatedFiles: 0, policyMode: "purge",
            extractedFilePaths: ["extra.tvw"] // Say we extracted this
        };

        // Create the "extracted" file
        writeFileSync(join(testDir, "extra.tvw"), "content");

        await runCleanupSweep(testDir, excludeFile, "purge", undefined, undefined, stats);

        // standalone scan should NOT flag extra.tvw because it's in extractedFilePaths
        expect(existsSync(join(testDir, "extra.tvw"))).toBe(true);
        expect(stats.flaggedStandaloneFiles || 0).toBe(0);
    });

    test("should run standalone scan even without archive engine", async () => {
        // Disable engine
        __setArchiveEngine(null);

        // Create a standalone malicious file
        const malwarePath = join(testDir, "lpk.dll");
        writeFileSync(malwarePath, "fake malware");

        const stats: CleanupStats = {
            phase: "clean", totalArchives: 0, scannedArchives: 0, safePatternCount: 0, riskyPatternCount: 0,
            cleanArchives: 0, flaggedArchives: 0, extractedFiles: 0, purgedFiles: 0, isolatedFiles: 0, policyMode: "purge",
            extractedFilePaths: []
        };

        // This should NOT throw and should clean the file
        await runCleanupSweep(testDir, excludeFile, "purge", undefined, undefined, stats);

        expect(existsSync(malwarePath)).toBe(false);
        expect(stats.flaggedStandaloneFiles).toBe(1);
    });
});
