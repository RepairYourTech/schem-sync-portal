/**
 * Mock data generator for testing SyncPortal UI without running rclone.
 * Simulates realistic file transfer progress for development and testing.
 */

import type { SyncProgress, FileTransferItem, ManifestStats, CleanupStats, CloudSyncStats } from "./sync";

// Sample file names for realistic mock data
const MOCK_FILENAMES = [
    "MAME/roms/pacman.zip",
    "MAME/roms/galaga.zip",
    "MAME/roms/donkeykong.zip",
    "MAME/roms/1942.zip",
    "MAME/roms/asteroids.zip",
    "MAME/roms/centipede.zip",
    "MAME/roms/defender.zip",
    "MAME/roms/frogger.zip",
    "MAME/roms/joust.zip",
    "MAME/roms/qbert.zip",
    "MAME/roms/robotron.zip",
    "MAME/roms/stargate.zip",
    "MAME/roms/tempest.zip",
    "MAME/roms/zaxxon.zip",
    "MAME/roms/digdug.zip",
    "MAME/roms/mspacman.zip",
    "MAME/roms/galaxian.zip",
    "MAME/extras/artwork/pacman.png",
    "MAME/extras/artwork/galaga.png",
    "Systems/PSX/games/crash_bandicoot.chd",
    "Systems/PSX/games/spyro.chd",
];

const MOCK_ARCHIVE_NAMES = [
    "MAME/roms/suspect_collection.zip",
    "MAME/roms/arcade_classics.7z",
    "Systems/PSX/roms/games.rar",
    "Extras/artwork_pack.zip",
    "Extras/manuals.7z",
];

interface MockState {
    phase: SyncProgress["phase"];
    tick: number;
    fileProgress: Map<string, number>;
    completedFiles: Set<string>;
    scannedArchives: number;
}

let mockState: MockState | null = null;

/**
 * Initialize mock sync state
 */
export function initMockSync(): void {
    mockState = {
        phase: "pull",
        tick: 0,
        fileProgress: new Map(),
        completedFiles: new Set(),
        scannedArchives: 0,
    };
}

/**
 * Generate next mock progress update.
 * Call this on an interval (e.g., every 200ms) to simulate sync progress.
 */
