import { expect, test, describe, mock, beforeEach } from "bun:test";
import { __setSpawnSync, __setFetch, __setFilesystem, installNerdFont } from "../lib/fontInstaller";
import { __setDetectNerdFonts } from "../lib/doctor";
import { Env } from "../lib/env";

describe("FontInstaller", () => {
    // Default filesystem mocks
    let fsMocks: Parameters<typeof __setFilesystem>[0];

    beforeEach(() => {
        fsMocks = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mkdirSync: mock(() => { }) as any,
            existsSync: mock(() => true),
            writeFileSync: mock(() => { }),
            rmSync: mock(() => { }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            readdirSync: mock(() => [{ name: 'font.ttf', isFile: () => true, isDirectory: () => false }] as any),
            copyFileSync: mock(() => { })
        };
        __setFilesystem(fsMocks);
    });

    test("Successful Installation", async () => {
        const mockFetch = mock(async () => {
            const res = {
                ok: true,
                headers: new Map([['Content-Length', '1000']]),
                arrayBuffer: async () => new ArrayBuffer(1000)
            };
            return res as unknown as Response;
        });

        const mockSpawnSync = mock(() => ({
            success: true,
            stdout: Buffer.from(""),
            stderr: Buffer.from("")
        } as any)); // eslint-disable-line @typescript-eslint/no-explicit-any

        const mockDetect = mock(async () => ({
            isInstalled: true,
            version: 3 as const,
            method: 'fc-list' as const,
            confidence: 'high' as const,
            installedFonts: ['JetBrainsMono Nerd Font']
        }));

        const originalFindBinary = Env.findBinary;
        Env.findBinary = mock(() => "/usr/bin/7z");

        __setFetch(mockFetch as unknown as typeof fetch);
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

        __setFetch(mockFetch as unknown as typeof fetch);

        const result = await installNerdFont({ font: 'JetBrainsMono', version: 3 });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Network error");
    });

    test("File Size Validation", async () => {
        const mockFetch = mock(async () => {
            const res = {
                ok: true,
                headers: new Map([['Content-Length', (250 * 1024 * 1024).toString()]]),
            };
            return res as unknown as Response;
        });

        __setFetch(mockFetch as unknown as typeof fetch);

        const result = await installNerdFont({ font: 'JetBrainsMono', version: 3 });

        expect(result.success).toBe(false);
        expect(result.error).toContain("too large");
    });

    test("Extraction Failure", async () => {
        const mockFetch = mock(async () => {
            const res = {
                ok: true,
                headers: new Map([['Content-Length', '1000']]),
                arrayBuffer: async () => new ArrayBuffer(1000)
            };
            return res as unknown as Response;
        });

        const mockSpawnSync = mock(() => ({
            success: false,
            stdout: Buffer.from(""),
            stderr: Buffer.from("Unzip failed")
        } as any)); // eslint-disable-line @typescript-eslint/no-explicit-any

        __setFetch(mockFetch as unknown as typeof fetch);
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
        Env.getPaths = mock(() => ({ home: '/home/user', configDir: '/home/user/.config' } as ReturnType<typeof Env.getPaths>));

        const mockFetch = mock(async () => {
            const res = {
                ok: true,
                headers: new Map([['Content-Length', '1000']]),
                arrayBuffer: async () => new ArrayBuffer(1000)
            };
            return res as unknown as Response;
        });

        const mockSpawnSync = mock(() => ({ success: true }) as any); // eslint-disable-line @typescript-eslint/no-explicit-any
        const mockDetect = mock(async () => ({ isInstalled: true, version: 3 as const, installedFonts: [] } as any)); // eslint-disable-line @typescript-eslint/no-explicit-any
        const originalFindBinary = Env.findBinary;
        Env.findBinary = mock(() => "/usr/bin/7z");

        __setFetch(mockFetch as unknown as typeof fetch);
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
        const mockFetch = mock(async () => {
            const res = {
                ok: true,
                headers: new Map([['Content-Length', '1000']]),
                arrayBuffer: async () => new ArrayBuffer(1000)
            };
            return res as unknown as Response;
        });
        const mockSpawnSync = mock(() => ({ success: true }) as any); // eslint-disable-line @typescript-eslint/no-explicit-any
        const originalFindBinary = Env.findBinary;
        Env.findBinary = mock(() => "/usr/bin/7z");

        __setFetch(mockFetch as unknown as typeof fetch);
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
        const mockFetch = mock(async () => {
            const res = {
                ok: true,
                headers: new Map([['Content-Length', '1000']]),
                arrayBuffer: async () => new ArrayBuffer(1000)
            };
            return res as unknown as Response;
        });
        const mockSpawnSync = mock(() => ({ success: true }) as any); // eslint-disable-line @typescript-eslint/no-explicit-any
        const mockDetect = mock(async () => ({ isInstalled: false } as any)); // eslint-disable-line @typescript-eslint/no-explicit-any
        const originalFindBinary = Env.findBinary;
        Env.findBinary = mock(() => "/usr/bin/7z");

        __setFetch(mockFetch as unknown as typeof fetch);
        __setSpawnSync(mockSpawnSync);
        __setDetectNerdFonts(mockDetect);

        const result = await installNerdFont({ font: 'Hack', version: 3 });
        expect(result.success).toBe(false);
        expect(result.error).toContain("verification failed");

        Env.findBinary = originalFindBinary;
    });
});
