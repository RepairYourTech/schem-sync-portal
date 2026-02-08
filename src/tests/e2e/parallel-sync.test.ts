import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { runSync, clearSyncSession, type SyncProgress } from "../../lib/sync";
import { createMockConfig } from "../ui-test-helpers";
import { join } from "path";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "fs";
import * as Config from "../../lib/config";

describe("E2E: Parallel Sync", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let saveConfigSpy: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let loadConfigSpy: any;
    let testDir: string;

    beforeEach(() => {
        process.env.MOCK_RCLONE = "src/tests/mock_rclone.ts";
        process.env.RCLONE_CONFIG_PATH = join(process.cwd(), "test_parallel_sync_rclone.conf");
        if (!existsSync(process.env.RCLONE_CONFIG_PATH)) writeFileSync(process.env.RCLONE_CONFIG_PATH, "");

        process.env.MOCK_LATENCY = "50";
        clearSyncSession();

        saveConfigSpy = spyOn(Config, "saveConfig").mockImplementation(() => Promise.resolve());
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        loadConfigSpy = spyOn(Config, "loadConfig").mockImplementation(() => ({}) as any);

        testDir = join(process.cwd(), "test_parallel_sync_" + Math.random().toString(36).slice(2));
        if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
        mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        saveConfigSpy.mockRestore();
        loadConfigSpy.mockRestore();
        if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
        delete process.env.MOCK_FAIL_PROBABILITY;
        delete process.env.MOCK_LATENCY;
        delete process.env.PORTAL_CONFIG_PATH;
        delete process.env.RCLONE_CONFIG_PATH;
        delete process.env.MOCK_RCLONE;
    });

    it("should enter 'syncing' phase when both pull and cloud are active", async () => {
        const config = createMockConfig({
            source_provider: "gdrive",
            backup_provider: "b2",
            local_dir: testDir,
            upsync_enabled: true,
            enable_malware_shield: true
        });

        const phases: string[] = [];
        await runSync(config, (p: Partial<SyncProgress>) => {
            if (p.phase && !phases.includes(p.phase)) {
                phases.push(p.phase);
            }
        });

        // 'syncing' is the indicator for parallel active phases
        expect(phases).toContain("syncing");
        expect(phases).toContain("done");

        // Cloud phase might be renamed to 'syncing' during parallel run.
        // We just need to ensure the whole flow finishing with 'done'.
    });
});
