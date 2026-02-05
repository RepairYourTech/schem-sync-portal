import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { runSync } from "../lib/sync";
import { Logger } from "../lib/logger";
import { join } from "path";
import { mkdirSync, existsSync, rmSync, writeFileSync, readFileSync } from "fs";
import { createMockConfig } from "./ui-test-helpers";

describe("Upsync Manifest Exclusions", () => {
    const testDir = join(process.cwd(), "test_exclusion_dir");

    const mockConfig = createMockConfig({
        source_provider: "none", // Force standalone shield path
        backup_provider: "none",
        backup_dir: "",
        upsync_enabled: true,
        local_dir: testDir,
        strict_mirror: true,
        enable_malware_shield: true,
        malware_policy: "isolate",
        desktop_shortcut: 0,
        debug_mode: true
    });

    beforeAll(() => {
        if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
        process.env.PORTAL_CONFIG_PATH = join(testDir, "test_config.json");
        Logger.setLevel("DEBUG");
        Logger.clearLogs();
    });

    afterAll(() => {
        try {
            if (existsSync(testDir)) {
                rmSync(testDir, { recursive: true, force: true });
            }
        } catch (err) {
            console.error(`Failed to clean up test artifacts: ${err}`);
        }
    });

    test("should exclude _risk_tools path from upsync manifest", async () => {
        // 1. Setup local dir with clean file and isolated malware
        const cleanFile = join(testDir, "clean.pdf");
        writeFileSync(cleanFile, "clean content");

        const riskDir = join(testDir, "_risk_tools");
        if (!existsSync(riskDir)) mkdirSync(riskDir, { recursive: true });

        const malwareFile = join(riskDir, "malware.zip");
        writeFileSync(malwareFile, "malicious content");

        // 2. Run sync (standalone shield mode)
        await runSync(mockConfig, () => { });

        // 3. Verify manifest content
        const manifestPath = join(testDir, "upsync-manifest.txt");
        expect(existsSync(manifestPath)).toBe(true);

        const manifestContent = readFileSync(manifestPath, "utf8");

        // Should contain clean file
        expect(manifestContent).toContain("clean.pdf");

        // CRITICAL: Should NOT contain _risk_tools or its contents
        expect(manifestContent).not.toContain("_risk_tools");
        expect(manifestContent).not.toContain("malware.zip");

        // Verify Logger recorded the skip
        const logs = Logger.getRecentLogs(50);
        expect(logs.some(l => l.includes("Skipping isolated directory: _risk_tools"))).toBe(true);
    });
});
