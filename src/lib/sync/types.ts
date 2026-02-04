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
    policyMode: "purge" | "isolate";
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

export interface SyncProgress {
    phase: "pull" | "clean" | "cloud" | "done" | "error";
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
    cloudStats?: CloudSyncStats;
    transferSlots?: { active: number; total: number };
}
