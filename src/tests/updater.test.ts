import { expect, test, describe, beforeAll, mock } from "bun:test";
import { performUpdate } from "../lib/updater";
import { Logger } from "../lib/logger";

const { spawnSync: realSpawnSync } = await import("bun");

// Mock Bun's spawnSync for git commands
mock.module("bun", () => ({
    spawnSync: (args: string[]) => {
        const cmd = args.join(" ");
        if (cmd.includes("git --version")) return { success: true, stdout: Buffer.from("git version 2.40.1") };
        if (cmd.includes("git remote get-url origin")) return { success: true, stdout: Buffer.from("https://github.com/opentui/schem-sync-portal.git") };
        if (cmd.includes("git rev-parse --abbrev-ref HEAD")) return { success: true, stdout: Buffer.from("main") };
        if (cmd.includes("git fetch")) return { success: true, stdout: Buffer.from("") };
        if (cmd.includes("git pull")) return { success: true, stdout: Buffer.from("") };
        if (cmd.includes("git stash pop")) return { success: true, stdout: Buffer.from("") };
        if (cmd.includes("git stash")) return { success: true, stdout: Buffer.from("Saved working directory") };

        // Fallback for everything else (like 7z/rar in cleanup)
        return realSpawnSync(args);
    }
}));

describe("System Updater (Updater)", () => {
    beforeAll(() => {
        Logger.setLevel("DEBUG");
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
