import { expect, test, describe, beforeAll } from "bun:test";
import { Env } from "../lib/env";
import { Logger } from "../lib/logger";
import type { Dirent } from "fs";
import type { DependencyStatus, FontDetectionResult } from "../lib/doctor";

describe("System Diagnostics (Doctor)", () => {
    let checkDependencies: () => Promise<DependencyStatus>;
    let detectNerdFonts: () => Promise<FontDetectionResult>;
    let __setSpawnSync: (fn: (args: string[]) => { success: boolean; stdout: Buffer }) => void;

    beforeAll(async () => {
        const doctor = await import("../lib/doctor");
        checkDependencies = doctor.checkDependencies;
        detectNerdFonts = doctor.detectNerdFonts;
        __setSpawnSync = (doctor as unknown as { __setSpawnSync: typeof __setSpawnSync }).__setSpawnSync;
        Logger.setLevel("DEBUG");
    });

    test("should detect dependency versions (Linux flow)", async () => {
        // Mock Linux environment
        Object.defineProperty(Env, "isWin", { get: () => false, configurable: true });
        Object.defineProperty(Env, "isMac", { get: () => false, configurable: true });

        __setSpawnSync((args: string[]) => {
            const cmd = args[0];
            if (cmd === "bun") return { success: true, stdout: Buffer.from("1.0.0\n") };
            if (cmd === "zig") return { success: true, stdout: Buffer.from("0.11.0\n") };
            if (cmd === "rclone") return { success: true, stdout: Buffer.from("rclone v1.65.0\n") };
            if (cmd === "df") return { success: true, stdout: Buffer.from("Filesystem Size Used Avail Use% Mounted on\n/dev/sda1 100G 20G 80G 20% /") };
            return { success: false, stdout: Buffer.from("") };
        });

        // Mock findBinary for archive check
        const originalFindBinary = Env.findBinary;
        Env.findBinary = () => "/usr/bin/7z";

        const status = await checkDependencies();

        expect(status.bun).toBe("1.0.0");
        expect(status.diskSpace).toBe("80G");
        expect(status.archive).toBe("Available");

        Env.findBinary = originalFindBinary;
    });

    test("should detect dependency versions (Mac flow)", async () => {
        // Mock Mac environment
        Object.defineProperty(Env, "isWin", { get: () => false, configurable: true });
        Object.defineProperty(Env, "isMac", { get: () => true, configurable: true });

        __setSpawnSync((args: string[]) => {
            const cmd = args[0];
            if (cmd === "bun") return { success: true, stdout: Buffer.from("1.1.0\n") };
            if (cmd === "zig") return { success: true, stdout: Buffer.from("0.11.0\n") };
            if (cmd === "rclone") return { success: true, stdout: Buffer.from("rclone v1.65.0\n") };
            if (cmd === "df") return { success: true, stdout: Buffer.from("Filesystem Size Used Avail Use% Mounted on\n/dev/disk1s1 100G 20G 80G 20% /") };
            return { success: false, stdout: Buffer.from("") };
        });

        const originalFindBinary = Env.findBinary;
        Env.findBinary = () => "/usr/local/bin/7z";

        const status = await checkDependencies();

        expect(status.bun).toBe("1.1.0");
        expect(status.diskSpace).toBe("80G");
        expect(status.archive).toBe("Available");

        Env.findBinary = originalFindBinary;
    });

    test("should detect dependency versions (Windows flow)", async () => {
        // Mock Windows environment
        Object.defineProperty(Env, "isWin", { get: () => true, configurable: true });

        __setSpawnSync((args: string[]) => {
            const cmd = args[0];
            if (cmd === "bun") return { success: true, stdout: Buffer.from("1.0.0\n") };
            if (cmd === "zig") return { success: true, stdout: Buffer.from("0.11.0\n") };
            if (cmd === "rclone") return { success: true, stdout: Buffer.from("rclone v1.65.0\n") };
            if (cmd === "powershell") return { success: true, stdout: Buffer.from("128.5\n") };
            return { success: false, stdout: Buffer.from("") };
        });

        const status = await checkDependencies();

        expect(status.diskSpace).toBe("128.5 GB");
    });

    test("should detect v2 fonts via fc-list", async () => {
        Object.defineProperty(Env, "isWin", { get: () => false, configurable: true });
        __setSpawnSync((args: string[]) => {
            if (args.join(' ').includes(':charset=f61a')) {
                return { success: true, stdout: Buffer.from("/path/to/font: MaterialCat:style=Regular\n") };
            }
            return { success: false, stdout: Buffer.from("") };
        });

        const result = await detectNerdFonts();
        expect(result.isInstalled).toBe(true);
        expect(result.version).toBe(2);
        expect(result.method).toBe('fc-list');
        expect(result.installedFonts).toContain("MaterialCat");
    });

    test("should detect v3 fonts via fc-list", async () => {
        Object.defineProperty(Env, "isWin", { get: () => false, configurable: true });
        __setSpawnSync((args: string[]) => {
            if (args.join(' ').includes(':charset=eeed')) {
                return { success: true, stdout: Buffer.from("/path/to/font: AwesomeCat:style=Regular\n") };
            }
            return { success: false, stdout: Buffer.from("") };
        });

        const result = await detectNerdFonts();
        expect(result.isInstalled).toBe(true);
        expect(result.version).toBe(3);
        expect(result.method).toBe('fc-list');
        expect(result.installedFonts).toContain("AwesomeCat");
        expect(result.confidence).toBe('high');
    });

    test("should detect fonts via filesystem (Linux)", async () => {
        Object.defineProperty(Env, "isWin", { get: () => false, configurable: true });
        Object.defineProperty(Env, "isMac", { get: () => false, configurable: true });

        // Mock failing fc-list
        __setSpawnSync(() => ({ success: false, stdout: Buffer.from("") }));

        const { __setReaddirSync } = await import("../lib/doctor");
        // @ts-expect-error: mocking internal readdirSync which uses Dirent
        __setReaddirSync((dir: string) => {
            if (dir.includes('.local/share/fonts')) {
                return [
                    { name: 'FiraCodeNerdFont-Regular.ttf', isFile: () => true, isDirectory: () => false }
                ] as unknown as Dirent[];
            }
            return [];
        });

        const result = await detectNerdFonts();
        expect(result.isInstalled).toBe(true);
        expect(result.method).toBe('filesystem');
        expect(result.installedFonts).toContain("FiraCodeNerdFont-Regular.ttf");
    });

    test("should detect fonts via filesystem (Windows)", async () => {
        Object.defineProperty(Env, "isWin", { get: () => true, configurable: true });
        process.env.LOCALAPPDATA = "C:\\Users\\User\\AppData\\Local";

        // Mock failing fc-list (though on Windows it wouldn't even run)
        __setSpawnSync(() => ({ success: false, stdout: Buffer.from("") }));

        const { __setReaddirSync } = await import("../lib/doctor");
        // @ts-expect-error: mocking internal readdirSync
        __setReaddirSync((dir: string) => {
            const normalizedDir = dir.toLowerCase().replace(/\\/g, '/');
            if (normalizedDir.includes('microsoft/windows/fonts')) {
                return [
                    { name: 'JetBrainsMonoNerdFont-Regular.ttf', isFile: () => true, isDirectory: () => false }
                ] as unknown as Dirent[];
            }
            return [];
        });

        const result = await detectNerdFonts();
        expect(result.isInstalled).toBe(true);
        expect(result.method).toBe('filesystem');
        expect(result.installedFonts).toContain("JetBrainsMonoNerdFont-Regular.ttf");
    });

    test("should detect fonts via filesystem (macOS)", async () => {
        Object.defineProperty(Env, "isWin", { get: () => false, configurable: true });
        Object.defineProperty(Env, "isMac", { get: () => true, configurable: true });

        __setSpawnSync(() => ({ success: false, stdout: Buffer.from("") }));

        const { __setReaddirSync } = await import("../lib/doctor");
        // @ts-expect-error: mocking internal readdirSync
        __setReaddirSync((dir: string) => {
            const normalizedDir = dir.toLowerCase().replace(/\\/g, '/');
            if (normalizedDir.includes('library/fonts')) {
                return [
                    { name: 'HackNerdFont-Regular.ttf', isFile: () => true, isDirectory: () => false }
                ] as unknown as Dirent[];
            }
            return [];
        });

        const result = await detectNerdFonts();
        expect(result.isInstalled).toBe(true);
        expect(result.method).toBe('filesystem');
        expect(result.installedFonts).toContain("HackNerdFont-Regular.ttf");
    });

    test("should fallback to heuristics when detection fails", async () => {
        __setSpawnSync(() => ({ success: false, stdout: Buffer.from("") }));
        const { __setReaddirSync } = await import("../lib/doctor");
        __setReaddirSync(() => []);

        // Mock Ghostty for v3 heuristic
        process.env.TERM_PROGRAM = "Ghostty";

        const result = await detectNerdFonts();
        expect(result.isInstalled).toBe(false);
        expect(result.method).toBe('heuristic');
        expect(result.version).toBe(3);
    });

    test("should handle readdirSync errors gracefully", async () => {
        __setSpawnSync(() => ({ success: false, stdout: Buffer.from("") }));
        const { __setReaddirSync } = await import("../lib/doctor");
        __setReaddirSync(() => { throw new Error("Permission denied"); });

        const result = await detectNerdFonts();
        expect(result.isInstalled).toBe(false); // Should fallback to heuristic
        expect(result.method).toBe('heuristic');
    });

    test("should handle missing dependencies gracefully", async () => {
        __setSpawnSync(() => ({ success: false, stdout: Buffer.from("") }));
        const originalFindBinary = Env.findBinary;
        Env.findBinary = () => null;

        const status = await checkDependencies();

        expect(status.bun).toBeNull();
        expect(status.zig).toBeNull();
        expect(status.archive).toBeNull();
        expect(status.diskSpace).toBe("Unknown");

        Env.findBinary = originalFindBinary;
    });
});
