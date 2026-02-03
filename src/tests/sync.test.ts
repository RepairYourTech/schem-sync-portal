import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { runSync, type SyncProgress } from "../lib/sync";
import { Logger } from "../lib/logger";
import { join } from "path";
import { mkdirSync, existsSync, rmSync } from "fs";
import { createMockConfig } from "./ui-test-helpers";

describe("Sync Engine Integration", () => {
    const testDir = join(process.cwd(), "test_sync_dir");

    const mockConfig = createMockConfig({
        source_provider: "gdrive",
        backup_provider: "b2",
        backup_dir: "",
        upsync_enabled: true,
        local_dir: testDir,
        strict_mirror: true,
        enable_malware_shield: false,
        malware_policy: "purge",
        desktop_shortcut: 0,
        debug_mode: true
    });

    beforeAll(() => {
        if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
        // Isolation: use a temp config file for tests
        process.env.PORTAL_CONFIG_PATH = join(testDir, "test_config.json");
        // Set up MockRclone
        process.env.MOCK_RCLONE = "src/tests/mock_rclone.ts";
        process.env.MOCK_LATENCY = "10"; // Fast tests
        Logger.setLevel("DEBUG");
        Logger.clearLogs();
    });

    afterAll(() => {
        // Clean up
        delete process.env.MOCK_RCLONE;
        delete process.env.MOCK_LATENCY;
        try {
            if (existsSync(testDir)) {
                rmSync(testDir, { recursive: true, force: true });
                Logger.debug("SYSTEM", "Cleaned up test artifacts in test_sync_dir");
            }
        } catch (err) {
            Logger.error("SYSTEM", `Failed to clean up test artifacts: ${err}`);
        }
    });

    test("should parse progress correctly from MockRclone", async () => {
        Logger.clearLogs();
        const progressUpdates: SyncProgress[] = [];
        await runSync(mockConfig, (p) => {
            progressUpdates.push(p as SyncProgress);
        });

        // Check if we got progress updates
        const pullUpdates = progressUpdates.filter(u => u.phase === "pull");
        expect(pullUpdates.length).toBeGreaterThan(0);

        // Check if percentage reached 100
        const lastPull = pullUpdates[pullUpdates.length - 1];
        expect(lastPull?.percentage).toBe(100);

        // Check for detailed stats in middle updates
        const midPull = pullUpdates.find(u => u.percentage > 0 && u.percentage < 100);
        if (midPull) {
            expect(midPull.transferSpeed).toBeDefined();
            expect(midPull.eta).toBeDefined();
            expect(midPull.bytesTransferred).toContain("MiB");

            // NEW: Verify File Queue population
            const queue = midPull.downloadQueue!;
            expect(queue).toBeDefined();
            expect(queue.length).toBeGreaterThan(0);
            expect(queue[0]!.filename).toContain("file_");
        }
    });

    test("should handle rclone failures", async () => {
        Logger.clearLogs();
        process.env.MOCK_FAIL_PROBABILITY = "1.0";

        const progressUpdates: SyncProgress[] = [];
        await runSync(mockConfig, (p) => {
            progressUpdates.push(p as SyncProgress);
        });

        const errorUpdate = progressUpdates.find(u => u.phase === "error");
        expect(errorUpdate).toBeDefined();
        expect(errorUpdate?.description).toContain("Sync Failed");

        delete process.env.MOCK_FAIL_PROBABILITY;
    });

    test("should handle credential rejections", async () => {
        Logger.clearLogs();
        process.env.MOCK_REJECT_CREDENTIALS = "true";

        await runSync(mockConfig, () => { });

        const logs = Logger.getRecentLogs(10);
        expect(logs.some(l => l.includes("401 Unauthorized"))).toBe(true);

        delete process.env.MOCK_REJECT_CREDENTIALS;
    });
});
