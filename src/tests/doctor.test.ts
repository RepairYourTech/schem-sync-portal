import { expect, test, describe, beforeAll, mock } from "bun:test";
import { Env } from "../lib/env";
import { Logger } from "../lib/logger";

describe("System Diagnostics (Doctor)", () => {
    let checkDependencies: any;
    let __setSpawnSync: any;

    beforeAll(() => {
        const doctor = require("../lib/doctor");
        checkDependencies = doctor.checkDependencies;
        __setSpawnSync = doctor.__setSpawnSync;
        Logger.setLevel("DEBUG");
    });

    test("should detect dependency versions (Linux flow)", () => {
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

        const status = checkDependencies();

        expect(status.bun).toBe("1.0.0");
        expect(status.diskSpace).toBe("80G");
        expect(status.archive).toBe("Available");

        Env.findBinary = originalFindBinary;
    });

    test("should detect dependency versions (Mac flow)", () => {
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

        const status = checkDependencies();

        expect(status.bun).toBe("1.1.0");
        expect(status.diskSpace).toBe("80G");
        expect(status.archive).toBe("Available");

        Env.findBinary = originalFindBinary;
    });

    test("should detect dependency versions (Windows flow)", () => {
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

        const status = checkDependencies();

        expect(status.diskSpace).toBe("128.5 GB");
    });

    test("should handle missing dependencies gracefully", () => {
        __setSpawnSync(() => ({ success: false, stdout: Buffer.from("") }));
        const originalFindBinary = Env.findBinary;
        Env.findBinary = () => null;

        const status = checkDependencies();

        expect(status.bun).toBeNull();
        expect(status.zig).toBeNull();
        expect(status.archive).toBeNull();
        expect(status.diskSpace).toBe("Unknown");

        Env.findBinary = originalFindBinary;
    });
});
