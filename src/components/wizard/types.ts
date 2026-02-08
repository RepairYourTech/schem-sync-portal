import type { PortalConfig, PortalProvider } from "../../lib/config.ts";
import type { FocusArea } from "../../hooks/useAppState";

export interface WizardOption {
    label: string;
    value: PortalProvider;
    description: string;
    meta: boolean;
}

export interface WizardProps {
    onComplete: (config: PortalConfig) => void;
    onUpdate?: (config: PortalConfig) => void;
    onCancel: () => void;
    onQuit: () => void;
    initialConfig: PortalConfig;
    mode?: "continue" | "restart" | "edit";
    focusArea: FocusArea;
    onFocusChange: (area: FocusArea) => void;
    tabTransition?: "forward" | "backward" | null;
    backSignal: number;
}

export type WizardMode = "continue" | "restart" | "edit";
