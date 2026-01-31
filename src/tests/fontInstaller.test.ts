import { expect, test, describe, mock, beforeEach } from "bun:test";
import { __setSpawnSync, __setFetch, __setFilesystem, installNerdFont } from "../lib/fontInstaller";
import { __setDetectNerdFonts } from "../lib/doctor";
import { Env } from "../lib/env";

describe("FontInstaller", () => {
    // Default filesystem mocks
    let fsMocks: any;

    beforeEach(() => {
        fsMocks = {
            mkdirSync: mock(() => { }),
            existsSync: mock(() => true),
            writeFileSync: mock(() => { }),
            rmSync: mock(() => { }),
            readdirSync: mock(() => [{ name: 'font.ttf', isFile: () => true, isDirectory: () => false }] as any),
            copyFileSync: mock(() => { })
        };
        __setFilesystem(fsMocks);
    });

    test("Successful Installation", async () => {
        const mockFetch = mock(async () => ({
            ok: true,
            headers: new Map([['Content-Length', '1000']]),
            arrayBuffer: async () => new ArrayBuffer(1000)
        } as any));

        const mockSpawnSync = mock(() => ({
            success: true,
            stdout: Buffer.from(""),
            stderr: Buffer.from("")
        } as any));

        const mockDetect = mock(async () => ({
            isInstalled: true,
            version: 3,
            method: 'fc-list',
            confidence: 'high',
            installedFonts: ['JetBrainsMono Nerd Font']
        } as any));

        const originalFindBinary = Env.findBinary;
        Env.findBinary = mock(() => "/usr/bin/7z");

        __setFetch(mockFetch as any);
        __setSpawnSync(mockSpawnSync);
        __setDetectNerdFonts(mockDetect);

        const result = await installNerdFont({ font: 'JetBrainsMono', version: 3 });

        expect(result.success).toBe(true);
        expect(result.installedFamily).toBe('JetBrainsMono');

        Env.findBinary = originalFindBinary;
    });

    test("Download Timeout", async () => {
        const mockFetch = mock(async () => {
            throw new Error("timeout");
        });

        __setFetch(mockFetch as any);

        const result = await installNerdFont({ font: 'JetBrainsMono', version: 3 });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Network error");
    });

    test("File Size Validation", async () => {
        const mockFetch = mock(async () => ({
            ok: true,
            headers: new Map([['Content-Length', (60 * 1024 * 1024).toString()]]),
        } as any));

        __setFetch(mockFetch as any);

        const result = await installNerdFont({ font: 'JetBrainsMono', version: 3 });

        expect(result.success).toBe(false);
        expect(result.error).toContain("too large");
    });

    test("Extraction Failure", async () => {
        const mockFetch = mock(async () => ({
            ok: true,
            headers: new Map([['Content-Length', '1000']]),
            arrayBuffer: async () => new ArrayBuffer(1000)
        } as any));

        const mockSpawnSync = mock(() => ({
            success: false,
            stdout: Buffer.from(""),
            stderr: Buffer.from("Unzip failed")
        } as any));

        __setFetch(mockFetch as any);
        __setSpawnSync(mockSpawnSync);

        const result = await installNerdFont({ font: 'JetBrainsMono', version: 3 });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Extraction failed");
    });

    test("Platform-Specific Paths", async () => {
        const originalIsWin = Object.getOwnPropertyDescriptor(Env, 'isWin');
        const originalIsMac = Object.getOwnPropertyDescriptor(Env, 'isMac');
        const originalGetPaths = Env.getPaths;

        Object.defineProperty(Env, 'isWin', { get: () => false, configurable: true });
        Object.defineProperty(Env, 'isMac', { get: () => false, configurable: true });
        Env.getPaths = mock(() => ({ home: '/home/user', configDir: '/home/user/.config' } as any));

        const mockFetch = mock(async () => ({
            ok: true,
            headers: new Map([['Content-Length', '1000']]),
            arrayBuffer: async () => new ArrayBuffer(1000)
        } as any));

        const mockSpawnSync = mock(() => ({ success: true } as any));
        const mockDetect = mock(async () => ({ isInstalled: true, version: 3, installedFonts: [] } as any));
        const originalFindBinary = Env.findBinary;
        Env.findBinary = mock(() => "/usr/bin/7z");

        __setFetch(mockFetch as any);
        __setSpawnSync(mockSpawnSync);
        __setDetectNerdFonts(mockDetect);

        const result = await installNerdFont({ font: 'Hack', version: 3 });
        expect(result.success).toBe(true);
        expect(result.installedPath).toBe('/home/user/.local/share/fonts');

        if (originalIsWin) Object.defineProperty(Env, 'isWin', originalIsWin);
        if (originalIsMac) Object.defineProperty(Env, 'isMac', originalIsMac);
        Env.getPaths = originalGetPaths;
        Env.findBinary = originalFindBinary;
    });

    test("Permission Error", async () => {
        const mockFetch = mock(async () => ({
            ok: true,
            headers: new Map([['Content-Length', '1000']]),
            arrayBuffer: async () => new ArrayBuffer(1000)
        } as any));
        const mockSpawnSync = mock(() => ({ success: true } as any));
        const originalFindBinary = Env.findBinary;
        Env.findBinary = mock(() => "/usr/bin/7z");

        __setFetch(mockFetch as any);
        __setSpawnSync(mockSpawnSync);
        __setFilesystem({
            ...fsMocks,
            copyFileSync: mock(() => { throw new Error("EACCES: permission denied"); })
        });

        const result = await installNerdFont({ font: 'Hack', version: 3 });
        expect(result.success).toBe(false);
        expect(result.error).toContain("permission denied");

        Env.findBinary = originalFindBinary;
    });

    test("Verification Failure", async () => {
        const mockFetch = mock(async () => ({
            ok: true,
            headers: new Map([['Content-Length', '1000']]),
            arrayBuffer: async () => new ArrayBuffer(1000)
        } as any));
        const mockSpawnSync = mock(() => ({ success: true } as any));
        const mockDetect = mock(async () => ({ isInstalled: false } as any));
        const originalFindBinary = Env.findBinary;
        Env.findBinary = mock(() => "/usr/bin/7z");

        __setFetch(mockFetch as any);
        __setSpawnSync(mockSpawnSync);
        __setDetectNerdFonts(mockDetect);

        const result = await installNerdFont({ font: 'Hack', version: 3 });
        expect(result.success).toBe(false);
        expect(result.error).toContain("verification failed");

        Env.findBinary = originalFindBinary;
    });
});
