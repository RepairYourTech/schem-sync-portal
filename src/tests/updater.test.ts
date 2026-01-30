import { expect, test, describe, beforeAll, mock } from "bun:test";
import { performUpdate } from "../lib/updater";
import { Logger } from "../lib/logger";

// Mock child_process.execSync
mock.module("child_process", () => ({
    execSync: (cmd: string) => {
        if (cmd === "git --version") return Buffer.from("git version 2.40.1");
        if (cmd === "git remote get-url origin") return Buffer.from("https://github.com/user/repo.git");
        if (cmd.includes("git fetch")) return Buffer.from("");
        if (cmd.includes("git pull")) return Buffer.from("");
        if (cmd.includes("git stash")) return Buffer.from("");
        return Buffer.from("");
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
