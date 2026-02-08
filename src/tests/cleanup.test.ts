import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "fs";
import { ShieldManager } from "../lib/shield/ShieldManager";
import type { CleanupStats } from "../lib/sync/types";

describe("Malware Shield (Cleanup)", () => {
    const getTestDir = () => join(process.cwd(), `test_cleanup_dir_${Math.random().toString(36).substring(2, 7)}`);
    let testDir = "";
    let excludeFile = "";

    let runCleanupSweep: typeof import("../lib/cleanup").runCleanupSweep;
    let __setArchiveEngine: (mock: { type: "7z" | "rar"; bin: string } | null) => void;
    let __setSpawnSync: (mock: (options: { cmd: string[] } | string[]) => { stdout: Buffer; stderr: Buffer; success: boolean; exitCode: number; pid: number }) => void;

    beforeEach(async () => {
        testDir = getTestDir();
        excludeFile = join(testDir, ".shield-exclude.txt");
        if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });

        const cleanup = await import("../lib/cleanup");
        runCleanupSweep = cleanup.runCleanupSweep;
        __setArchiveEngine = (cleanup as unknown as { __setArchiveEngine: typeof __setArchiveEngine }).__setArchiveEngine;
        __setSpawnSync = (cleanup as unknown as { __setSpawnSync: typeof __setSpawnSync }).__setSpawnSync;

        __setSpawnSync(((options: { cmd: string[] } | string[]) => {
            const args = Array.isArray(options) ? options : options.cmd;
            const cmd = args.join(" ");

            const result = {
                stdout: Buffer.from(""),
                stderr: Buffer.from(""),
                success: true,
                exitCode: 0,
                pid: 1234
            };

            if (cmd.includes(" l ") || cmd.includes(" v ")) {
                if (cmd.includes("malware")) {
                    result.stdout = Buffer.from("lpk.dll\ncrack.exe\nnotes.txt\nboardview.tvw");
                } else if (cmd.includes("safe") || cmd.includes("bios")) {
                    result.stdout = Buffer.from("flash_utility.exe\nbios.bin\nmanual.pdf");
                } else if (cmd.includes("clean_with_structure")) {
                    result.stdout = Buffer.from("Date Time Attr Size Compressed Name\n-----------------------------------\n2026-02-07 07:49:11 ....A 0 0 SubFolder/schematic.pdf");
                } else if (cmd.includes("clean")) {
                    result.stdout = Buffer.from("Date Time Attr Size Compressed Name\n-----------------------------------\n2026-02-07 07:49:11 ....A 0 0 schematic.pdf");
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
                    if (cmd.includes(" *") || cmd.includes(" boardview") || cmd.includes(".tvw")) {
                        writeFileSync(join(stagingDir, "boardview.tvw"), "test content");
                    }
                    if (cmd.includes(" *") || cmd.includes(" schematic") || cmd.includes(".pdf")) {
                        if (cmd.includes("clean_with_structure")) {
                            const sub = join(stagingDir, "SubFolder");
                            if (!existsSync(sub)) mkdirSync(sub, { recursive: true });
                            writeFileSync(join(sub, "schematic.pdf"), "test content");
                        } else {
                            writeFileSync(join(stagingDir, "schematic.pdf"), "test content");
                        }
                    }
                }
            }

            return result;
        }));

        __setArchiveEngine({ type: "7z", bin: "7z" });
    });

    afterEach(() => {
        if (testDir && existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    });

    test("should identify and purge malicious archives", async () => {
        const malwarePath = join(testDir, "malware.zip");
        writeFileSync(malwarePath, "fake zip content");

        await runCleanupSweep(testDir, excludeFile, "purge");

        expect(existsSync(malwarePath)).toBe(false);
        const excludeContent = readFileSync(excludeFile, "utf-8");
        expect(excludeContent).toContain("malware.zip");
    });

    test("should skip safe archives (e.g. BIOS utilities)", async () => {
        const safePath = join(testDir, "safe_utility.zip");
        writeFileSync(safePath, "fake zip content");

        await runCleanupSweep(testDir, excludeFile, "purge");
        expect(existsSync(safePath)).toBe(false);
    });

    test("should isolate risks to _risk_tools if policy is isolate", async () => {
        const malwarePath = join(testDir, "malware_isolate.zip");
        writeFileSync(malwarePath, "fake zip content");

        const stats: CleanupStats = {
            phase: "clean", totalArchives: 1, scannedArchives: 0, safePatternCount: 0, riskyPatternCount: 0,
            cleanArchives: 0, flaggedArchives: 0, extractedFiles: 0, purgedFiles: 0, isolatedFiles: 0, policyMode: "isolate"
        };

        await runCleanupSweep(testDir, excludeFile, "isolate", undefined, undefined, stats);

        const riskDir = join(testDir, "_risk_tools");
        expect(existsSync(riskDir)).toBe(true);
        expect(stats.isolatedFiles).toBeGreaterThan(0);
        expect(existsSync(malwarePath)).toBe(false);
    });

    test("should catch priority archives even if no internal patterns match", async () => {
        const priorityPath = join(testDir, "GV-R580AORUS-8GD-1.0-1.01 Boardview.zip");
        writeFileSync(priorityPath, "fake zip content");

        await runCleanupSweep(testDir, excludeFile, "purge");

        expect(existsSync(priorityPath)).toBe(false);
        const excludeContent = readFileSync(excludeFile, "utf-8");
        expect(excludeContent).toContain("GV-R580AORUS-8GD-1.0-1.01 Boardview.zip");
    });

    test("should extract boardviews from malicious archive and verify paths in stats", async () => {
        const malwarePath = join(testDir, "malware_boardview.zip");
        writeFileSync(malwarePath, "fake zip content");

        const stats: CleanupStats = {
            phase: "clean", totalArchives: 1, scannedArchives: 0, safePatternCount: 0, riskyPatternCount: 0,
            cleanArchives: 0, flaggedArchives: 0, extractedFiles: 0, purgedFiles: 0, isolatedFiles: 0, policyMode: "purge"
        };

        await runCleanupSweep(testDir, excludeFile, "purge", undefined, undefined, stats);

        expect(stats.extractedFiles).toBeGreaterThanOrEqual(1);
        expect(existsSync(join(testDir, "boardview.tvw"))).toBe(true);
    });

    test("should extract clean archives automatically", async () => {
        const cleanPath = join(testDir, "clean.zip");
        writeFileSync(cleanPath, "fake zip content");

        const stats: CleanupStats = {
            phase: "clean", totalArchives: 1, scannedArchives: 0, safePatternCount: 0, riskyPatternCount: 0,
            cleanArchives: 0, flaggedArchives: 0, extractedFiles: 0, purgedFiles: 0, isolatedFiles: 0, policyMode: "purge"
        };
        await runCleanupSweep(testDir, excludeFile, "purge", undefined, undefined, stats);

        expect(stats.extractedFiles).toBeGreaterThanOrEqual(1);
        expect(existsSync(join(testDir, "schematic.pdf"))).toBe(true);
        expect(existsSync(cleanPath)).toBe(false);
    });

    test("should preserve folder structure during extraction", async () => {
        const cleanPath = join(testDir, "clean_with_structure.zip");
        writeFileSync(cleanPath, "fake zip content");

        await runCleanupSweep(testDir, excludeFile, "purge");

        expect(existsSync(join(testDir, "SubFolder", "schematic.pdf"))).toBe(true);
    });

    test("should support extract policy (extract all, trust source)", async () => {
        const malwarePath = join(testDir, "malware_trust.zip");
        writeFileSync(malwarePath, "fake zip content");

        const stats: CleanupStats = {
            phase: "clean", totalArchives: 1, scannedArchives: 0, safePatternCount: 0, riskyPatternCount: 0,
            cleanArchives: 0, flaggedArchives: 0, extractedFiles: 0, purgedFiles: 0, isolatedFiles: 0, policyMode: "extract"
        };

        await runCleanupSweep(testDir, excludeFile, "extract", undefined, undefined, stats);

        expect(stats.extractedFiles).toBeGreaterThanOrEqual(2);
        expect(existsSync(join(testDir, "boardview.tvw"))).toBe(true);
        expect(existsSync(join(testDir, "schematic.pdf"))).toBe(true);
        expect(existsSync(malwarePath)).toBe(false);
        expect(stats.flaggedArchives).toBe(0);
    });

    test("should support lean mode path filtering and subdirectory check", async () => {
        // Direct test of ShieldManager.isFilteredPath which is used by runCleanupSweep
        expect(ShieldManager.isFilteredPath("Motherboards/ASUS/BIOS/update.zip")).toBe(true);
        expect(ShieldManager.isFilteredPath("Schematics/Apple/MacBook/Boardview.zip")).toBe(false);
        expect(ShieldManager.isFilteredPath("bios_update.zip")).toBe(false);
    });
});
