import { expect, test, describe, mock } from "bun:test";
import { checkFontGuard } from "../lib/fontGuard";
import { EMPTY_CONFIG } from "../lib/config";
import { __setDetectNerdFonts } from "../lib/doctor";

describe("Font Guard", () => {
    test("should require installation when fonts are missing", async () => {
        // Mock detectNerdFonts
        const mockDetect = mock(async () => ({
            isInstalled: false,
            version: null,
            method: 'none' as const,
            confidence: 'low' as const,
            installedFonts: []
        }));

        __setDetectNerdFonts(mockDetect);

        const result = await checkFontGuard(EMPTY_CONFIG);
        expect(result.requiresInstallation).toBe(true);
        expect(result.message).toContain("not detected");
    });

    test("should require upgrade when v2 fonts detected", async () => {
        __setDetectNerdFonts(mock(async () => ({
            isInstalled: true,
            version: 2 as const,
            method: 'fc-list' as const,
            confidence: 'high' as const,
            installedFonts: ['FontAwesome']
        })));

        const result = await checkFontGuard(EMPTY_CONFIG);
        expect(result.requiresUpgrade).toBe(true);
        expect(result.message).toContain("Upgrade to v3");
    });

    test("should not require action when v3 fonts detected", async () => {
        __setDetectNerdFonts(mock(async () => ({
            isInstalled: true,
            version: 3 as const,
            method: 'fc-list' as const,
            confidence: 'high' as const,
            installedFonts: ['NerdFont']
        })));

        const result = await checkFontGuard(EMPTY_CONFIG);
        expect(result.requiresInstallation).toBe(false);
        expect(result.requiresUpgrade).toBe(false);
    });

    test("should skip check if last_check within 7 days", async () => {
        const mockDetect = mock(async () => ({
            isInstalled: true,
            version: 3 as const,
            method: 'fc-list' as const,
            confidence: 'high' as const,
            installedFonts: ['NerdFont']
        }));
        __setDetectNerdFonts(mockDetect);

        const config = {
            ...EMPTY_CONFIG,
            nerd_font_last_check: Date.now() - 86400000 // 1 day ago
        };

        const result = await checkFontGuard(config);
        expect(result.message).toContain("recently verified");
        expect(mockDetect).not.toHaveBeenCalled();
    });

    test("should perform check if last_check older than 7 days", async () => {
        const mockDetect = mock(async () => ({
            isInstalled: true,
            version: 3 as const,
            method: 'fc-list' as const,
            confidence: 'high' as const,
            installedFonts: ['NerdFont']
        }));
        __setDetectNerdFonts(mockDetect);

        const config = {
            ...EMPTY_CONFIG,
            nerd_font_last_check: Date.now() - 604800001 // > 7 days
        };

        await checkFontGuard(config);
        expect(mockDetect).toHaveBeenCalled();
    });
});
