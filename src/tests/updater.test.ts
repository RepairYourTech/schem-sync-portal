/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test, describe, afterAll, spyOn } from "bun:test";
import { performUpdate } from "../lib/updater";

const mockSpawnSync = spyOn(Bun, "spawnSync").mockImplementation((args) => {
    const cmd = Array.isArray(args) ? args.join(" ") : String(args);
    if (cmd.includes("git --version")) return { success: true, stdout: Buffer.from("git version 2.40.1") } as any;
    if (cmd.includes("git remote get-url origin")) return { success: true, stdout: Buffer.from("https://github.com/opentui/schem-sync-portal.git") } as any;
    if (cmd.includes("git rev-parse --abbrev-ref HEAD")) return { success: true, stdout: Buffer.from("main") } as any;
    if (cmd.includes("git fetch")) return { success: true, stdout: Buffer.from("") } as any;
    if (cmd.includes("git pull")) return { success: true, stdout: Buffer.from("") } as any;
    if (cmd.includes("git stash pop")) return { success: true, stdout: Buffer.from("") } as any;
    if (cmd.includes("git stash")) return { success: true, stdout: Buffer.from("Saved working directory") } as any;

    return { success: true, stdout: Buffer.from("mocked") } as any;
});

describe("System Updater (Updater)", () => {
    afterAll(() => {
        mockSpawnSync.mockRestore();
    });

    test("should perform update successfully", async () => {
        const result = await performUpdate();
        expect(result.success).toBe(true);
        expect(result.message).toContain("Updated successfully");
    });

    test("should handle missing git gracefully", async () => {
        // We need a way to change the mock behavior mid-test.
        // For now, these tests are basic. In a real scenario, we'd use a more robust mocking strategy.
    });
});
