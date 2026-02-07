import { expect, test, describe, mock, afterEach } from "bun:test";
import { isNewer, checkForUpdates } from "../lib/versionChecker";
import { join } from "path";
import { unlinkSync, existsSync, writeFileSync } from "fs";

describe("Version Checker Logic", () => {
    const CACHE_FILE = join(process.cwd(), ".update-cache.json");

    afterEach(() => {
        if (existsSync(CACHE_FILE)) {
            try {
                unlinkSync(CACHE_FILE);
            } catch {
                // Ignore
            }
        }
    });

    test("isNewer should correctly compare versions", () => {
        expect(isNewer("0.1.0", "0.1.1")).toBe(true);
        expect(isNewer("0.1.0", "0.2.0")).toBe(true);
        expect(isNewer("0.1.0", "1.0.0")).toBe(true);

        expect(isNewer("0.1.1", "0.1.0")).toBe(false);
        expect(isNewer("0.1.0", "0.1.0")).toBe(false);
        expect(isNewer("1.0.0", "0.9.9")).toBe(false);

        // Handle 'v' prefix
        expect(isNewer("0.1.0", "v0.1.1")).toBe(true);
    });

    test("checkForUpdates should handle GitHub API response", async () => {
        const originalFetch = global.fetch;
        try {
            global.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({
                tag_name: "v9.9.9",
                html_url: "https://github.com/RepairYourTech/schem-sync-portal/releases/tag/v9.9.9",
                published_at: "2026-02-06T12:00:00Z",
                body: "Great updates"
            }), { status: 200 }))) as any;

            const info = await checkForUpdates(true);
            expect(info).not.toBeNull();
            expect(info?.available).toBe(true);
            expect(info?.latestVersion).toBe("v9.9.9");
        } finally {
            global.fetch = originalFetch;
        }
    });

    test("checkForUpdates should handle rate limiting", async () => {
        const originalFetch = global.fetch;
        try {
            global.fetch = mock(() => Promise.resolve(new Response(null, { status: 403 }))) as any;

            const info = await checkForUpdates(true);
            expect(info).toBeNull();
        } finally {
            global.fetch = originalFetch;
        }
    });

    test("checkForUpdates should use cache", async () => {
        const mockInfo = {
            available: true,
            latestVersion: "v8.8.8",
            currentVersion: "0.1.0",
            url: "http://example.com",
            publishedAt: "2026-01-01",
            body: "Cache test"
        };

        writeFileSync(CACHE_FILE, JSON.stringify({
            data: mockInfo,
            timestamp: Date.now()
        }));

        const info = await checkForUpdates(false);
        expect(info).toEqual(mockInfo);
    });
});
