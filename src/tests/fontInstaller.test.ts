import { expect, test, describe, mock, beforeEach, afterAll } from "bun:test";
import { __setSpawnSync, __setFetch, __setFilesystem, installNerdFont } from "../lib/fontInstaller";
import { __setDetectNerdFonts, detectNerdFonts } from "../lib/doctor";
import { Env } from "../lib/env";
import { type Dirent, type mkdirSync, type existsSync, type writeFileSync, type rmSync, type readdirSync, type copyFileSync } from "fs";
import { join } from "path";
import type { spawnSync } from "bun";

type SpawnSyncReturn = ReturnType<typeof spawnSync>;
type DetectResult = Awaited<ReturnType<typeof detectNerdFonts>>;

describe("FontInstaller", () => {
    // Prevent Env.getLogPath from creating directories during tests
    const originalGetLogPath = Env.getLogPath;
    Env.getLogPath = mock((filename: string = "test.log") => join("/tmp", filename));

    afterAll(() => {
        Env.getLogPath = originalGetLogPath;
    });

    // Top-level mocks to be reuseable and clearable
    const mockMkdirSync = mock((_path: string, _options?: { recursive?: boolean }) => { return undefined; });
    const mockExistsSync = mock((_path: string) => true);
    const mockWriteFileSync = mock((_path: string, _data: string | Buffer) => undefined);
    const mockRmSync = mock((_path: string, _options?: { recursive?: boolean; force?: boolean }) => undefined);
    const mockReaddirSync = mock((_path: string, _options?: { withFileTypes: boolean }) => [
        { name: 'font.ttf', isFile: () => true, isDirectory: () => false }
    ] as unknown as Dirent[]);
    const mockCopyFileSync = mock((_src: string, _dest: string) => undefined);

    const getFsMocks = () => ({
        mkdirSync: mockMkdirSync as unknown as typeof mkdirSync,
        existsSync: mockExistsSync as unknown as typeof existsSync,
        writeFileSync: mockWriteFileSync as unknown as typeof writeFileSync,
        rmSync: mockRmSync as unknown as typeof rmSync,
        readdirSync: mockReaddirSync as unknown as typeof readdirSync,
        copyFileSync: mockCopyFileSync as unknown as typeof copyFileSync
    });

    beforeEach(() => {
        mockMkdirSync.mockClear();
        mockExistsSync.mockClear();
        mockWriteFileSync.mockClear();
        mockRmSync.mockClear();
        mockReaddirSync.mockClear();
        mockCopyFileSync.mockClear();

        __setFilesystem(getFsMocks());
    });

    test("Successful Installation", async () => {
        const mockFetch = mock(async () => {
            return {
                ok: true,
                headers: new Map([['Content-Length', '1000']]),
                arrayBuffer: async () => new ArrayBuffer(1000)
            } as unknown as Response;
        });

        const mockSpawnSync = mock(() => ({
            success: true,
            stdout: Buffer.from(""),
            stderr: Buffer.from("")
        } as SpawnSyncReturn));

        const mockDetect = mock(async () => ({
            isInstalled: true,
            version: 3,
            method: 'fc-list',
            confidence: 'high',
            installedFonts: ['JetBrainsMono Nerd Font']
        } as DetectResult));

        const originalFindBinary = Env.findBinary;
        Env.findBinary = mock(() => "/usr/bin/7z");

        __setFetch(mockFetch as unknown as typeof fetch);
        __setSpawnSync(mockSpawnSync as unknown as typeof spawnSync);
        __setDetectNerdFonts(mockDetect as unknown as typeof detectNerdFonts);

        const result = await installNerdFont({ font: 'JetBrainsMono', version: 3 });

        expect(result.success).toBe(true);
        expect(result.installedFamily).toBe('JetBrainsMono');

        Env.findBinary = originalFindBinary;
    });

    test("Download Timeout", async () => {
        const mockFetch = mock(async () => {
            throw new Error("timeout");
        });

        __setFetch(mockFetch as unknown as typeof fetch);

        const result = await installNerdFont({ font: 'JetBrainsMono', version: 3 });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Network error");
    });

    test("File Size Validation", async () => {
        const mockFetch = mock(async () => {
            return {
                ok: true,
                headers: new Map([['Content-Length', (250 * 1024 * 1024).toString()]]),
            } as unknown as Response;
        });

        __setFetch(mockFetch as unknown as typeof fetch);

        const result = await installNerdFont({ font: 'JetBrainsMono', version: 3 });

        expect(result.success).toBe(false);
        expect(result.error).toContain("too large");
    });

    test("Extraction Failure", async () => {
        const mockFetch = mock(async () => {
            return {
                ok: true,
                headers: new Map([['Content-Length', '1000']]),
                arrayBuffer: async () => new ArrayBuffer(1000)
            } as unknown as Response;
        });

        const mockSpawnSync = mock(() => ({
            success: false,
            stdout: Buffer.from(""),
            stderr: Buffer.from("Unzip failed")
        } as SpawnSyncReturn));

        __setFetch(mockFetch as unknown as typeof fetch);
        __setSpawnSync(mockSpawnSync as unknown as typeof spawnSync);

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
        Env.getPaths = mock(() => ({
            home: '/home/user',
            configDir: '/home/user/.config',
            logsDir: '/home/user/.config/logs',
            rcloneConfigDir: '/home/user/.config/rclone',
            appsDir: '/home/user/.local/share/applications',
            desktopDir: '/home/user/Desktop',
            binDir: '/home/user/.local/bin'
        }));


        const mockFetch = mock(async () => {
            return {
                ok: true,
                headers: new Map([['Content-Length', '1000']]),
                arrayBuffer: async () => new ArrayBuffer(1000)
            } as unknown as Response;
        });

        const mockSpawnSync = mock(() => ({ success: true, stdout: Buffer.from(""), stderr: Buffer.from("") } as SpawnSyncReturn));
        const mockDetect = mock(async () => ({
            isInstalled: true,
            version: 3,
            installedFonts: [] as string[],
            method: 'fc-list',
            confidence: 'high'
        } as DetectResult));


        const originalFindBinary = Env.findBinary;
        Env.findBinary = mock(() => "/usr/bin/7z");

        __setFetch(mockFetch as unknown as typeof fetch);
        __setSpawnSync(mockSpawnSync as unknown as typeof spawnSync);
        __setDetectNerdFonts(mockDetect as unknown as typeof detectNerdFonts);

        const result = await installNerdFont({ font: 'Hack', version: 3 });
        expect(result.success).toBe(true);
        expect(result.installedPath).toBe('/home/user/.local/share/fonts');

        if (originalIsWin) Object.defineProperty(Env, 'isWin', originalIsWin);
        if (originalIsMac) Object.defineProperty(Env, 'isMac', originalIsMac);
        Env.getPaths = originalGetPaths;
        Env.findBinary = originalFindBinary;
    });

    test("Permission Error", async () => {
        const mockFetch = mock(async () => {
            return {
                ok: true,
                headers: new Map([['Content-Length', '1000']]),
                arrayBuffer: async () => new ArrayBuffer(1000)
            } as unknown as Response;
        });
        const mockSpawnSync = mock(() => ({ success: true, stdout: Buffer.from(""), stderr: Buffer.from("") } as SpawnSyncReturn));
        const originalFindBinary = Env.findBinary;
        Env.findBinary = mock(() => "/usr/bin/7z");

        __setFetch(mockFetch as unknown as typeof fetch);
        __setSpawnSync(mockSpawnSync as unknown as typeof spawnSync);

        const mockCopyFail = mock((_src: string, _dest: string) => { throw new Error("EACCES: permission denied"); });
        __setFilesystem({
            ...getFsMocks(),
            copyFileSync: mockCopyFail as unknown as typeof copyFileSync
        });

        const result = await installNerdFont({ font: 'Hack', version: 3 });
        expect(result.success).toBe(false);
        expect(result.error).toContain("permission denied");

        Env.findBinary = originalFindBinary;
    });


    test("Verification Failure", async () => {
        const mockFetch = mock(async () => {
            return {
                ok: true,
                headers: new Map([['Content-Length', '1000']]),
                arrayBuffer: async () => new ArrayBuffer(1000)
            } as unknown as Response;
        });
        const mockSpawnSync = mock(() => ({ success: true, stdout: Buffer.from(""), stderr: Buffer.from("") } as SpawnSyncReturn));
        const mockDetect = mock(async () => ({
            isInstalled: false,
            version: undefined as unknown as number,
            method: 'none',
            confidence: 'low',
            installedFonts: [] as string[]
        } as DetectResult));

        const originalFindBinary = Env.findBinary;
        Env.findBinary = mock(() => "/usr/bin/7z");

        __setFetch(mockFetch as unknown as typeof fetch);
        __setSpawnSync(mockSpawnSync as unknown as typeof spawnSync);
        __setDetectNerdFonts(mockDetect as unknown as typeof detectNerdFonts);


        const result = await installNerdFont({ font: 'Hack', version: 3 });
        expect(result.success).toBe(false);
        expect(result.error).toContain("verification failed");

        Env.findBinary = originalFindBinary;
    });
});
