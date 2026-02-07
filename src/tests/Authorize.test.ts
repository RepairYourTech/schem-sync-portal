import { expect, test, describe, beforeEach, afterAll, spyOn } from "bun:test";
import * as fs from "fs";
import { Logger } from "../lib/logger";

// 1. Setup spies on Bun globals
const mockSpawnSync = spyOn(Bun, "spawnSync").mockImplementation((..._args: unknown[]) => {
    // console.log("DEBUG: mockSpawnSync called with", _args[0]);
    return {
        success: true,
        stdout: Buffer.from(""),
        stderr: Buffer.from(""),
        exitCode: 0,
    } as unknown as ReturnType<typeof Bun.spawnSync>;
});

const mockSpawn = spyOn(Bun, "spawn").mockImplementation((..._args: unknown[]) => {
    return {
        exited: Promise.resolve(0),
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
        kill: () => { }
    } as unknown as ReturnType<typeof Bun.spawn>;
});

const mockExistsSync = spyOn(fs, "existsSync").mockImplementation(() => true);

// 2. Import system under test dynamically to avoid hoisting issues
// We'll import them inside the describe block

describe("Rclone Robust Token Extraction", () => {
    let authorizeRemote: (provider: string, signal?: AbortSignal, clientId?: string, clientSecret?: string) => Promise<string>;
    let createRcloneRemote: (name: string, type: string, options: Record<string, string>) => void;
    let updateGdriveRemote: (name: string, clientId: string, secret: string, token: string) => void;

    beforeEach(async () => {
        const mod = await import("../lib/rclone");
        authorizeRemote = mod.authorizeRemote;
        createRcloneRemote = mod.createRcloneRemote;
        updateGdriveRemote = mod.updateGdriveRemote;

        mockSpawn.mockClear();
        mockSpawnSync.mockClear();
    });

    afterAll(() => {
        mockSpawn.mockRestore();
        mockSpawnSync.mockRestore();
        mockExistsSync.mockRestore();
    });

    // Strategy 1-5 tests... (shortened for brevity in this thought, but I'll write them out)
    test("Strategy 1: Extraction via Markers", async () => {
        const tokenJson = '{"access_token":"marker-test","refresh_token":"abc"}';
        const rcloneOutput = `Paste the following into your remote machine --->\n${tokenJson}\n<---End paste`;

        mockSpawn.mockImplementation(() => ({
            exited: Promise.resolve(0),
            stdout: new Response(rcloneOutput).body,
            stderr: new Response("").body,
            kill: () => { }
        } as unknown as ReturnType<typeof Bun.spawn>));

        const result = await authorizeRemote("drive");
        const parsed = JSON.parse(result) as Record<string, unknown>;
        expect(parsed.access_token).toBe("marker-test");
        expect(result).toBe(tokenJson);
    });

    test("Strategy 2: Extraction via JSON Parsing (Nested Objects)", async () => {
        const tokenJson = '{"access_token":"nested-test","expiry":{"sec":123,"nano":456}}';
        const rcloneOutput = `Some boilerplate\n${tokenJson}\nMore boilerplate`;

        mockSpawn.mockImplementation(() => ({
            exited: Promise.resolve(0),
            stdout: new Response(rcloneOutput).body,
            stderr: new Response("").body,
            kill: () => { }
        } as unknown as ReturnType<typeof Bun.spawn>));

        const result = await authorizeRemote("drive");
        expect(result).toBe(tokenJson);
    });

    test("Strategy 3: Best-guess JSON (Last Resort)", async () => {
        const randomJson = '{"some_val":"maybe-a-token"}';
        const rcloneOutput = `Noise\n${randomJson}\nNoise`;

        mockSpawn.mockImplementation(() => ({
            exited: Promise.resolve(0),
            stdout: new Response(rcloneOutput).body,
            stderr: new Response("").body,
            kill: () => { }
        } as unknown as ReturnType<typeof Bun.spawn>));

        const result = await authorizeRemote("drive");
        expect(result).toBe(randomJson);
    });

    test("Should fail if no JSON is found", async () => {
        const rcloneOutput = "Just some text with no braces";

        mockSpawn.mockImplementation(() => ({
            exited: Promise.resolve(0),
            stdout: new Response(rcloneOutput).body,
            stderr: new Response("").body,
            kill: () => { }
        } as unknown as ReturnType<typeof Bun.spawn>));

        await expect(authorizeRemote("drive")).rejects.toThrow("Could not extract OAuth token");
    });

    test("createRcloneRemote should include --non-interactive", () => {
        createRcloneRemote("test", "drive", {});

        const createCall = mockSpawnSync.mock.calls.find(call => {
            const args = call[0] as string[];
            return args.includes("config") && args.includes("create");
        });

        expect(createCall).toBeDefined();
        if (createCall) {
            const args = createCall[0] as string[];
            expect(args).toContain("--non-interactive");
        }
    });

    test("updateGdriveRemote should validate token JSON", () => {
        const invalidToken = "not-json";
        expect(() => updateGdriveRemote("test", "id", "secret", invalidToken)).toThrow("Invalid OAuth token");

        const partialToken = '{"foo":"bar"}';
        expect(() => updateGdriveRemote("test", "id", "secret", partialToken)).toThrow("Token missing required fields");

        const validToken = '{"access_token":"ok"}';
        expect(() => updateGdriveRemote("test", "id", "secret", validToken)).not.toThrow();
    });
});

