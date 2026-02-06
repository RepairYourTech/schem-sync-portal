import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { runSync, clearSyncSession, type SyncProgress } from "../../lib/sync";
import { createMockConfig } from "../ui-test-helpers";
import type { PortalConfig } from "../../lib/config";
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

describe("E2E: Sync Flow", () => {
    const originalMockRclone = process.env.MOCK_RCLONE;

    beforeEach(() => {
        // Point to our mock rclone script
        process.env.MOCK_RCLONE = "src/tests/mock_rclone.ts";
        process.env.SYNC_POLL_INTERVAL_MS = "100";
        clearSyncSession();
        mockSaveConfig.mockClear();
    });


    afterEach(() => {
        process.env.MOCK_RCLONE = originalMockRclone;
    });

    it("should progress through pull, clean, and cloud phases", async () => {
        const testDir = join(process.cwd(), "test_sync_flow_" + Math.random().toString(36).slice(2));
        if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
        mkdirSync(testDir, { recursive: true });

        // Create a dummy archive for the shield to find
        const archivePath = join(testDir, "archive.zip");
        writeFileSync(archivePath, "fake zip content");

        const config = createMockConfig({
            source_provider: "gdrive",
            backup_provider: "b2",
            local_dir: testDir,
            upsync_enabled: true,
            enable_malware_shield: true
        });

        const phases: string[] = [];
        const progressUpdates: Partial<SyncProgress>[] = [];

        await runSync(config, (p: Partial<SyncProgress>) => {
            if (p.phase && !phases.includes(p.phase)) {
                phases.push(p.phase);
            }
            progressUpdates.push(p);
        });

        // Verify phase sequence
        expect(phases).toContain("syncing");
        expect(phases).toContain("clean");
        expect(phases).toContain("done");

        // Verify queue updates
        const hasQueues = progressUpdates.some(p => (p.downloadQueue && p.downloadQueue.length > 0) || (p.uploadQueue && p.uploadQueue.length > 0));
        expect(hasQueues).toBe(true);

        // Verify final state
        const lastUpdate = progressUpdates[progressUpdates.length - 1];
        expect(lastUpdate?.phase).toBe("done");
        expect(lastUpdate?.percentage).toBe(100);
        expect(lastUpdate?.description).toContain("MISSION ACCOMPLISHED");

        // Verify persistence: saveConfig should have been called at the end
        expect(mockSaveConfig).toHaveBeenCalled();
        const calls = mockSaveConfig.mock.calls;
        if (calls.length === 0) throw new Error("saveConfig not called");
        const finalPersistedConfig = (calls[0] as unknown[])?.[0] as PortalConfig;

        expect(finalPersistedConfig.last_sync_stats).toBeDefined();
        expect(finalPersistedConfig.last_sync_stats?.status).toBe("success");
        expect(finalPersistedConfig.last_sync_stats?.files_processed).toBeGreaterThan(0);

        // Cleanup
        if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    });

    it("should handle sync failure in rclone", async () => {
        const testDir = join(process.cwd(), "test_sync_fail_" + Math.random().toString(36).slice(2));
        if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
        mkdirSync(testDir, { recursive: true });

        // Trigger failure in mock_rclone
        process.env.MOCK_FAIL_PROBABILITY = "1.0";

        const config = createMockConfig({
            source_provider: "gdrive",
            local_dir: testDir
        });

        let errorProgress: Partial<SyncProgress> | null = null;
        await runSync(config, (p: Partial<SyncProgress>) => {
            if (p.phase === "error") errorProgress = p;
        });

        if (!errorProgress) throw new Error("Expected error progress");
        expect((errorProgress as SyncProgress).description || "").toContain("Sync Failed");

        // Reset failure probability
        process.env.MOCK_FAIL_PROBABILITY = "0";

        // Cleanup
        if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    });


});
