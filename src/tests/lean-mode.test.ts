import { describe, test, expect, spyOn, afterAll, beforeAll } from "bun:test";
import { shouldDownloadInLeanMode } from "../lib/shield/archiveAnalyzer";
import { Logger } from "../lib/logger";

// Silencing Logger for tests
const infoSpy = spyOn(Logger, "info").mockImplementation(() => { });
const debugSpy = spyOn(Logger, "debug").mockImplementation(() => { });
const warnSpy = spyOn(Logger, "warn").mockImplementation(() => { });
const errorSpy = spyOn(Logger, "error").mockImplementation(() => { });


describe("Lean Mode Logic", () => {
    afterAll(() => {
        infoSpy.mockRestore();
        debugSpy.mockRestore();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
        delete process.env.PORTAL_CONFIG_PATH;
    });
    test("Allows boardview files", () => {
        expect(shouldDownloadInLeanMode("macbook_pro_2020_boardview.brd")).toBe(true);
        expect(shouldDownloadInLeanMode("iphone_x_fv.f3z")).toBe(true);
        expect(shouldDownloadInLeanMode("motherboard.cad")).toBe(true);
    });

    test("Allows schematic files", () => {
        expect(shouldDownloadInLeanMode("schema.pdf")).toBe(true);
        expect(shouldDownloadInLeanMode("diagram.pdf")).toBe(true);
    });

    test("Blocks BIOS in folders (Hard Stop)", () => {
        expect(shouldDownloadInLeanMode("Computers/BIOS/archive.zip")).toBe(false);
        expect(shouldDownloadInLeanMode("bios/v3.zip")).toBe(false);
    });

    test("Allows other items to pass to Shield (Integrity Layer)", () => {
        expect(shouldDownloadInLeanMode("update.exe")).toBe(true);
        expect(shouldDownloadInLeanMode("flash_tool.zip")).toBe(true);
        // Firmware and Drivers are now blocked at the gate if in a folder
        expect(shouldDownloadInLeanMode("Subfolder/Firmware/update.zip")).toBe(false);
        // BIN and EXE should stay TRUE at GATE, shield cleans them later
        expect(shouldDownloadInLeanMode("bios_dump.bin")).toBe(true);
        expect(shouldDownloadInLeanMode("virus.exe")).toBe(true);
    });

    test("Allows boardview in safe folders", () => {
        expect(shouldDownloadInLeanMode("Boardview/Mac/A2141.brd")).toBe(true);
        expect(shouldDownloadInLeanMode("Schematic/HP/laptop.pdf")).toBe(true);
    });
});

import { cleanFile, runCleanupSweep } from "../lib/cleanup";
import { ShieldManager } from "../lib/shield/ShieldManager";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("ShieldManager Path Filtering", () => {
    test("isFilteredPath prevents false positives", () => {
        expect(ShieldManager.isFilteredPath("BIOS_Schematic.pdf")).toBe(false);
        expect(ShieldManager.isFilteredPath("Computers/BIOS/file.bin")).toBe(true);
        expect(ShieldManager.isFilteredPath("Drivers/install.exe")).toBe(true);
    });
});

describe("Lean Shield Surgical Cleaning", () => {
    const testDir = join(tmpdir(), "lean-shield-test-" + Date.now());

    beforeAll(() => {
        if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    });

    afterAll(() => {
        if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    });

    test("Purges BIOS dumps in lean mode even if safe", async () => {
        const biosPath = join(testDir, "save_this.bin");
        writeFileSync(biosPath, "fake bios data");

        // In full mode, .bin is in KEEP_EXTS
        const keptInFull = await cleanFile(biosPath, testDir, "purge", undefined, undefined, "full");
        expect(keptInFull).toBe(false);
        expect(existsSync(biosPath)).toBe(true);

        // In lean mode, .bin is NOT in whitelist
        const purgedInLean = await cleanFile(biosPath, testDir, "purge", undefined, undefined, "lean");
        expect(purgedInLean).toBe(true);
        expect(existsSync(biosPath)).toBe(false);
    });

    test("Purges non-whitelisted/non-blacklisted files (e.g., .json) in lean mode", async () => {
        const jsonPath = join(testDir, "metadata.json");
        writeFileSync(jsonPath, "{}");

        // In full mode, .json is in KEEP_EXTS (it was modified to be in KEEP_EXTS in v1.2.3)
        const keptInFull = await cleanFile(jsonPath, testDir, "purge", undefined, undefined, "full");
        expect(keptInFull).toBe(false);
        expect(existsSync(jsonPath)).toBe(true);

        // In lean mode, .json is NOT in whitelist (it's dropped)
        const purgedInLean = await cleanFile(jsonPath, testDir, "purge", undefined, undefined, "lean");
        expect(purgedInLean).toBe(true);
        expect(existsSync(jsonPath)).toBe(false);
    });

    test("Keeps valuable files in lean mode", async () => {
        const pdfPath = join(testDir, "schematic.pdf");
        const obdataPath = join(testDir, "board.obdata");
        writeFileSync(pdfPath, "pdf content");
        writeFileSync(obdataPath, "obdata content");

        const pdfResult = await cleanFile(pdfPath, testDir, "purge", undefined, undefined, "lean");
        const obdataResult = await cleanFile(obdataPath, testDir, "purge", undefined, undefined, "lean");

        expect(pdfResult).toBe(false);
        expect(obdataResult).toBe(false);
        expect(existsSync(pdfPath)).toBe(true);
        expect(existsSync(obdataPath)).toBe(true);
    });

    test("Extract policy trusts all standalone files", async () => {
        const binPath = join(testDir, "malware.bin");
        writeFileSync(binPath, "dodgy stuff");

        // In purge/lean mode, this would be removed
        // In extract mode, it must survive
        const result = await cleanFile(binPath, testDir, "extract", undefined, undefined, "lean");
        expect(result).toBe(false);
        expect(existsSync(binPath)).toBe(true);
    });

    test("Extract policy trusts archive content and skips surgery", async () => {
        // Create a fake archive listing and staged files
        const archiveDir = join(testDir, "extract-test");
        if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });

        const zipPath = join(archiveDir, "test.zip");
        writeFileSync(zipPath, "fake zip content");

        const binPath = join(archiveDir, "nested.bin");
        writeFileSync(binPath, "nested content");

        // We use runCleanupSweep to test the full flow
        const stats = {
            phase: "clean" as const,
            totalArchives: 1,
            scannedArchives: 0,
            safePatternCount: 0,
            riskyPatternCount: 0,
            cleanArchives: 0,
            flaggedArchives: 0,
            extractedFiles: 0,
            purgedFiles: 0,
            isolatedFiles: 0,
            policyMode: "extract" as const
        };

        // Note: cleanArchive will try to run 7z/rar. 
        // In this test env, it might fail if tools aren't there, 
        // but we want to verify it skips the surgeons.
        // We'll mock the engine to ensure it "successfully" extracts something.

        const _result = await runCleanupSweep(archiveDir, "", "extract", undefined, undefined, stats, "lean");

        // Even if extraction "fails" due to missing 7z, the standalone scan should be skipped
        // Let's create a standalone bin file that WOULD be purged if Phase 2 ran.
        const standaloneBin = join(archiveDir, "standalone.bin");
        writeFileSync(standaloneBin, "standalone content");

        await runCleanupSweep(archiveDir, "", "extract", undefined, undefined, stats, "lean");

        expect(existsSync(standaloneBin)).toBe(true);
        expect(stats.purgedFiles).toBe(0);
        expect(stats.isolatedFiles).toBe(0);
    });
});
