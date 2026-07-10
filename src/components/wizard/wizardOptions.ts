import type { PortalConfig, PortalProvider } from "../../lib/config.ts";
import { PROVIDER_REGISTRY } from "../../lib/providers";
import type { Step, WizardOption } from "./types";
import { EDIT_MENU_ENTRIES, DIRECT_ENTRY_FIELDS } from "./types";

/**
 * The selectable options for a step, in the same order the step renders them.
 *
 * This is the keyboard's view of each screen. It must match what the step component
 * draws: when the two lists drifted, pressing Enter on a highlighted row invoked a
 * different row's action.
 */
export function getStepOptions(step: Step, config: PortalConfig, isShortcutMissing: boolean): WizardOption[] {
    if (step === "shortcut") {
        const opts: WizardOption[] = isShortcutMissing
            ? [{ value: 1, type: "bootstrap" }, { value: 2, type: "shortcut" }, { value: 0, type: "skip" }]
            : [{ value: 1, type: "desktop_shortcut" }, { value: 0, type: "desktop_shortcut" }];
        return [...opts, { value: "back", type: "back" }];
    }

    if (step === "download_mode") {
        return [{ value: "full", type: "download_mode" }, { value: "lean", type: "download_mode" }, { value: "back", type: "back" }];
    }

    if (step === "edit_menu") {
        return [...EDIT_MENU_ENTRIES.map(e => ({ value: e.value, type: "jump", label: e.label, key: e.key })), { value: "back", type: "back" }];
    }

    if (step === "source_choice") {
        return [
            ...Object.keys(PROVIDER_REGISTRY)
                .filter(k => !["none", "unconfigured"].includes(k))
                .map(v => ({ value: v, type: "source_select" })),
            { value: "back", type: "back" }
        ];
    }

    if (step === "mirror") {
        return [{ value: false, type: "mirror" }, { value: true, type: "mirror" }, { value: "back", type: "back" }];
    }

    if (step === "dir" || step === "backup_dir") {
        // Each step must show its own field; both previously displayed local_dir.
        const current = step === "backup_dir" ? (config.backup_dir || "") : (config.local_dir || "");
        return [{ value: current, type: "dir_input" }, { value: "confirm", type: "dir_confirm" }, { value: "back", type: "back" }];
    }

    if (step === "upsync_ask") {
        return [{ value: "download_only", type: "sync_mode" }, { value: "sync_backup", type: "sync_mode" }, { value: "back", type: "back" }];
    }

    if (step === "security") {
        // Must mirror SecurityStep's rendered list exactly, including "extract".
        // It was missing here, so hotkey 3 selected the row labelled [4] DISABLED.
        const opts: WizardOption[] = [
            { value: "isolate", type: "sec_policy" },
            { value: "purge", type: "sec_policy" },
            { value: "extract", type: "sec_policy" },
            { value: false, type: "sec_toggle" }
        ];
        const filtered = config.backup_provider === "gdrive"
            ? opts.filter(o => o.value !== false && o.value !== "extract")
            : opts;
        return [...filtered, { value: "back", type: "back" }];
    }

    if (step === "dest_cloud_select") {
        return [
            ...Object.keys(PROVIDER_REGISTRY)
                .filter(k => !["none", "unconfigured", "copyparty"].includes(k))
                .map(v => ({ value: v, type: "backup_provider" })),
            { value: "back", type: "back" }
        ];
    }

    if (step?.endsWith("_intro")) {
        const provider = Object.values(PROVIDER_REGISTRY).find(p => step.startsWith(p.id + "_"));
        const opts: WizardOption[] = [];
        if (provider?.hasGuidedPath) opts.push({ value: "guided", type: "intro_path" });
        if (provider?.hasDirectPath) opts.push({ value: "direct", type: "intro_path" });
        return [...opts, { value: "back", type: "back" }];
    }

    if (step?.includes("_guide_")) {
        return [{ value: true, type: "guide_next" }, { value: "back", type: "back" }];
    }

    if (step === "deploy") {
        return [{ value: true, type: "deploy" }, { value: false, type: "deploy" }, { value: "back", type: "back" }];
    }

    return [];
}

/** Field keys the provider requires that the user has left blank. */
export function directEntryMissingFields(
    provider: PortalProvider,
    values: Record<string, string>
): string[] {
    // Google Drive intentionally allows blank credentials: rclone then falls back to
    // its shared OAuth client.
    if (provider === "gdrive") return [];
    return (DIRECT_ENTRY_FIELDS[provider] ?? []).filter(key => !(values[key] || "").trim());
}
