
import { expect, test, spyOn } from "bun:test";
import { createRcloneRemote } from "./lib/rclone";
import { Env } from "./lib/env";
import { join } from "path";

const TEST_CONFIG = "rclone.verify.conf";
const TEST_CONFIG_PATH = join(process.cwd(), TEST_CONFIG);

// Mock Env.getRcloneConfigPath
spyOn(Env, 'getRcloneConfigPath').mockReturnValue(TEST_CONFIG_PATH);

test("createRcloneRemote should place --non-interactive at the end", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spawnSpy = spyOn(Bun, 'spawnSync').mockImplementation(() => ({ success: true, stdout: "", stderr: "" } as any));

    createRcloneRemote("test_remote", "webdav", { url: "http://example.com" });

    const calls = spawnSpy.mock.calls;
    const createCall = calls.find(args => (args[0] as string[]).includes("create"));

    expect(createCall).toBeDefined();
    if (createCall) {
        const cmdArgs = createCall[0] as string[];

        console.log("Captured Args:", cmdArgs);

        const createIndex = cmdArgs.indexOf("create");
        const nonInteractiveIndex = cmdArgs.indexOf("--non-interactive");

        expect(createIndex).toBeGreaterThan(-1);
        expect(nonInteractiveIndex).toBeGreaterThan(createIndex);
        expect(nonInteractiveIndex).toBe(cmdArgs.length - 1);
    }

    spawnSpy.mockRestore();
});
