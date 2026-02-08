import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { runManifestCloudPhase } from "../lib/sync/cloudPhase";
import { join } from "path";
import { mkdirSync, existsSync, rmSync, writeFileSync } from "fs";
import { createMockConfig } from "./ui-test-helpers";
import type { SyncProgress } from "../lib/sync/types";

describe("Remote Manifest Verification", () => {
    const testDir = join(process.cwd(), "test_remote_manifest_dir");

    const mockConfig = createMockConfig({
        source_provider: "gdrive",
        backup_provider: "gdrive",
        backup_dir: "SchematicsBackup",
        upsync_enabled: true,
        local_dir: testDir,
        enable_malware_shield: false,
    });

    beforeAll(() => {
        if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
        process.env.MOCK_RCLONE = "src/tests/mock_rclone.ts";
        process.env.RCLONE_CONFIG_PATH = join(testDir, "rclone.test.conf");
    });

    afterAll(() => {
        delete process.env.MOCK_RCLONE;
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true });
        }
    });

    test("should reconcile uploaded files from remote manifest", async () => {
        const manifestPath = join(testDir, "upsync-manifest.txt");
        // Create local manifest with 3 files
        writeFileSync(manifestPath, "file1.bin\nfile2.bin\nfile3.bin\nfile4.bin\n");

        const progressUpdates: Partial<SyncProgress>[] = [];

        // We need to provide a way for the loop to exit
        let pullDone = false;
        let reconciledCorrectly = false;

        await runManifestCloudPhase(mockConfig, (p) => {
            progressUpdates.push(p);
            // After reconciliation, we have 4 total, 3 uploaded, 1 pending.
            if (p.cloudManifestStats && p.cloudManifestStats.pendingFiles === 1) {
                reconciledCorrectly = true;
            }
            // When pending reaches 0, we can exit.
            if (p.phase === "cloud" && p.cloudManifestStats && p.cloudManifestStats.pendingFiles === 0) {
                pullDone = true;
            }
        }, () => {
            if (pullDone) return true;
            // Fallback for tests: if we reconciled correctly and pending is 0, we can stop
            const last = progressUpdates[progressUpdates.length - 1];
            if (reconciledCorrectly && last?.cloudManifestStats?.pendingFiles === 0) {
                return true;
            }
            return false;
        });

        // Verify that it reconciled files (mock_rclone returns file1, file2, file3)
        // So only file4.bin should have been "new"
        expect(reconciledCorrectly).toBe(true);

        const lastCloudStats = progressUpdates.reverse().find(p => p.cloudManifestStats)?.cloudManifestStats;
        expect(lastCloudStats?.uploadedFiles).toBe(4);
        expect(lastCloudStats?.pendingFiles).toBe(0);
    });
});
