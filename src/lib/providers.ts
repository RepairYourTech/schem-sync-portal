import type { PortalProvider } from "./config";
import type { WizardAuthContext } from "../components/wizard/types";

export interface ProviderMetadata {
    id: PortalProvider;
    label: string;
    icon: string;
    iconV3: string;
    description: string;
    pros?: string;
    cons?: string;
    hasGuidedPath: boolean;
    hasDirectPath: boolean;
    steps: string[]; // Steps for the guided path
    directAuthHandler?: (ctx: WizardAuthContext) => void;
}


import {
    gdriveDirectAuth,
    b2DirectAuth,
    sftpDirectAuth,
    pcloudDirectAuth,
    megaDirectAuth,
    r2DirectAuth,
    s3DirectAuth,
    genericAuthHandler
} from "./providerHandlers";

export const PROVIDER_REGISTRY: Record<PortalProvider, ProviderMetadata> = {
    copyparty: {
        id: "copyparty",
        label: "CopyParty",
        icon: "\uf1c0", // Database
        iconV3: "\uf012c", // Server
        description: "Standard HTTP/WebDAV server.",
        hasGuidedPath: false,
        hasDirectPath: true,
        steps: ["copyparty_config"]
    },
    gdrive: {
        id: "gdrive",
        label: "Google Drive",
        icon: "\uf1a0", // Google
        iconV3: "\uf01a0", // Drive
        description: "Official Google Cloud storage.",
        pros: "Free tier, easy setup.",
        cons: "Requires Google Cloud Project.",
        hasGuidedPath: true,
        hasDirectPath: true,
        steps: ["gdrive_intro", "gdrive_guide_1", "gdrive_guide_2", "gdrive_guide_3", "gdrive_guide_4"],
        directAuthHandler: gdriveDirectAuth
    },
    b2: {
        id: "b2",
        label: "Backblaze B2",
        icon: "\uf1c0",
        iconV3: "\uf012c",
        description: "High-performance S3 alternative.",
        pros: "Extremely cheap storage.",
        cons: "Egress fees apply.",
        hasGuidedPath: true,
        hasDirectPath: true,
        steps: ["b2_intro", "b2_guide_1", "b2_guide_2"],
        directAuthHandler: b2DirectAuth
    },
    sftp: {
        id: "sftp",
        label: "SFTP / SSH",
        icon: "\uf121", // Code/Terminal
        iconV3: "\uf0474", // SSH
        description: "Self-hosted secure shell transfer.",
        pros: "Maximum privacy/control.",
        cons: "You manage the server.",
        hasGuidedPath: true,
        hasDirectPath: true,
        steps: ["sftp_intro", "sftp_guide_1"],
        directAuthHandler: sftpDirectAuth
    },
    pcloud: {
        id: "pcloud",
        label: "pCloud",
        icon: "\uf0c2", // Cloud
        iconV3: "\uf0c2",
        description: "Encrypted 유럽 cloud storage.",
        hasGuidedPath: true,
        hasDirectPath: true,
        steps: ["pcloud_intro", "pcloud_guide_1"],
        directAuthHandler: pcloudDirectAuth
    },
    onedrive: {
        id: "onedrive",
        label: "OneDrive",
        icon: "\uf0c2",
        iconV3: "\uf0c2",
        description: "Microsoft cloud integration.",
        hasGuidedPath: true,
        hasDirectPath: true,
        steps: ["onedrive_intro", "onedrive_guide_1", "onedrive_guide_2"],
        directAuthHandler: genericAuthHandler("onedrive")
    },
    dropbox: {
        id: "dropbox",
        label: "Dropbox",
        icon: "\uf16b",
        iconV3: "\uf16b",
        description: "Seamless file sync.",
        hasGuidedPath: true,
        hasDirectPath: true,
        steps: ["dropbox_intro", "dropbox_guide_1", "dropbox_guide_2"],
        directAuthHandler: genericAuthHandler("dropbox")
    },
    mega: {
        id: "mega",
        label: "MEGA.nz",
        icon: "\uf023", // Lock
        iconV3: "\uf023",
        description: "End-to-end encrypted storage.",
        hasGuidedPath: true,
        hasDirectPath: true,
        steps: ["mega_intro", "mega_guide_1"],
        directAuthHandler: megaDirectAuth
    },
    r2: {
        id: "r2",
        label: "Cloudflare R2",
        icon: "\uf1cb", // S3
        iconV3: "\uf1cb",
        description: "Zero egress fee S3 storage.",
        hasGuidedPath: true,
        hasDirectPath: true,
        steps: ["r2_intro", "r2_guide_1", "r2_guide_2"],
        directAuthHandler: r2DirectAuth
    },

    s3: {
        id: "s3",
        label: "Amazon S3 / Generic",
        icon: "\uf1cb",
        iconV3: "\uf1cb",
        description: "Standard object storage.",
        hasGuidedPath: true,
        hasDirectPath: true,
        steps: ["s3_intro", "s3_guide_1", "s3_guide_2"],
        directAuthHandler: s3DirectAuth
    },

    none: {
        id: "none",
        label: "Not Configured",
        icon: " ",
        iconV3: " ",
        description: "No provider selected.",
        hasGuidedPath: false,
        hasDirectPath: false,
        steps: []
    },
    unconfigured: {
        id: "unconfigured",
        label: "Unconfigured",
        icon: " ",
        iconV3: " ",
        description: "Awaiting setup.",
        hasGuidedPath: false,
        hasDirectPath: false,
        steps: []
    }
};

export function getProviderMetadata(id: PortalProvider): ProviderMetadata {
    return PROVIDER_REGISTRY[id] || PROVIDER_REGISTRY.none;
}
