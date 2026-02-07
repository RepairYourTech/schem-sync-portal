import type { PortalConfig, PortalProvider } from "../../lib/config.ts";
import type { ThemeColors } from "../../lib/theme.tsx";
import type { Step, WizardOption } from "./types";

export interface WizardStepProps {
    config: PortalConfig;
    updateConfig: (updater: (prev: PortalConfig) => PortalConfig) => void;
    next: () => void;
    back: () => void;
    onComplete?: (config: PortalConfig) => void;
    onCancel?: () => void;
    onQuit?: () => void;
    getCurrentStepNumber: () => number;
    colors: ThemeColors;
    focusArea: "body" | "footer";
    onFocusChange: (area: "body" | "footer") => void;
    selectedIndex: number;
    setSelectedIndex: (index: number) => void;
    confirmSelection: (opt: WizardOption) => void;
    getOptions: () => WizardOption[];

    // Auth specific
    isAuthLoading?: boolean;
    authStatus?: string | null;
    setAuthStatus?: (status: string | null) => void;
    handleAuth?: () => Promise<void>;
    handleGdriveAuth?: (clientId: string, clientSecret: string) => Promise<void>;
    startGenericAuth?: (provider: string) => Promise<void>;
    dispatchDirectAuth?: (provider: PortalProvider) => void;

    // Inputs
    wizardInputs: Record<string, string>;
    updateInput: (key: string, value: string, ref: { current: string }) => void;
    refs: Record<string, { current: string } | undefined>;

    // Step-specific state (optional)
    isShortcutMissing?: boolean;
    copyparty_config_index?: number;
    set_copyparty_config_index?: (index: number) => void;
    direct_entry_index?: number;
    set_direct_entry_index?: (index: number) => void;
    wizardContext?: "source" | "dest" | null;
    pendingSourceProvider?: PortalProvider;
    pendingBackupProvider?: PortalProvider;
    fontVersion?: number;
    step?: Step;
    provider?: PortalProvider;

    // Rclone / remote management
    updateGenericRemote?: (remote: string, provider: PortalProvider, body: Record<string, string>) => void;
    updateGdriveRemote?: (remote: string, clientId: string, secret: string, refreshToken: string) => void;
    authorizeRemote?: (provider: string, signal?: AbortSignal) => Promise<string>;
}
