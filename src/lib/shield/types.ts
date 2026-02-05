/**
 * Represents the structure of the Shield Manifest file.
 * This is the single source of truth for files approved for backup.
 */
export interface ShieldManifest {
    generatedAt: string; // ISO Date
    version: string;     // e.g., "2.0.0"
    policy: "purge" | "isolate";
    files: string[];     // Relative paths, sorted alphabetically
}

/**
 * Result of diffing two manifests.
 */
export interface ManifestDiff {
    added: string[];
    removed: string[];
    totalCount: number;
}
