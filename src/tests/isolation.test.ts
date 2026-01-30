import { expect, test, describe } from "bun:test";
import { removePortalConfig } from "../lib/rclone";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { Env } from "../lib/env";

describe("Config Isolation", () => {
    const rcloneConfig = Env.getRcloneConfigPath();

    test("should surgically remove only portal remotes", () => {
        // Ensure config exists and has a "safe" remote
        const initialContent = `[protected_remote]\ntype = drive\nscope = drive\n\n`;
        if (!existsSync(Env.getPaths().rcloneConfigDir)) mkdirSync(Env.getPaths().rcloneConfigDir, { recursive: true });
        writeFileSync(rcloneConfig, initialContent);

        // 1. Manually add Portal Remote (Simulate creation)
        const contentWithPortal = initialContent + `[portal_test_remote]\ntype = drive\nclient_id = ID\n\n`;
        writeFileSync(rcloneConfig, contentWithPortal);

        // 2. Verify both exist
        let content = readFileSync(rcloneConfig, "utf8");
        expect(content).toContain("[protected_remote]");
        expect(content).toContain("[portal_test_remote]");

        // 3. Remove portal remote
        removePortalConfig(["portal_test_remote"]);

        // 4. Verify isolation
        content = readFileSync(rcloneConfig, "utf8");
        expect(content).toContain("[protected_remote]");
        expect(content).not.toContain("[portal_test_remote]");
    });
});
