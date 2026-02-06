import type { PortalProvider } from "./config";

/**
 * Maps a PortalProvider value to a user-friendly display name.
 */
export function getProviderDisplayName(provider: PortalProvider): string {
    const mapping: Record<PortalProvider, string> = {
        copyparty: "CopyParty",
        gdrive: "GDrive",
        b2: "Backblaze B2",
        pcloud: "pCloud",
        sftp: "SFTP",
        onedrive: "OneDrive",
        dropbox: "Dropbox",
        mega: "MEGA",
        r2: "Cloudflare R2",
        s3: "Amazon S3",
        none: "None",
        unconfigured: "Unconfigured"
    };

    return mapping[provider] || (provider.charAt(0).toUpperCase() + provider.slice(1));
}
