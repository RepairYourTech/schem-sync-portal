import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { Logger } from "../lib/logger";
import { join } from "path";
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "fs";
import { ShieldManager } from "../lib/shield/ShieldManager";

describe("Malware Shield (Cleanup)", () => {
    const getTestDir = () => join(process.cwd(), `test_cleanup_dir_${Math.random().toString(36).substring(2, 7)}`);
    let testDir = "";
    let excludeFile = "";

    let runCleanupSweep: typeof import("../lib/cleanup").runCleanupSweep;
    let __setArchiveEngine: typeof import("../lib/cleanup").__setArchiveEngine;
    let __setSpawnSync: typeof import("../lib/cleanup").__setSpawnSync;

    beforeEach(async () => {
        testDir = getTestDir();
        excludeFile = join(testDir, ".shield-exclude.txt");
        if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });

        const cleanup = await import("../lib/cleanup");
        runCleanupSweep = cleanup.runCleanupSweep;
        __setArchiveEngine = (cleanup as any).__setArchiveEngine; // eslint-disable-line @typescript-eslint/no-explicit-any
        __setSpawnSync = (cleanup as any).__setSpawnSync; // eslint-disable-line @typescript-eslint/no-explicit-any

        __setSpawnSync(((options: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            const args = Array.isArray(options) ? options : (options as { cmd: string[] }).cmd;
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
                    if (cmd.includes(".tvw")) {
                        writeFileSync(join(stagingDir, "boardview.tvw"), "test content");
                    }
                }
            }

            return result as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        }) as any); // eslint-disable-line @typescript-eslint/no-explicit-any

        __setArchiveEngine({ type: "7z", bin: "7z" });
        Logger.setLevel("DEBUG");
        Logger.clearLogs();
    });

    afterEach(() => {
        if (testDir && existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    });


    test("should identify and purge malicious archives", async () => {
        const malwarePath = join(testDir, "malware.zip");
        writeFileSync(malwarePath, "fake zip content");

        await runCleanupSweep(testDir, excludeFile, "purge");

        // Should be removed
        expect(existsSync(malwarePath)).toBe(false);

        // Should be in exclude file via ShieldManager's sync
        const excludeContent = readFileSync(excludeFile, "utf-8");
        expect(excludeContent).toContain("malware.zip");

        // Verified boardview.tvw should have been moved from staging to testDir
        expect(existsSync(join(testDir, "boardview.tvw"))).toBe(true);
    });

    test("should skip safe archives (e.g. BIOS utilities)", async () => {
        const safePath = join(testDir, "safe.zip");
        writeFileSync(safePath, "fake zip content");

        await runCleanupSweep(testDir, excludeFile, "purge");

        // Should NOT be removed because it contains SAFE_PATTERNS
        expect(existsSync(safePath)).toBe(true);
    });

    test("should isolate risks to _risk_tools if policy is isolate", async () => {
        const malwarePath = join(testDir, "malware_isolate.zip");
        writeFileSync(malwarePath, "fake zip content");

        await runCleanupSweep(testDir, excludeFile, "isolate");

        expect(existsSync(malwarePath)).toBe(false);
        expect(existsSync(join(testDir, "_risk_tools", "malware_isolate.zip"))).toBe(true);
    });

    test("should catch priority archives even if no internal patterns match", async () => {
        ShieldManager.resetShield(testDir);

        const priorityPath = join(testDir, "GV-R580AORUS-8GD-1.0-1.01 Boardview.zip");
        writeFileSync(priorityPath, "fake zip content");

        await runCleanupSweep(testDir, excludeFile, "purge");

        expect(existsSync(priorityPath)).toBe(false);
        const excludeContent = readFileSync(excludeFile, "utf-8");
        expect(excludeContent).toContain("GV-R580AORUS-8GD-1.0-1.01 Boardview.zip");
    });
});
