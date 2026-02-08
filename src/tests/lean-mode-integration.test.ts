
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { ShieldExecutor } from "../lib/shield/ShieldExecutor";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Lean Shield Integration Flow", () => {
    const testDir = join(tmpdir(), "lean-integration-" + Date.now());

    beforeAll(() => {
        if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    });

    afterAll(() => {
        if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    });

    test("End-to-End: Lean Mode strips BIN and keeps PDF", async () => {
        const localDir = join(testDir, "sync_target");
        if (!existsSync(localDir)) mkdirSync(localDir);

        const valuablePath = join(localDir, "schematic_v1.pdf");
        const bloatPath = join(localDir, "firmware_dump.bin");
        const exePath = join(localDir, "tool.exe");

        writeFileSync(valuablePath, "pdf content");
        writeFileSync(bloatPath, "bin content");
        writeFileSync(exePath, "exe content");

        // Run Shield in LEAN mode
        await ShieldExecutor.execute({
            type: "final_sweep",
            localDir: localDir,
            policy: "purge",
            mode: "lean"
        });

        // Verifications
        expect(existsSync(valuablePath)).toBe(true);  // Whitelisted Goods
        expect(existsSync(bloatPath)).toBe(false);     // Blacklisted Excess
        expect(existsSync(exePath)).toBe(false);       // Blacklisted Excess
    });

    test("End-to-End: Full Mode preserves both BIN and PDF", async () => {
        const localDir = join(testDir, "sync_full");
        if (!existsSync(localDir)) mkdirSync(localDir);

        const valuablePath = join(localDir, "schematic_v2.pdf");
        const biosPath = join(localDir, "factory.bin");

        writeFileSync(valuablePath, "pdf content");
        writeFileSync(biosPath, "bin content");

        // Run Shield in FULL mode
        await ShieldExecutor.execute({
            type: "final_sweep",
            localDir: localDir,
            policy: "purge",
            mode: "full"
        });

        // Verifications
        expect(existsSync(valuablePath)).toBe(true);
        expect(existsSync(biosPath)).toBe(true); // .bin is in KEEP_EXTS for full mode
    });

    test("Mixed folder structures are handled correctly", async () => {
        const localDir = join(testDir, "sync_mixed");
        if (!existsSync(localDir)) mkdirSync(localDir);

        const goodSub = join(localDir, "Valid_Folder");
        const badSub = join(localDir, "BIOS_Dump");
        mkdirSync(goodSub);
        mkdirSync(badSub);

        const goodFile = join(goodSub, "diagram.pdf");
        const badFile = join(goodSub, "hidden_bios.rom");
        const nestedGood = join(badSub, "A2141.brd");

        writeFileSync(goodFile, "pdf content");
        writeFileSync(badFile, "rom content");
        writeFileSync(nestedGood, "brd content");

        await ShieldExecutor.execute({
            type: "final_sweep",
            localDir: localDir,
            policy: "purge",
            mode: "lean"
        });

        expect(existsSync(goodFile)).toBe(true);
        expect(existsSync(badFile)).toBe(false); // ROM stripped even in good folder
        expect(existsSync(nestedGood)).toBe(true); // BRD kept even in "BIOS" folder (Separation of Concerns)
    });
});
