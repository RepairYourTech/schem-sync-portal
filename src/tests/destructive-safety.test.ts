import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { Logger } from "../lib/logger";
import { join } from "path";
import { tmpdir, homedir } from "os";
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } from "fs";
import { ShieldManager } from "../lib/shield/ShieldManager";
import { runCleanupSweep, __setArchiveEngine, __setSpawnSync } from "../lib/cleanup";
import { Env } from "../lib/env";
import { RETRY_FLAGS } from "../lib/sync/utils";
import type { CleanupStats } from "../lib/sync/types";

/**
 * Guards the invariants that stop this app from destroying a schematic library.
 * Each test here corresponds to a defect that shipped and was invisible to the
 * rest of the suite: the app deleted data it had never successfully read.
 */
describe("Destructive operation safety", () => {
    let testDir = "";
    let excludeFile = "";

    const freshStats = (policy: "purge" | "isolate" | "extract" = "purge"): CleanupStats => ({
        phase: "clean", totalArchives: 0, scannedArchives: 0, safePatternCount: 0, riskyPatternCount: 0,
        cleanArchives: 0, flaggedArchives: 0, extractedFiles: 0, purgedFiles: 0, isolatedFiles: 0,
        policyMode: policy, extractedFilePaths: []
    });

    /** A 7z-shaped listing for an archive holding one innocuous schematic. */
    const cleanListing = "   Date      Time    Attr         Size   Name\n2026-01-01 00:00:00 ....A         1024  board.sch\n";

    beforeEach(() => {
        testDir = mkdtempSync(join(tmpdir(), "shield_safety_"));
        excludeFile = join(testDir, ".shield-exclude.txt");
        ShieldManager.resetShield(testDir);
        __setArchiveEngine({ type: "7z", bin: "7z" });
        Logger.setLevel("DEBUG");
        Logger.clearLogs();
    });

    afterEach(() => {
        if (testDir && existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    });

    test("keeps the archive when the extractor exits non-zero", async () => {
        // Listing succeeds (archive is readable) but extraction fails, as with a
        // password-protected or truncated archive. 7z reports this as exit code 2.
        __setSpawnSync(((options: string[] | { cmd: string[] }) => {
            const args = Array.isArray(options) ? options : options.cmd;
            const isListing = args[1] === "l";
            if (isListing) return { stdout: Buffer.from(cleanListing), stderr: Buffer.from(""), success: true, exitCode: 0 };
            return { stdout: Buffer.from(""), stderr: Buffer.from("Cannot open encrypted archive"), success: false, exitCode: 2 };
        }) as never);

        const archivePath = join(testDir, "protected.zip");
        writeFileSync(archivePath, "encrypted archive bytes");

        const stats = freshStats();
        const result = await runCleanupSweep(testDir, excludeFile, "purge", undefined, undefined, stats);

        expect(existsSync(archivePath)).toBe(true);
        expect(stats.purgedFiles).toBe(0);
        expect(stats.failedExtractions).toBe(1);
        expect(result.unscannedArchives).toContain("protected.zip");
    });

    test("a failed extraction does not enter the exclusion ledger", async () => {
        // Excluding it would make the archive permanently un-redownloadable, turning a
        // recoverable failure into permanent data loss.
        __setSpawnSync(((options: string[] | { cmd: string[] }) => {
            const args = Array.isArray(options) ? options : options.cmd;
            if (args[1] === "l") return { stdout: Buffer.from(cleanListing), stderr: Buffer.from(""), success: true, exitCode: 0 };
            return { stdout: Buffer.from(""), stderr: Buffer.from("fatal"), success: false, exitCode: 2 };
        }) as never);

        const archivePath = join(testDir, "broken.zip");
        writeFileSync(archivePath, "bytes");

        await runCleanupSweep(testDir, excludeFile, "purge", undefined, undefined, freshStats());

        const ledger = existsSync(excludeFile) ? readFileSync(excludeFile, "utf-8") : "";
        expect(ledger).not.toContain("broken.zip");
    });

    test("an archive whose listing merely mentions 'error' is not condemned", async () => {
        // "Error Codes.pdf" is a legitimate filename. The old fail-safe substring-matched
        // the whole listing for "error" and purged the archive.
        const listingWithErrorFilename =
            "   Date      Time    Attr         Size   Name\n" +
            "2026-01-01 00:00:00 ....A         2048  Error Codes.pdf\n" +
            "2026-01-01 00:00:00 ....A         1024  board.sch\n";

        __setSpawnSync(((options: string[] | { cmd: string[] }) => {
            const args = Array.isArray(options) ? options : options.cmd;
            if (args[1] === "l") return { stdout: Buffer.from(listingWithErrorFilename), stderr: Buffer.from(""), success: true, exitCode: 0 };
            return { stdout: Buffer.from(""), stderr: Buffer.from(""), success: true, exitCode: 0 };
        }) as never);

        const archivePath = join(testDir, "manual.zip");
        writeFileSync(archivePath, "bytes");

        const stats = freshStats();
        await runCleanupSweep(testDir, excludeFile, "purge", undefined, undefined, stats);

        // Readable and non-malicious: treated as a clean archive, not flagged as suspicious.
        expect(stats.invalidListingArchives ?? 0).toBe(0);
        expect(stats.flaggedArchives).toBe(0);
        expect(stats.cleanArchives).toBe(1);
    });

    test("refuses to sweep a directory that fails the safety guard", async () => {
        // Deliberately a non-existent path under a blocked system root: if the guard ever
        // regresses, this test globs nothing rather than sweeping a real directory.
        const unsafe = "/usr/schem-portal-should-never-be-swept";
        expect(Env.isSafeDirectory(unsafe)).toBe(false);

        const result = await runCleanupSweep(unsafe, join(unsafe, ".shield-exclude.txt"), "purge");
        expect(result.completed).toBe(false);
        expect(result.scannedArchives).toEqual([]);
    });
});

describe("Directory safety guard", () => {
    test("rejects filesystem root, system dirs, and the home directory", () => {
        expect(Env.isSafeDirectory("/")).toBe(false);
        expect(Env.isSafeDirectory("/usr")).toBe(false);
        expect(Env.isSafeDirectory("/etc/cron.d")).toBe(false);
        expect(Env.isSafeDirectory(homedir())).toBe(false);
        expect(Env.isSafeDirectory("/home")).toBe(false);
    });

    test("rejects empty, relative, and tilde paths", () => {
        expect(Env.isSafeDirectory("")).toBe(false);
        expect(Env.isSafeDirectory("   ")).toBe(false);
        expect(Env.isSafeDirectory("relative/dir")).toBe(false);
        expect(Env.isSafeDirectory("~/schematics")).toBe(false);
    });

    test("resolves traversal before judging", () => {
        expect(Env.isSafeDirectory(join(homedir(), "..", ".."))).toBe(false);
    });

    test("accepts a dedicated subfolder", () => {
        expect(Env.isSafeDirectory(join(homedir(), "schematics"))).toBe(true);
        expect(Env.isSafeDirectory("/mnt/data/schematics")).toBe(true);
    });

    test("explains why a path was rejected", () => {
        expect(Env.getUnsafeDirectoryReason("/")).toContain("root");
        expect(Env.getUnsafeDirectoryReason(homedir())).toContain("home directory");
        expect(Env.getUnsafeDirectoryReason(join(homedir(), "schematics"))).toBeNull();
    });
});

describe("rclone flag safety", () => {
    test("--ignore-errors is never sent", () => {
        // rclone documents --ignore-errors as "delete even if there are I/O errors".
        // With `sync` (strict mirror) that turns a partial network failure into deletion.
        expect(RETRY_FLAGS).not.toContain("--ignore-errors");
    });
});
