import { mock, expect, test, describe, beforeEach, spyOn } from "bun:test";

// 1. Setup spies on Bun globals
// Using any for the implementation to satisfy Bun's complex overloads for spawnSync/spawn
const mockSpawnSync = spyOn(Bun, "spawnSync").mockImplementation((..._args: any[]): any => ({
    success: true,
    stdout: Buffer.from(""),
    stderr: Buffer.from("")
}));

const mockSpawn = spyOn(Bun, "spawn").mockImplementation((..._args: any[]): any => ({
    exited: Promise.resolve(0),
    stdout: new ReadableStream(),
    stderr: new ReadableStream(),
    kill: () => { }
}));

const mockWhich = spyOn(Bun, "which").mockImplementation((name: string) => `/mock/bin/${name}`);

// 2. Mock 'fs'
mock.module("fs", () => ({
    existsSync: mock(() => true),
    mkdirSync: mock(() => { }),
    writeFileSync: mock(() => { }),
    readFileSync: mock(() => Buffer.from(""))
}));

// 3. Import system under test
import { createRcloneRemote } from "../lib/rclone";
import { Logger } from "../lib/logger";

describe("Rclone Config Sanitization", () => {
    beforeEach(() => {
        mockSpawnSync.mockClear();
        mockSpawn.mockClear();
        mockWhich.mockClear();
        Logger.setLevel("DEBUG");
    });

    test("should sanitize newlines in option values", () => {
        const name = "test-remote";
        const type = "drive";
        const options = {
            token: '{"refresh_token":"abc\ndef"}'
        };

        createRcloneRemote(name, type, options);

        // Verify that spawnSync was called
        expect(mockSpawnSync).toHaveBeenCalled();

        // Find the call for 'config create'
        const rcloneCall = mockSpawnSync.mock.calls.find(call => {
            const cmd = call[0];
            return Array.isArray(cmd) && cmd.includes("create") && (cmd as string[]).includes(name);
        });

        expect(rcloneCall).toBeDefined();
        if (!rcloneCall) throw new Error("rcloneCall undefined");

        const args = rcloneCall[0] as string[];
        const tokenIdx = args.indexOf("token");
        expect(tokenIdx).not.toBe(-1);
        const sanitizedValue = args[tokenIdx + 1];

        expect(sanitizedValue).toBe('{"refresh_token":"abc def"}');
        expect(sanitizedValue).not.toContain("\n");
        expect(sanitizedValue).not.toContain("\r");
    });

    test("should trim values and skip empty ones", () => {
        const name = "test-trim";
        const options = {
            key1: "  value1  ",
            key2: "\n\r",
            key3: ""
        };

        createRcloneRemote(name, "dummy", options);

        const rcloneCall = mockSpawnSync.mock.calls.find(call => {
            const cmd = call[0];
            return Array.isArray(cmd) && cmd.includes("create") && (cmd as string[]).includes(name);
        });

        expect(rcloneCall).toBeDefined();
        if (!rcloneCall) throw new Error("rcloneCall undefined");

        const args = rcloneCall[0] as string[];
        expect(args).toContain("value1");
        expect(args).not.toContain("key2");
        expect(args).not.toContain("key3");
    });
});
