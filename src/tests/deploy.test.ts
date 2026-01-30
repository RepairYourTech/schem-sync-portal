import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { Env } from "../lib/env";
import { Logger } from "../lib/logger";
import { join } from "path";
import { mkdirSync, existsSync, readFileSync, rmSync } from "fs";
import { isSystemBootstrapped, bootstrapSystem, removeSystemBootstrap } from "../lib/deploy";

describe("Deployment (Bootstrap)", () => {
    const testRoot = join(process.cwd(), "test_deploy_root");
    const appsDir = join(testRoot, "apps");
    const desktopDir = join(testRoot, "desktop");
    const binDir = join(testRoot, "bin");

    beforeAll(() => {
        if (!existsSync(testRoot)) mkdirSync(testRoot, { recursive: true });
        if (!existsSync(appsDir)) mkdirSync(appsDir, { recursive: true });
        if (!existsSync(desktopDir)) mkdirSync(desktopDir, { recursive: true });
        if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true });

        Logger.setLevel("DEBUG");

        // Mock Env.getPaths
        Env.getPaths = () => ({
            home: testRoot,
            configDir: join(testRoot, "config"),
            logsDir: join(testRoot, "logs"),
            rcloneConfigDir: join(testRoot, "rclone"),
            appsDir,
            desktopDir,
            binDir
        });
    });

    afterAll(() => {
        if (existsSync(testRoot)) rmSync(testRoot, { recursive: true, force: true });
    });

    test("should bootstrap and remove on Linux", () => {
        Object.defineProperty(Env, "isWin", { get: () => false, configurable: true });
        Object.defineProperty(Env, "isMac", { get: () => false, configurable: true });
        Env.getDisplayName = () => "portal.desktop";

        const scriptPath = join(testRoot, "run.sh");
        bootstrapSystem(scriptPath);

        const desktopFile = join(appsDir, "portal.desktop");
        expect(existsSync(desktopFile)).toBe(true);
        expect(readFileSync(desktopFile, "utf-8")).toContain("[Desktop Entry]");

        expect(isSystemBootstrapped()).toBe(true);

        removeSystemBootstrap();
        expect(existsSync(desktopFile)).toBe(false);
        expect(isSystemBootstrapped()).toBe(false);
    });

    test("should bootstrap and remove on Mac", () => {
        Object.defineProperty(Env, "isWin", { get: () => false, configurable: true });
        Object.defineProperty(Env, "isMac", { get: () => true, configurable: true });
        Env.getDisplayName = () => "portal.command";

        bootstrapSystem("/fake/script");

        const commandFile = join(appsDir, "portal.command");
        expect(existsSync(commandFile)).toBe(true);
        expect(readFileSync(commandFile, "utf-8")).toContain("#!/bin/bash");

        expect(isSystemBootstrapped()).toBe(true);

        removeSystemBootstrap();
        expect(existsSync(commandFile)).toBe(false);
    });

    test("should bootstrap and remove on Windows", () => {
        Object.defineProperty(Env, "isWin", { get: () => true, configurable: true });
        Object.defineProperty(Env, "isMac", { get: () => false, configurable: true });
        Env.getDisplayName = () => "portal.bat";

        bootstrapSystem("C:\\fake\\path");

        const batchFile = join(appsDir, "portal.bat");
        expect(existsSync(batchFile)).toBe(true);
        expect(readFileSync(batchFile, "utf-8")).toContain("@echo off");

        expect(isSystemBootstrapped()).toBe(true);

        removeSystemBootstrap();
        expect(existsSync(batchFile)).toBe(false);
    });
});
