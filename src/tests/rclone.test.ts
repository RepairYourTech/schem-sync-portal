import { mock } from "bun:test";

// 1. Define the mock function with a default implementation
const mockSpawnSync = mock((args: string[], options?: any) => ({
    success: true,
    stdout: Buffer.from(""),
    stderr: Buffer.from("")
}));

// 2. Mock the 'bun' module
mock.module("bun", () => ({
    spawnSync: mockSpawnSync,
    spawn: mock(() => ({
        exited: Promise.resolve(0),
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
        kill: () => { }
    })),
    which: mock((name: string) => `/mock/bin/${name}`)
}));

// 3. Import dependencies that use the mocked module dynamically
import { expect, test, describe, beforeEach } from "bun:test";
import { Logger } from "../lib/logger";

describe("Rclone Config Sanitization", () => {
    let createRcloneRemote: any;

    beforeEach(async () => {
        mockSpawnSync.mockClear();
        Logger.setLevel("DEBUG");
        // Dynamically import to ensure mock is applied
        const rclone = await import("../lib/rclone");
        createRcloneRemote = rclone.createRcloneRemote;
    });

    test("should sanitize newlines in option values", () => {
        const name = "test-remote";
        const type = "drive";
        const options = {
            token: '{"refresh_token":"abc\ndef"}'
        };

        createRcloneRemote(name, type, options);

        // Check the arguments passed to spawnSync
        expect(mockSpawnSync).toHaveBeenCalled();
        const callArgs = mockSpawnSync.mock.calls.find(c => c[0][0] === "rclone")?.[0];
        expect(callArgs).toBeDefined();

        // Find the index of "token" and check the next element
        const tokenIdx = callArgs.indexOf("token");
        expect(tokenIdx).not.toBe(-1);
        const sanitizedValue = callArgs[tokenIdx + 1];

        expect(sanitizedValue).toBe('{"refresh_token":"abc def"}');
        expect(sanitizedValue).not.toContain("\n");
        expect(sanitizedValue).not.toContain("\r");
    });

    test("should trim values and skip empty ones", () => {
        const options = {
            key1: "  value1  ",
            key2: "\n\r",
            key3: ""
        };

        createRcloneRemote("test", "dummy", options);

        const callArgs = mockSpawnSync.mock.calls.find(c => c[0][0] === "rclone")?.[0];
        expect(callArgs).toBeDefined();

        expect(callArgs).toContain("value1");
        expect(callArgs).not.toContain("key2");
        expect(callArgs).not.toContain("key3");
    });
});
