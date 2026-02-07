import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { join } from "path";
import { existsSync, rmSync } from "fs";
import { saveConfig, loadConfig, EMPTY_CONFIG, type PortalConfig } from "../lib/config";

describe("Config save/load enforcement", () => {
    const testConfigPath = join(process.cwd(), "test_config.json");

    beforeAll(() => {
        process.env.PORTAL_CONFIG_PATH = testConfigPath;
    });

    afterAll(() => {
        if (existsSync(testConfigPath)) {
            rmSync(testConfigPath, { force: true });
        }
    });

    test("should enforce malware shield enabled for Google Drive", () => {
        const config: PortalConfig = {
            ...EMPTY_CONFIG,
            backup_provider: "gdrive",
            enable_malware_shield: false, // Try to disable it
            malware_policy: "purge"
        };

        saveConfig(config);
        const loaded = loadConfig();

        // Shield should be forced to enabled for gdrive
        expect(loaded.enable_malware_shield).toBe(true);
    });

    test("should allow PURGE policy for Google Drive users", () => {
        const config: PortalConfig = {
            ...EMPTY_CONFIG,
            backup_provider: "gdrive",
            enable_malware_shield: true,
            malware_policy: "purge"
        };

        saveConfig(config);
        const loaded = loadConfig();

        // Policy should be preserved as "purge", not forced to "isolate"
        expect(loaded.malware_policy).toBe("purge");
    });

    test("should allow ISOLATE policy for Google Drive users", () => {
        const config: PortalConfig = {
            ...EMPTY_CONFIG,
            backup_provider: "gdrive",
            enable_malware_shield: true,
            malware_policy: "isolate"
        };

        saveConfig(config);
        const loaded = loadConfig();

        expect(loaded.malware_policy).toBe("isolate");
    });

    test("should not enforce anything for non-Google Drive providers", () => {
        const config: PortalConfig = {
            ...EMPTY_CONFIG,
            backup_provider: "b2",
            enable_malware_shield: false,
            malware_policy: "purge"
        };

        saveConfig(config);
        const loaded = loadConfig();

        expect(loaded.enable_malware_shield).toBe(false);
        expect(loaded.malware_policy).toBe("purge");
    });

    test("should allow DISABLED policy for non-Google Drive providers", () => {
        const config: PortalConfig = {
            ...EMPTY_CONFIG,
            backup_provider: "sftp",
            enable_malware_shield: false,
            malware_policy: "purge"
        };

        saveConfig(config);
        const loaded = loadConfig();

        expect(loaded.enable_malware_shield).toBe(false);
    });
});
