import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { existsSync, writeFileSync, mkdirSync, readFileSync, unlinkSync } from "fs";
import { cleanFile, ShieldManager, __setSpawnSync } from "../lib/cleanup";
import { Env } from "../lib/env";

describe("Local Shield Hardening", () => {
    const testDir = join(process.cwd(), "test_shield_cleanup");

    beforeEach(() => {
        if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
        ShieldManager.resetShield(); // Start clean
    });

    afterEach(() => {
        // Cleanup would go here, but keep for manual check if needed
    });

    it("should purge a direct malware file", async () => {
        const file = join(testDir, "activator.exe");
        writeFileSync(file, "malware content");

        const handled = await cleanFile(file, testDir, "purge");

        expect(handled).toBe(true);
        expect(existsSync(file)).toBe(false);
        expect(ShieldManager.getOffenders()).toContain("activator.exe");
    });

    it("should isolate a direct malware file", async () => {
        const file = join(testDir, "patch.exe");
        writeFileSync(file, "malware content");
        const riskDir = join(testDir, "_risk_tools");

        const handled = await cleanFile(file, testDir, "isolate");

        expect(handled).toBe(true);
        expect(existsSync(file)).toBe(false);
        expect(existsSync(join(riskDir, "patch.exe"))).toBe(true);
        expect(ShieldManager.getOffenders()).toContain("patch.exe");
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
        expect(ShieldManager.getOffenders()).toContain(relPath);
    });
});
