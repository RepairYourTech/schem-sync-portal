import { describe, it, expect } from "bun:test";
import { getStepOptions, directEntryMissingFields } from "../components/wizard/wizardOptions";
import { EDIT_MENU_ENTRIES, directEntryFieldCount } from "../components/wizard/types";
import { EMPTY_CONFIG, type PortalConfig } from "../lib/config";
import { appFooterHeight, isCompactHeight } from "../lib/layout";

/**
 * The keyboard's option list and the rendered step must describe the same screen.
 * When they drifted, Enter on a highlighted row invoked a different row's action —
 * the single largest source of "the setup menus are chaos".
 */
describe("Wizard option lists", () => {
    const cfg = (over: Partial<PortalConfig> = {}): PortalConfig => ({ ...EMPTY_CONFIG, ...over });

    it("edit menu options match the rendered entries, in order", () => {
        const options = getStepOptions("edit_menu", cfg(), false);
        const jumps = options.filter(o => o.type === "jump");

        expect(jumps.map(o => o.value)).toEqual(EDIT_MENU_ENTRIES.map(e => e.value));
        expect(options[options.length - 1]?.type).toBe("back");
    });

    it("every edit-menu hotkey addresses its own row", () => {
        // The container maps digit N to option index N-1. A "[0]" hotkey was unreachable.
        EDIT_MENU_ENTRIES.forEach((entry, index) => {
            const digit = parseInt(entry.key, 10);
            expect(digit).toBeGreaterThanOrEqual(1);
            expect(digit).toBeLessThanOrEqual(9);
            expect(digit - 1).toBe(index);
        });
    });

    it("security options include EXTRACT so hotkeys line up with the labels", () => {
        const options = getStepOptions("security", cfg(), false);
        expect(options.map(o => o.value)).toEqual(["isolate", "purge", "extract", false, "back"]);
    });

    it("security hides EXTRACT and DISABLED when backing up to Google Drive", () => {
        const options = getStepOptions("security", cfg({ backup_provider: "gdrive" }), false);
        expect(options.map(o => o.value)).toEqual(["isolate", "purge", "back"]);
    });

    it("each directory step shows its own path, not local_dir for both", () => {
        const config = cfg({ local_dir: "/data/schematics", backup_dir: "/data/backup" });
        expect(getStepOptions("dir", config, false)[0]?.value).toBe("/data/schematics");
        expect(getStepOptions("backup_dir", config, false)[0]?.value).toBe("/data/backup");
    });

    it("shortcut recovery exposes distinct, handled option types", () => {
        const options = getStepOptions("shortcut", cfg(), true);
        expect(options.map(o => o.type)).toEqual(["bootstrap", "shortcut", "skip", "back"]);
    });
});

describe("Direct entry credential fields", () => {
    it("S3 collects the credentials its handler reads", () => {
        // s3DirectAuth reads userRef/passRef/urlRef; the step rendered no inputs at all.
        expect(directEntryFieldCount("s3")).toBe(3);
        expect(directEntryMissingFields("s3", { user: "", pass: "", url: "" }))
            .toEqual(["user", "pass", "url"]);
    });

    it("reports nothing missing once S3 fields are filled", () => {
        expect(directEntryMissingFields("s3", { user: "AKIA", pass: "secret", url: "s3.amazonaws.com" }))
            .toEqual([]);
    });

    it("allows blank Google credentials (rclone uses its shared OAuth client)", () => {
        expect(directEntryMissingFields("gdrive", { clientId: "", clientSecret: "" })).toEqual([]);
    });

    it("OAuth-only providers require no fields", () => {
        expect(directEntryFieldCount("onedrive")).toBe(0);
        expect(directEntryFieldCount("dropbox")).toBe(0);
    });

    it("flags a partially filled SFTP form", () => {
        expect(directEntryMissingFields("sftp", { url: "host.example.com", user: "", pass: "hunter2" }))
            .toEqual(["user"]);
    });
});

describe("Vertical layout budget", () => {
    it("collapses the footer on short terminals", () => {
        // A fixed 10-row footer consumed 42% of an 80x24 terminal.
        expect(appFooterHeight(24)).toBeLessThan(appFooterHeight(50));
        expect(isCompactHeight(24)).toBe(true);
        expect(isCompactHeight(40)).toBe(false);
    });

    it("leaves usable body height at 80x24", () => {
        const headerHeight = 5;
        const portalOverhead = 8;
        const available = 24 - headerHeight - appFooterHeight(24) - portalOverhead;
        expect(available).toBeGreaterThan(1);
    });
});
