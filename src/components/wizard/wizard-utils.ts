import type { PortalConfig, PortalProvider } from "../../lib/config";
import type { Step } from "./types";
import { PROVIDER_REGISTRY } from "../../lib/providers";
import { isSystemBootstrapped } from "../../lib/deploy";

export interface NextStepContext {
    config: PortalConfig;
    isMenuMode: boolean;
    sourceProvider: PortalProvider;
    backupProvider: PortalProvider;
    cloudPath: "guided" | "direct" | null;
    /** Whether the current cloud_direct_entry visit is configuring the source or the backup. */
    wizardContext: "source" | "dest" | null;
}

/**
 * The wizard's step graph, as a pure function.
 *
 * Returning `null` means "stay put" (the step's prerequisite is unmet). Keeping this
 * free of side effects matters: it used to live inside a `setStep` updater and called
 * `onComplete`/`resetWizardRefs` from there, which is unsafe under double invocation.
 */
export const resolveNextStep = (prevStep: Step, ctx: NextStepContext): Step | null => {
    const { config, isMenuMode, sourceProvider, backupProvider, cloudPath, wizardContext } = ctx;
    const afterMenu = (step: Step): Step => (isMenuMode ? "edit_menu" : step);

    switch (prevStep) {
        case "shortcut": return isMenuMode ? "edit_menu" : "download_mode";
        case "download_mode": return isMenuMode ? "edit_menu" : "source_choice";
        case "source_choice": {
            if (sourceProvider === "unconfigured") return null;
            if (sourceProvider === "copyparty") return "copyparty_config";
            if (sourceProvider === "none") return afterMenu("dir");
            const meta = PROVIDER_REGISTRY[sourceProvider];
            return meta ? (meta.id + "_intro") as Step : afterMenu("dir");
        }
        case "copyparty_config": return afterMenu("dir");
        case "dir": return afterMenu("mirror");
        case "mirror": return afterMenu("upsync_ask");
        case "upsync_ask": return config.upsync_enabled ? "dest_cloud_select" : afterMenu("security");
        case "dest_cloud_select": {
            if (backupProvider === "unconfigured") return null;
            const meta = PROVIDER_REGISTRY[backupProvider];
            return (meta?.hasGuidedPath || meta?.hasDirectPath)
                ? (meta.id + "_intro") as Step
                : afterMenu("backup_dir");
        }
        case "backup_dir": return afterMenu("security");
        // Notifications are part of the first-run flow; ntfy_config used to be reachable
        // only from the edit menu, and only by mouse.
        case "security": return afterMenu("ntfy_config");
        case "ntfy_config": return afterMenu("deploy");
        case "cloud_direct_entry":
            return isMenuMode ? "edit_menu" : (wizardContext === "source" ? "dir" : "backup_dir");
        case "deploy": return null; // completion is the caller's side effect
        default: {
            const provider = Object.values(PROVIDER_REGISTRY).find(p => prevStep.startsWith(p.id + "_"));
            if (!provider) return null;

            if (prevStep.endsWith("_intro")) {
                if (cloudPath === "guided" && provider.steps.length > 0) {
                    const guideIdx = provider.steps.findIndex(s => s.includes("_guide_"));
                    return (guideIdx !== -1 ? provider.steps[guideIdx] : (provider.steps[1] || provider.steps[0])) as Step;
                }
                return "cloud_direct_entry";
            }
            if (prevStep.includes("_guide_")) {
                const idx = provider.steps.indexOf(prevStep);
                return (idx !== -1 && idx < provider.steps.length - 1)
                    ? provider.steps[idx + 1] as Step
                    : "cloud_direct_entry";
            }
            return null;
        }
    }
};

/**
 * Determines the logical context (source vs destination) for a given wizard step.
 */
export const getStepContext = (s: Step, history: Step[]): "source" | "dest" | null => {
    if (s === "source_choice" || s === "copyparty_config") return "source";
    if (s === "dest_cloud_select" || s === "backup_dir" || s === "security") return "dest";
    if (s === "cloud_direct_entry" || Object.values(PROVIDER_REGISTRY).some(p => (p.steps as string[]).includes(s))) {
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i] === "source_choice") return "source";
            if (history[i] === "dest_cloud_select") return "dest";
        }
    }
    return null;
};

/**
 * Determines the first incomplete configuration step.
 */
export const findNextStep = (c: PortalConfig, mode?: "continue" | "restart" | "edit"): Step => {
    if (mode === "edit") return "edit_menu";
    if (mode === "restart") return "shortcut";
    const skipShort = isSystemBootstrapped() || c.desktop_shortcut === 2;
    if (!skipShort) return "shortcut";
    if (c.source_provider === "unconfigured") return "source_choice";
    if (!c.local_dir || c.local_dir === "" || c.local_dir === "none") return "dir";
    if (c.strict_mirror === undefined) return "mirror";
    if (c.upsync_enabled === undefined) return "upsync_ask";
    if (c.upsync_enabled && (c.backup_provider === "unconfigured")) return "dest_cloud_select";
    if (c.upsync_enabled && !c.backup_dir) return "backup_dir";
    return "deploy";
};
