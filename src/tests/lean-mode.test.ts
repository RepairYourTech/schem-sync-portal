import { describe, test, expect, mock } from "bun:test";
import { shouldDownloadInLeanMode } from "../lib/shield/archiveAnalyzer";

// Mock ShieldExecutor
mock.module("../lib/shield/ShieldExecutor", () => ({
    ShieldExecutor: {
        execute: mock(() => Promise.resolve({}))
    }
}));

// Mock Logger to silence output
mock.module("../lib/logger", () => ({
    Logger: {
        info: () => { },
        debug: () => { },
        warn: () => { },
        error: () => { }
    }
}));

describe("Lean Mode Logic", () => {
    describe("shouldDownloadInLeanMode", () => {
        test("Allows boardview files", () => {
            expect(shouldDownloadInLeanMode("macbook_pro_2020_boardview.brd")).toBe(true);
            expect(shouldDownloadInLeanMode("iphone_x_fv.f3z")).toBe(true);
            expect(shouldDownloadInLeanMode("motherboard.cad")).toBe(true);
        });

        test("Allows schematic files", () => {
            expect(shouldDownloadInLeanMode("schema.pdf")).toBe(true);
            expect(shouldDownloadInLeanMode("diagram.pdf")).toBe(true);
        });

        test("Blocks BIOS and Firmware", () => {
            expect(shouldDownloadInLeanMode("bios_dump.bin")).toBe(false);
            expect(shouldDownloadInLeanMode("firmware.rom")).toBe(false);
            expect(shouldDownloadInLeanMode("update.exe")).toBe(false);
            expect(shouldDownloadInLeanMode("flash_tool.zip")).toBe(false);
        });

        test("Blocks risky executables", () => {
            expect(shouldDownloadInLeanMode("virus.exe")).toBe(false);
            expect(shouldDownloadInLeanMode("loader.bat")).toBe(false);
        });
    });
});
