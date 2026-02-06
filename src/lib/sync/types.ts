/**
 * Represents an individual file being transferred during sync operations.
 */
export interface FileTransferItem {
    filename: string;
    size: number;
    transferred: number;
    percentage: number;
    speed: string;
    status: "queued" | "active" | "completed" | "failed";
    eta?: string;
    completedAt?: number;
}

/**
 * Statistics regarding the manifest analysis phase.
 */
export interface ManifestStats {
    remoteFileCount: number;
    localFileCount: number;
    missingFileCount: number;
    riskyFileCount?: number;
    optimizationMode: "manifest" | "full";
    manifestSource?: "source" | "backup" | "none";
}

/**
 * Statistics for the malware shield cleanup operation.
 */
export interface CleanupStats {
    phase?: "clean";
    totalArchives: number;
    scannedArchives: number;
    currentArchive?: string;
    currentArchiveSize?: number;
    safePatternCount: number;
    riskyPatternCount: number;
    cleanArchives: number;
    flaggedArchives: number;
    extractedFiles: number;
    purgedFiles: number;
    isolatedFiles: number;
    extractedFilePaths?: string[]; // NEW: Track actual extracted files
    executionContext?: "risky_sweep" | "realtime_clean" | "final_sweep";
    policyMode: "purge" | "isolate";

    // NEW HARDENING FIELDS
    invalidListingArchives?: number;      // Archives with failed/empty listings
    nestedArchivesFound?: number;         // Nested archives discovered inside risky archives
    nestedArchivesCleaned?: number;       // Nested archives that were cleaned
    totalStandaloneFiles?: number;        // Total standalone files scanned
    scannedStandaloneFiles?: number;      // Standalone files scanned so far
    flaggedStandaloneFiles?: number;      // Standalone files flagged as malicious
    currentStandaloneFile?: string;       // Currently scanning standalone file
}

/**
 * Summary statistics for cloud sync operations.
 */
export interface CloudSyncStats {
    newFiles: number;
    updatedFiles: number;
    deletedFiles: number;
    provider?: string;
    trashEnabled?: boolean;
}

/**
 * Statistics for the cloud manifest progress.
 */
export interface CloudManifestStats {
    totalFiles: number;
    uploadedFiles: number;
    pendingFiles: number;
}

export interface SyncProgress {
    phase: "pull" | "clean" | "cloud" | "syncing" | "done" | "error";
    description: string;
    percentage: number;
    globalPercentage?: number;
    transferSpeed?: string;
    eta?: string;
    filesTransferred?: number;
    totalFiles?: number;
    bytesTransferred?: string;
    rawBytesTransferred?: number;
    rawTotalBytes?: number;
    errorCount?: number;
    isPaused?: boolean;
    manifestStats?: ManifestStats;
    downloadQueue?: FileTransferItem[];
    uploadQueue?: FileTransferItem[];
    cleanupStats?: CleanupStats;
    downloadStats?: {
        transferSpeed?: string;
        eta?: string;
        bytesTransferred?: string;
        rawBytesTransferred?: number;
        rawTotalBytes?: number;
    };
    uploadStats?: {
        transferSpeed?: string;
        eta?: string;
        bytesTransferred?: string;
        rawBytesTransferred?: number;
        rawTotalBytes?: number;
    };
    cloudStats?: CloudSyncStats;
    cloudManifestStats?: CloudManifestStats;
    transferSlots?: { active: number; total: number };
    manifestInfo?: {
        generatedAt: string;
        fileCount: number;
        policy: "purge" | "isolate";
    };
}
