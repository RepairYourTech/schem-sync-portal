import type { PortalConfig } from "../../lib/config";
import type { Step } from "./types";
import { PROVIDER_REGISTRY } from "../../lib/providers";
import { isSystemBootstrapped } from "../../lib/deploy";

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
