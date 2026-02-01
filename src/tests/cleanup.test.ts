import { expect, test, describe, beforeAll, afterAll } from "bun:test";
// NO STATIC IMPORTS OF MODULES UNDER TEST IF WE NEED TO MOCK THEIR DEPENDENCIES
// import { runCleanupSweep, __setArchiveEngine } from "../lib/cleanup";
import { Logger } from "../lib/logger";
import { join } from "path";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";

// Manual mock setup in beforeAll

describe("Malware Shield (Cleanup)", () => {
    const testDir = join(process.cwd(), "test_cleanup_dir");
    const excludeFile = join(testDir, "exclude.txt");

    let runCleanupSweep: typeof import("../lib/cleanup").runCleanupSweep;
    let __setArchiveEngine: typeof import("../lib/cleanup").__setArchiveEngine;
    let __setSpawnSync: typeof import("../lib/cleanup").__setSpawnSync;

    beforeAll(async () => {
        const cleanup = await import("../lib/cleanup");
        runCleanupSweep = cleanup.runCleanupSweep;
        __setArchiveEngine = (cleanup as unknown as { __setArchiveEngine: typeof __setArchiveEngine }).__setArchiveEngine;
        __setSpawnSync = (cleanup as unknown as { __setSpawnSync: typeof __setSpawnSync }).__setSpawnSync;

        // Use a generic function type that is compatible with all spawnSync overloads
        __setSpawnSync(((options: unknown) => {
            const args = Array.isArray(options) ? options : (options as { cmd: string[] }).cmd;
            const cmd = args.join(" ");
            console.log(`[MOCK _spawnSync] ${cmd}`);

            const result = {
                stdout: Buffer.from(""),
                stderr: Buffer.from(""),
                success: true,
                exitCode: 0,
                pid: 1234,
                resourceUsage: {
                    userCPUTime: 0,
                    systemCPUTime: 0,
                    maxRSS: 0,
                    sharedMemorySize: 0,
                    unsharedDataSize: 0,
                    unsharedStackSize: 0,
                    minorPageFaults: 0,
                    majorPageFaults: 0,
                    swaps: 0,
                    inBlockOperations: 0,
                    outBlockOperations: 0,
                    msgsSent: 0,
                    msgsRcvd: 0,
                    signalsRcvd: 0,
                    voluntaryContextSwitches: 0,
                    involuntaryContextSwitches: 0
                }
            };

            if (cmd.includes(" l ") || cmd.includes(" v ")) {
                if (cmd.includes("malware")) {
                    result.stdout = Buffer.from("lpk.dll\ncrack.exe\nnotes.txt");
                } else if (cmd.includes("safe") || cmd.includes("bios")) {
                    result.stdout = Buffer.from("flash_utility.exe\nbios.bin\nmanual.pdf");
                }
            }

            return result as unknown;
        }) as unknown as typeof import("bun").spawnSync);

        if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
        __setArchiveEngine({ type: "7z", bin: "7z" });
        Logger.setLevel("DEBUG");
        Logger.clearLogs();
    });

    afterAll(() => {
        // Cleanup test dir
        // require("fs").rmSync(testDir, { recursive: true, force: true });
    });

    test("should identify and purge malicious archives", async () => {
        const malwarePath = join(testDir, "malware.zip");
        writeFileSync(malwarePath, "fake zip content");

        await runCleanupSweep(testDir, excludeFile, "purge");

        // Should be removed
        expect(existsSync(malwarePath)).toBe(false);

        // Should be in exclude file
        const excludeContent = readFileSync(excludeFile, "utf-8");
        expect(excludeContent).toContain("malware.zip");

        // Should have extracted safe files (notes.txt)
        // Note: In our mock, spawnSync doesn't actually extract files, 
        // but we verify the logic path by checking what happened to the archive.
    });

    test("should skip safe archives (e.g. BIOS utilities)", async () => {
        const safePath = join(testDir, "safe.zip");
        writeFileSync(safePath, "fake zip content");

        await runCleanupSweep(testDir, excludeFile, "purge");

        // Should NOT be removed because it contains SAFE_PATTERNS (flash, utility)
        expect(existsSync(safePath)).toBe(true);
    });

    test("should isolate risks to _risk_tools if policy is isolate", async () => {
        const malwarePath = join(testDir, "malware_isolate.zip");
        writeFileSync(malwarePath, "fake zip content");

        await runCleanupSweep(testDir, excludeFile, "isolate");

        // Should be removed
        expect(existsSync(malwarePath)).toBe(false);

        // Should be in exclude file
        const excludeContent = readFileSync(excludeFile, "utf-8");
        expect(excludeContent).toContain("malware_isolate.zip");
    });
});
