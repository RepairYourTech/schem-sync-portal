import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ManifestParser } from "../lib/shield/manifestParser";
import { ShieldManager } from "../lib/shield/ShieldManager";
import { join } from "path";
import { writeFileSync, existsSync, mkdirSync, rmSync } from "fs";

describe("Phase 1: Manifest System", () => {
    const testDir = join(process.cwd(), "tmp_manifest_test");

    beforeEach(() => {
        if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    });

    it("should parse a valid manifest with comments", () => {
        const content = `
# Generated: 2026-02-05T12:00:00Z
# Shield version: 2.0.0
# Policy: isolate
file_a.txt
file_b.bin
        `.trim();

        const manifest = ManifestParser.parse(content);
        expect(manifest.version).toBe("2.0.0");
        expect(manifest.policy).toBe("isolate");
        expect(manifest.files).toContain("file_a.txt");
        expect(manifest.files).toContain("file_b.bin");
        expect(manifest.generatedAt).toBe("2026-02-05T12:00:00Z");
    });

    it("should stringify and parse back correctly", () => {
        const original = {
            generatedAt: new Date().toISOString(),
            version: "2.0.0",
            policy: "purge" as const,
            files: ["z.txt", "a.txt"]
        };

        const stringified = ManifestParser.stringify(original);
        const parsed = ManifestParser.parse(stringified);

        expect(parsed.files).toEqual(["a.txt", "z.txt"]); // Should be sorted
        expect(parsed.policy).toBe("purge");
        expect(parsed.version).toBe("2.0.0");
    });

    it("should correctly diff two manifests", () => {
        const oldM = {
            generatedAt: "", version: "", policy: "purge" as const,
            files: ["stay.txt", "removed.txt"]
        };
        const newM = {
            generatedAt: "", version: "", policy: "purge" as const,
            files: ["stay.txt", "added.txt"]
        };

        const diff = ManifestParser.diff(oldM, newM);
        expect(diff.added).toEqual(["added.txt"]);
        expect(diff.removed).toEqual(["removed.txt"]);
        expect(diff.totalCount).toBe(2);
    });

    it("should save and load manifest via ShieldManager", () => {
        const files = ["test1.txt", "test2.txt"];
        ShieldManager.saveUpsyncManifest(testDir, files, "purge");

        const manifest = ShieldManager.loadManifest(testDir);
        expect(manifest.files).toEqual(["test1.txt", "test2.txt"]);
        expect(manifest.policy).toBe("purge");
        expect(new Date(manifest.generatedAt).getTime()).toBeGreaterThan(0);
    });

    it("should verify manifest integrity", () => {
        const files = ["exists.txt", "missing.txt"];
        writeFileSync(join(testDir, "exists.txt"), "data");
        // missing.txt is NOT created

        ShieldManager.saveUpsyncManifest(testDir, files, "purge");
        const verification = ShieldManager.verifyManifest(testDir);

        expect(verification.valid).toBe(false);
        expect(verification.missing).toEqual(["missing.txt"]);
        expect(verification.total).toBe(2);
    });
});
