import type { PortalConfig, PortalProvider } from "../../lib/config.ts";

export interface WizardOption {
    name?: string;
    description?: string;
    value?: string | number | boolean | PortalProvider;
    key?: string;
    type?: string;
    action?: () => void;
}

export interface WizardKeyEvent {
    name: string;
    shift: boolean;
    ctrl: boolean;
    meta: boolean;
}

export interface WizardProps {
    onComplete: (config: PortalConfig) => void;
    onUpdate?: (config: PortalConfig) => void;
    onCancel: () => void;
    onQuit: () => void;
    initialConfig: PortalConfig;
    mode?: "continue" | "restart" | "edit";
    focusArea: "body" | "footer";
    onFocusChange: (area: "body" | "footer") => void;
    tabTransition?: "forward" | "backward" | null;
    backSignal: number;
}

export type Step =
    | "shortcut"
    | "source_choice"
    | "copyparty_config"
    | "dir" | "mirror"
    | "upsync_ask"
    | "dest_cloud_select"
    | "backup_dir"
    | "security"
    | "gdrive_intro" | "gdrive_guide_1" | "gdrive_guide_2" | "gdrive_guide_3" | "gdrive_guide_4"
    | "b2_intro" | "b2_guide_1" | "b2_guide_2"
    | "sftp_intro" | "sftp_guide_1"
    | "pcloud_intro" | "pcloud_guide_1"
    | "onedrive_intro" | "onedrive_guide_1" | "onedrive_guide_2"
    | "dropbox_intro" | "dropbox_guide_1" | "dropbox_guide_2"
    | "mega_intro" | "mega_guide_1"
    | "r2_intro" | "r2_guide_1" | "r2_guide_2"
    | "s3_intro" | "s3_guide_1" | "s3_guide_2"
    | "cloud_direct_entry"

    | "edit_menu"
    | "deploy";

export interface WizardAuthContext {
    wizardContext: "source" | "dest" | null;
    refs: {
        urlRef: React.RefObject<string>;
        userRef: React.RefObject<string>;
        passRef: React.RefObject<string>;
        clientIdRef: React.RefObject<string>;
        clientSecretRef: React.RefObject<string>;
        b2IdRef: React.RefObject<string>;
        b2KeyRef: React.RefObject<string>;
    };
    updateConfig: (fn: (prev: PortalConfig) => PortalConfig) => void;
    next: () => void;
    handleGdriveAuth: (clientId: string, clientSecret: string) => void;
    startGenericAuth: (provider: string) => void;
    updateGenericRemote: (remoteName: string, provider: PortalProvider, options: Record<string, string>) => void;
}
