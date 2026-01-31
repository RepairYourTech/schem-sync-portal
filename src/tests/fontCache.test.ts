import { expect, test, describe, mock } from "bun:test";
import { __setSpawnSync, refreshFontCache } from "../lib/fontCache";
import { Env } from "../lib/env";

describe("FontCache", () => {
    test("Windows Auto-Refresh", async () => {
        // Mock Env.platform
        const originalPlatform = Object.getOwnPropertyDescriptor(Env, 'platform');
        Object.defineProperty(Env, 'platform', { get: () => 'win32', configurable: true });

        const result = await refreshFontCache();
        expect(result.method).toBe('auto');
        expect(result.success).toBe(true);
        expect(result.message).toContain('Windows');

        // Restore
        if (originalPlatform) Object.defineProperty(Env, 'platform', originalPlatform);
    });

    test("macOS Auto-Refresh", async () => {
        const originalPlatform = Object.getOwnPropertyDescriptor(Env, 'platform');
        Object.defineProperty(Env, 'platform', { get: () => 'darwin', configurable: true });

        const result = await refreshFontCache();
        expect(result.method).toBe('auto');
        expect(result.success).toBe(true);
        expect(result.message).toContain('macOS');

        if (originalPlatform) Object.defineProperty(Env, 'platform', originalPlatform);
    });

    test("Linux fc-cache Success", async () => {
        const originalPlatform = Object.getOwnPropertyDescriptor(Env, 'platform');
        Object.defineProperty(Env, 'platform', { get: () => 'linux', configurable: true });

        const originalFindBinary = Env.findBinary;
        Env.findBinary = mock(() => '/usr/bin/fc-cache');

        const mockSpawnSync = mock(() => ({
            success: true,
            stdout: Buffer.from(""),
            stderr: Buffer.from("")
        } as any));

        __setSpawnSync(mockSpawnSync);

        const result = await refreshFontCache();
        expect(result.method).toBe('fc-cache');
        expect(result.success).toBe(true);
        expect(mockSpawnSync).toHaveBeenCalled();

        if (originalPlatform) Object.defineProperty(Env, 'platform', originalPlatform);
        Env.findBinary = originalFindBinary;
    });

    test("Linux fc-cache Not Found", async () => {
        const originalPlatform = Object.getOwnPropertyDescriptor(Env, 'platform');
        Object.defineProperty(Env, 'platform', { get: () => 'linux', configurable: true });

        const originalFindBinary = Env.findBinary;
        Env.findBinary = mock(() => null);

        const result = await refreshFontCache();
        expect(result.method).toBe('manual');
        expect(result.message).toContain('fc-cache not found');

        if (originalPlatform) Object.defineProperty(Env, 'platform', originalPlatform);
        Env.findBinary = originalFindBinary;
    });

    test("Linux fc-cache Failure", async () => {
        const originalPlatform = Object.getOwnPropertyDescriptor(Env, 'platform');
        Object.defineProperty(Env, 'platform', { get: () => 'linux', configurable: true });

        const originalFindBinary = Env.findBinary;
        Env.findBinary = mock(() => '/usr/bin/fc-cache');

        const mockSpawnSync = mock(() => ({
            success: false,
            stdout: Buffer.from(""),
            stderr: Buffer.from("Error")
        } as any));

        __setSpawnSync(mockSpawnSync);

        const result = await refreshFontCache();
        expect(result.success).toBe(false);
        expect(result.message).toContain('failed');

        if (originalPlatform) Object.defineProperty(Env, 'platform', originalPlatform);
        Env.findBinary = originalFindBinary;
    });
});