export function getMockProgress(): SyncProgress | null {
    if (!mockState) return null;

    mockState.tick++;
    const tick = mockState.tick;

    // Pull phase: 0-100 ticks
    if (mockState.phase === "pull") {
        const pullProgress = Math.min(100, tick);
        const activeFileCount = 4;
        const downloadQueue: FileTransferItem[] = [];

        // Simulate multiple concurrent downloads
        for (let i = 0; i < activeFileCount; i++) {
            const fileIdx = (Math.floor(tick / 25) + i) % MOCK_FILENAMES.length;
            const filename = MOCK_FILENAMES[fileIdx]!;
            const fileProgress = Math.min(100, ((tick * 3) + (i * 20)) % 120);

            if (fileProgress >= 100) {
                mockState.completedFiles.add(filename);
            }

            downloadQueue.push({
                filename,
                size: 1024 * 1024 * (10 + Math.random() * 50),
                transferred: Math.floor((fileProgress / 100) * 1024 * 1024 * 30),
                percentage: Math.min(100, fileProgress),
                speed: `${(2 + Math.random() * 5).toFixed(1)} MB/s`,
                status: fileProgress >= 100 ? "completed" : "active",
                eta: fileProgress >= 100 ? undefined : `${Math.floor((100 - fileProgress) / 10)}s`,
            });
        }

        const manifestStats: ManifestStats = {
            remoteFileCount: 150,
            localFileCount: 120 + mockState.completedFiles.size,
            missingFileCount: Math.max(0, 30 - mockState.completedFiles.size),
            optimizationMode: "manifest",
            manifestSource: "source",
        };

        if (pullProgress >= 100) {
            mockState.phase = "clean";
            mockState.tick = 0;
        }

        return {
            phase: "pull",
            description: "Downloading from remote...",
            percentage: pullProgress,
            transferSpeed: `${(3 + Math.random() * 4).toFixed(1)} MB/s`,
            eta: `${Math.max(0, Math.floor((100 - pullProgress) / 5))}s`,
            filesTransferred: mockState.completedFiles.size,
            totalFiles: 30,
            manifestStats,
            downloadQueue,
            transferSlots: { active: activeFileCount, total: 8 },
        };
    }

    // Clean phase: 0-50 ticks
    if (mockState.phase === "clean") {
        const cleanProgress = Math.min(100, tick * 2);
        mockState.scannedArchives = Math.floor(tick / 10);

        const cleanupStats: CleanupStats = {
            totalArchives: MOCK_ARCHIVE_NAMES.length,
            scannedArchives: Math.min(mockState.scannedArchives, MOCK_ARCHIVE_NAMES.length),
            currentArchive: MOCK_ARCHIVE_NAMES[Math.min(mockState.scannedArchives, MOCK_ARCHIVE_NAMES.length - 1)],
            currentArchiveSize: 1024 * 1024 * (5 + Math.random() * 20),
            safePatternCount: 12,
            riskyPatternCount: 2,
            cleanArchives: Math.max(0, mockState.scannedArchives - 1),
            flaggedArchives: mockState.scannedArchives > 2 ? 1 : 0,
            extractedFiles: mockState.scannedArchives * 15,
            purgedFiles: mockState.scannedArchives > 2 ? 3 : 0,
            isolatedFiles: 0,
            policyMode: "purge",
        };

        if (cleanProgress >= 100) {
            mockState.phase = "cloud";
            mockState.tick = 0;
            mockState.completedFiles.clear();
        }

        return {
            phase: "clean",
            description: "Scanning archives for malware...",
            percentage: cleanProgress,
            cleanupStats,
        };
    }

    // Cloud phase: 0-80 ticks
    if (mockState.phase === "cloud") {
        const cloudProgress = Math.min(100, Math.floor(tick * 1.25));
        const activeFileCount = 3;
        const uploadQueue: FileTransferItem[] = [];

        for (let i = 0; i < activeFileCount; i++) {
            const fileIdx = (Math.floor(tick / 30) + i) % MOCK_FILENAMES.length;
            const filename = MOCK_FILENAMES[fileIdx]!;
            const fileProgress = Math.min(100, ((tick * 2) + (i * 25)) % 125);

            if (fileProgress >= 100) {
                mockState.completedFiles.add(filename);
            }

            uploadQueue.push({
                filename,
                size: 1024 * 1024 * (10 + Math.random() * 50),
                transferred: Math.floor((fileProgress / 100) * 1024 * 1024 * 30),
                percentage: Math.min(100, fileProgress),
                speed: `${(1 + Math.random() * 3).toFixed(1)} MB/s`,
                status: fileProgress >= 100 ? "completed" : "active",
                eta: fileProgress >= 100 ? undefined : `${Math.floor((100 - fileProgress) / 8)}s`,
            });
        }

        const cloudStats: CloudSyncStats = {
            newFiles: Math.min(15, Math.floor(tick / 5)),
            updatedFiles: Math.min(8, Math.floor(tick / 8)),
            deletedFiles: 2,
            provider: "GDRIVE",
            trashEnabled: false,
        };

        if (cloudProgress >= 100) {
            mockState.phase = "done";
        }

        return {
            phase: "cloud",
            description: "Uploading to cloud backup...",
            percentage: cloudProgress,
            transferSpeed: `${(1.5 + Math.random() * 2).toFixed(1)} MB/s`,
            eta: `${Math.max(0, Math.floor((100 - cloudProgress) / 4))}s`,
            filesTransferred: mockState.completedFiles.size,
            totalFiles: 25,
            uploadQueue,
            cloudStats,
            transferSlots: { active: activeFileCount, total: 4 },
        };
    }

    // Done phase
    return {
        phase: "done",
        description: "MISSION ACCOMPLISHED. SYSTEM RESILIENT.",
        percentage: 100,
    };
}

/**
 * Reset mock state and stop simulation
 */
export function resetMockSync(): void {
    mockState = null;
}

/**
 * Check if mock sync is active
 */
export function isMockActive(): boolean {
    return mockState !== null;
}
