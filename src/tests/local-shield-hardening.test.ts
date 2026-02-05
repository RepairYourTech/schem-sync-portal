import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { cleanFile } from "../lib/cleanup";
import { ShieldManager } from "../lib/shield/ShieldManager";
import { ShieldExecutor } from "../lib/shield/ShieldExecutor";
import type { CleanupStats } from "../lib/sync/types";

describe("Local Shield Hardening", () => {
    const getTestDir = () => join(process.cwd(), `test_shield_cleanup_${Math.random().toString(36).substring(2, 7)}`);
    let testDir = "";

    beforeEach(() => {
        testDir = getTestDir();
        if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
        ShieldManager.resetShield(testDir); // Start clean
    });

    afterEach(() => {
        if (testDir && existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    });

    it("should start with an empty offender list but have priority filenames available", () => {
        expect(ShieldManager.getOffenders(testDir)).toEqual([]);
        expect(ShieldManager.getPriorityFilenames().length).toBeGreaterThan(0);
        expect(ShieldManager.getPriorityFilenames()).toContain("GV-R580AORUS-8GD-1.0-1.01 Boardview.zip");
    });

    it("should purge a direct malware file", async () => {
        const file = join(testDir, "activator.exe");
        writeFileSync(file, "malware content");

        const handled = await cleanFile(file, testDir, "purge");

        expect(handled).toBe(true);
        expect(existsSync(file)).toBe(false);
        expect(ShieldManager.getOffenders(testDir)).toContain("activator.exe");
    });

    it("should isolate a direct malware file", async () => {
        const file = join(testDir, "patch.exe");
        writeFileSync(file, "malware content");
        const riskDir = join(testDir, "_risk_tools");

        const handled = await cleanFile(file, testDir, "isolate");

        expect(handled).toBe(true);
        expect(existsSync(file)).toBe(false);
        expect(existsSync(join(riskDir, "patch.exe"))).toBe(true);
        expect(ShieldManager.getOffenders(testDir)).toContain("patch.exe");
    });

    it("should NOT purge useful files matching patterns", async () => {
        // Use a pattern that exists in GARBAGE_PATTERNS but with a KEEP_EXTS extension
        const file = join(testDir, "boardview_crack_instructions.txt");
        writeFileSync(file, "useful data");

        const handled = await cleanFile(file, testDir, "purge");

        expect(handled).toBe(false);
        expect(existsSync(file)).toBe(true);
    });

    it("should blacklist folders properly in offender list", async () => {
        const file = join(testDir, "subdir", "keygen.exe");
        mkdirSync(join(testDir, "subdir"), { recursive: true });
        writeFileSync(file, "malware content");

        await cleanFile(file, testDir, "purge");

        const relPath = join("subdir", "keygen.exe");
        expect(ShieldManager.getOffenders(testDir)).toContain(relPath);
    });

    it("should catch a PRIORITY_FILENAME even without other malware patterns", async () => {
        const file = join(testDir, "GV-R580AORUS-8GD-1.0-1.01 Boardview.zip");
        writeFileSync(file, "legit content but known bad filename");

        const handled = await cleanFile(file, testDir, "isolate");

        expect(handled).toBe(true);
        expect(existsSync(file)).toBe(false);
        expect(existsSync(join(testDir, "_risk_tools", "GV-R580AORUS-8GD-1.0-1.01 Boardview.zip"))).toBe(true);
        expect(ShieldManager.getOffenders(testDir)).toContain("GV-R580AORUS-8GD-1.0-1.01 Boardview.zip");
    });

    it("should execute shield in all contexts with consistent behavior", async () => {
        const stats: CleanupStats = {
            phase: "clean", totalArchives: 0, scannedArchives: 0, safePatternCount: 0, riskyPatternCount: 0,
            cleanArchives: 0, flaggedArchives: 0, extractedFiles: 0, purgedFiles: 0, isolatedFiles: 0, policyMode: "purge"
        };

        // Test realtime_clean
        const file = join(testDir, "crack.exe");
        writeFileSync(file, "malware content");
        await ShieldExecutor.execute({
            type: "realtime_clean",
            localDir: testDir,
            policy: "purge",
            filePath: file,
            initialStats: stats
        });
        expect(stats.executionContext).toBe("realtime_clean");
        expect(stats.riskyPatternCount).toBe(1);
        expect(existsSync(file)).toBe(false);

        // Test risky_sweep (using no manifest/empty sweep for simplicity in this test)
        await ShieldExecutor.execute({
            type: "risky_sweep",
            localDir: testDir,
            policy: "purge",
            initialStats: stats
        });
        expect(stats.executionContext).toBe("risky_sweep");

        // Test final_sweep
        await ShieldExecutor.execute({
            type: "final_sweep",
            localDir: testDir,
            policy: "purge",
            initialStats: stats
        });
        expect(stats.executionContext).toBe("final_sweep");
    });
});
