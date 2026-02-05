import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { runSync, clearSyncSession, type SyncProgress } from "../../lib/sync";
import { createMockConfig } from "../ui-test-helpers";
import { join } from "path";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "fs";

const mockSaveConfig = mock(() => Promise.resolve());
mock.module("../../lib/config", () => ({
    saveConfig: mockSaveConfig,
    loadConfig: mock(() => ({})),
    EMPTY_CONFIG: {
        source_provider: "unconfigured",
        backup_provider: "unconfigured",
        local_dir: "",
        upsync_enabled: false,
        enable_malware_shield: false
    }
}));

describe("E2E: Parallel Sync", () => {
    let testDir: string;

    beforeEach(() => {
        process.env.MOCK_RCLONE = "src/tests/mock_rclone.ts";
        process.env.MOCK_LATENCY = "50";
        clearSyncSession();

        testDir = join(process.cwd(), "test_parallel_sync_" + Math.random().toString(36).slice(2));
        if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
        mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
        delete process.env.MOCK_FAIL_PROBABILITY;
        delete process.env.MOCK_LATENCY;
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

        // Ensure cloud phase was also hit (it might be renamed to syncing, but let's check)
        // Actually, cloud phase starts after risky sweep.
        // If pull phase finishes, pullFinished becomes true, and then cloud phase continues as 'cloud'.
        expect(phases).toContain("cloud");
    });
});
