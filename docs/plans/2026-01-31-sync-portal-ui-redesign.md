# SyncPortal UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform SyncPortal from "progress bar with tiny panels" into "panel-dominant responsive UI" where each sync phase gets a prominent, full-featured panel.

**Architecture:** Three dedicated panel components (`DownsyncPanel`, `LocalShieldPanel`, `UpsyncPanel`) replace the redundant `PipelineStatus` and `GlobalProgress`. Layout switches between horizontal (wide terminals) and vertical (narrow terminals) using `useTerminalDimensions()`. Active phase panel expands via `flexGrow`.

**Tech Stack:** React, OpenTUI (@opentui/react), TypeScript, Bun

---

## Task 1: Fix Data Pipeline Persistence

**Files:**
- Modify: `src/lib/sync.ts:165-220`

**Step 1: Add queue persistence variables**

In `runSync()`, before the main sync logic, add:

```typescript
// Add after line 168 (after currentManifestStats declaration)
let currentDownloadQueue: FileTransferItem[] = [];
let currentUploadQueue: FileTransferItem[] = [];
```

**Step 2: Update executeRclone callback for downloads**

Replace the download phase `executeRclone` call (around line 190) to persist queue:

```typescript
await executeRclone(pullArgs, (stats) => {
    // Persist download queue from stats
    if (stats.downloadQueue && stats.downloadQueue.length > 0) {
        currentDownloadQueue = stats.downloadQueue;
    }
    onProgress({
        phase: "pull",
        description: "Downloading...",
        percentage: stats.percentage ?? 0,
        manifestStats: currentManifestStats,
        downloadQueue: currentDownloadQueue.length > 0 ? currentDownloadQueue : stats.downloadQueue,
        ...stats
    });
}, "download");
```

**Step 3: Update executeRclone callback for uploads**

Similarly for upload phase (around line 210):

```typescript
await executeRclone(pushArgs, (stats) => {
    // Persist upload queue from stats
    if (stats.uploadQueue && stats.uploadQueue.length > 0) {
        currentUploadQueue = stats.uploadQueue;
    }
    onProgress({
        phase: "cloud",
        description: "Uploading to cloud...",
        percentage: stats.percentage ?? 0,
        uploadQueue: currentUploadQueue.length > 0 ? currentUploadQueue : stats.uploadQueue,
        ...stats
    });
}, "upload");
```

**Step 4: Run lint to verify**

Run: `bun run lint`
Expected: PASS with no new warnings

**Step 5: Commit**

```bash
git add src/lib/sync.ts
git commit -m "fix(sync): persist download/upload queues across progress updates"
```

---

## Task 2: Create PanelHeader Component

**Files:**
- Modify: `src/components/SyncPortalParts.tsx:1-20`

**Step 1: Add PanelHeader interface**

After the existing imports (around line 7), add:

```typescript
// --- PANEL HEADER ---
interface PanelHeaderProps {
    title: string;
    status: "active" | "idle" | "complete" | "waiting";
    percentage?: number;
    accentColor: string;
    colors: ThemeColors;
    isExpanded: boolean;
}
```

**Step 2: Create PanelHeader component**

After the interface, add:

```typescript
export const PanelHeader = React.memo(({ title, status, percentage, accentColor, colors, isExpanded }: PanelHeaderProps) => {
    const icon = status === "active" ? "▼" : "►";
    const statusColor = status === "active" ? accentColor : 
                        status === "complete" ? colors.success : 
                        colors.dim;
    
    // Compact progress bar (20 chars)
    const barWidth = 20;
    const filled = percentage ? Math.round((percentage / 100) * barWidth) : 0;
    const empty = barWidth - filled;
    const progressBar = status === "active" && percentage !== undefined
        ? ` [${"━".repeat(filled)}${"─".repeat(empty)}] ${percentage}%`
        : "";

    return (
        <box flexDirection="row" justifyContent="space-between" width="100%">
            <text fg={statusColor} attributes={TextAttributes.BOLD}>
                {icon} {title}{progressBar}
            </text>
            {status === "complete" && (
                <text fg={colors.success}>✓</text>
            )}
            {status === "waiting" && (
                <text fg={colors.dim}>(waiting)</text>
            )}
        </box>
    );
});
PanelHeader.displayName = "PanelHeader";
```

**Step 3: Export component**

Ensure it's exported (it's a named export, so it's already exportable).

**Step 4: Run lint**

Run: `bun run lint`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/SyncPortalParts.tsx
git commit -m "feat(ui): add PanelHeader component with inline progress bar"
```

---

## Task 3: Create FileQueue Component

**Files:**
- Modify: `src/components/SyncPortalParts.tsx`

**Step 1: Add FileQueue interface**

```typescript
// --- FILE QUEUE ---
interface FileQueueProps {
    queue: FileTransferItem[];
    maxItems: number;
    width: number;
    accentColor: string;
    colors: ThemeColors;
}
```

**Step 2: Create FileQueue component**

```typescript
export const FileQueue = React.memo(({ queue, maxItems, width, accentColor, colors }: FileQueueProps) => {
    // Truncation logic based on terminal width
    const maxNameLen = Math.max(20, width - 45);
    const displayQueue = queue.slice(0, maxItems);
    const remaining = queue.length - maxItems;

    return (
        <box flexDirection="column" width="100%">
            {displayQueue.map((file, idx) => {
                const safeName = file.filename.length > maxNameLen
                    ? "..." + file.filename.slice(-(maxNameLen - 3))
                    : file.filename;

                const barLen = 15;
                const filled = Math.round((file.percentage / 100) * barLen);
                const empty = barLen - filled;
                const barStr = "█".repeat(filled) + "░".repeat(empty);

                return (
                    <box key={idx} flexDirection="row" justifyContent="space-between" width="100%">
                        <text fg={colors.fg} width={maxNameLen}>{safeName}</text>
                        <box flexDirection="row" gap={1}>
                            <text fg={file.status === "failed" ? colors.danger : accentColor}>[{barStr}]</text>
                            <text fg={colors.fg} width={4}>{file.percentage}%</text>
                            <text fg={colors.dim}>{file.speed || ""}</text>
                        </box>
                    </box>
                );
            })}
            {remaining > 0 && (
                <text fg={colors.dim}>...+{remaining} more</text>
            )}
        </box>
    );
});
FileQueue.displayName = "FileQueue";
```

**Step 3: Run lint**

Run: `bun run lint`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/SyncPortalParts.tsx
git commit -m "feat(ui): add FileQueue component with dynamic truncation"
```

---

## Task 4: Create DownsyncPanel Component

**Files:**
- Modify: `src/components/SyncPortalParts.tsx`

**Step 1: Add DownsyncPanel interface**

```typescript
// --- DOWNSYNC PANEL ---
interface DownsyncPanelProps {
    progress: SyncProgress;
    sourceType: string;
    colors: ThemeColors;
    width: number;
    height: number;
    isExpanded: boolean;
}
```

**Step 2: Create DownsyncPanel component**

```typescript
export const DownsyncPanel = React.memo(({ progress, sourceType, colors, width, height, isExpanded }: DownsyncPanelProps) => {
    const isPull = progress.phase === "pull";
    const isDone = progress.phase === "done" || progress.phase === "clean" || progress.phase === "cloud";
    
    const status = isPull ? "active" : isDone ? "complete" : "waiting";
    const accentColor = colors.primary;
    
    // Calculate max files based on available height
    const maxFiles = isExpanded ? Math.max(3, Math.floor((height - 8) / 1)) : 0;

    if (!isExpanded) {
        return (
            <box border borderStyle="single" borderColor={colors.dim} padding={1}>
                <PanelHeader
                    title={`DOWNSYNC: ${sourceType}`}
                    status={status}
                    percentage={isPull ? progress.percentage : undefined}
                    accentColor={accentColor}
                    colors={colors}
                    isExpanded={false}
                />
            </box>
        );
    }

    return (
        <box flexDirection="column" border borderStyle={isPull ? "double" : "single"} borderColor={isPull ? accentColor : colors.dim} padding={1} flexGrow={2}>
            <PanelHeader
                title={`DOWNSYNC: ${sourceType}`}
                status={status}
                percentage={progress.percentage}
                accentColor={accentColor}
                colors={colors}
                isExpanded={true}
            />
            
            {progress.manifestStats && (
                <box flexDirection="row" gap={2} marginTop={1}>
                    <text fg={colors.fg}>Remote: {progress.manifestStats.remoteFileCount}</text>
                    <text fg={colors.fg}>Local: {progress.manifestStats.localFileCount}</text>
                    <text fg={accentColor}>Missing: {progress.manifestStats.missingFileCount}</text>
                </box>
            )}

            {progress.downloadQueue && progress.downloadQueue.length > 0 && (
                <box marginTop={1} flexGrow={1}>
                    <FileQueue
                        queue={progress.downloadQueue}
                        maxItems={maxFiles}
                        width={width}
                        accentColor={accentColor}
                        colors={colors}
                    />
                </box>
            )}

            <box flexDirection="row" gap={2} marginTop={1}>
                {progress.transferSpeed && <text fg={colors.dim}>Speed: {progress.transferSpeed}</text>}
                {progress.eta && <text fg={colors.dim}>ETA: {progress.eta}</text>}
                {progress.filesTransferred !== undefined && (
                    <text fg={colors.dim}>Files: {progress.filesTransferred}/{progress.totalFiles || "?"}</text>
                )}
                {!!progress.errorCount && <text fg={colors.danger}>Errors: {progress.errorCount}</text>}
            </box>
        </box>
    );
});
DownsyncPanel.displayName = "DownsyncPanel";
```

**Step 3: Run lint**

Run: `bun run lint`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/SyncPortalParts.tsx
git commit -m "feat(ui): add DownsyncPanel component with manifest stats and file queue"
```

---

## Task 5: Create LocalShieldPanel Component

**Files:**
- Modify: `src/components/SyncPortalParts.tsx`

**Step 1: Add LocalShieldPanel interface**

```typescript
// --- LOCAL SHIELD PANEL ---
interface LocalShieldPanelProps {
    progress: SyncProgress;
    colors: ThemeColors;
    width: number;
    height: number;
    isExpanded: boolean;
}
```

**Step 2: Create LocalShieldPanel component**

```typescript
export const LocalShieldPanel = React.memo(({ progress, colors, width, height, isExpanded }: LocalShieldPanelProps) => {
    const isClean = progress.phase === "clean";
    const isDone = progress.phase === "done" || progress.phase === "cloud";
    const isWaiting = progress.phase === "pull";
    
    const status = isClean ? "active" : isDone ? "complete" : isWaiting ? "waiting" : "idle";
    const accentColor = colors.setup;

    if (!isExpanded) {
        return (
            <box border borderStyle="single" borderColor={colors.dim} padding={1}>
                <PanelHeader
                    title="LOCAL SHIELD"
                    status={status}
                    percentage={isClean && progress.cleanupStats ? Math.round((progress.cleanupStats.scannedArchives / progress.cleanupStats.totalArchives) * 100) : undefined}
                    accentColor={accentColor}
                    colors={colors}
                    isExpanded={false}
                />
            </box>
        );
    }

    const stats = progress.cleanupStats;

    return (
        <box flexDirection="column" border borderStyle={isClean ? "double" : "single"} borderColor={isClean ? accentColor : colors.dim} padding={1} flexGrow={2}>
            <PanelHeader
                title="LOCAL SHIELD"
                status={status}
                percentage={stats ? Math.round((stats.scannedArchives / Math.max(1, stats.totalArchives)) * 100) : undefined}
                accentColor={accentColor}
                colors={colors}
                isExpanded={true}
            />

            {stats && (
                <box flexDirection="column" marginTop={1} flexGrow={1}>
                    <box flexDirection="row" gap={2}>
                        <text fg={colors.dim}>Mode: {stats.policyMode.toUpperCase()}</text>
                        <text fg={colors.dim}>Archives: {stats.scannedArchives}/{stats.totalArchives}</text>
                    </box>

                    {stats.currentArchive && (
                        <box marginTop={1}>
                            <text fg={colors.fg}>
                                Scanning: {stats.currentArchive.length > 50 ? "..." + stats.currentArchive.slice(-47) : stats.currentArchive}
                            </text>
                        </box>
                    )}

                    <box flexDirection="row" gap={3} marginTop={1}>
                        <text fg={colors.success}>Clean: {stats.cleanArchives}</text>
                        <text fg={colors.danger}>Flagged: {stats.flaggedArchives}</text>
                    </box>

                    <box flexDirection="row" gap={2} marginTop={1}>
                        {stats.extractedFiles > 0 && <text fg={colors.success}>Extracted: {stats.extractedFiles}</text>}
                        {stats.purgedFiles > 0 && <text fg={colors.danger}>Purged: {stats.purgedFiles}</text>}
                        {stats.isolatedFiles > 0 && <text fg={colors.accent}>Isolated: {stats.isolatedFiles}</text>}
                    </box>
                </box>
            )}

            {!stats && status === "waiting" && (
                <box marginTop={1}>
                    <text fg={colors.dim}>Waiting for download to complete...</text>
                </box>
            )}
        </box>
    );
});
LocalShieldPanel.displayName = "LocalShieldPanel";
```

**Step 3: Run lint**

Run: `bun run lint`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/SyncPortalParts.tsx
git commit -m "feat(ui): add LocalShieldPanel component with scan progress and detection stats"
```

---

## Task 6: Create UpsyncPanel Component

**Files:**
- Modify: `src/components/SyncPortalParts.tsx`

**Step 1: Add UpsyncPanel interface**

```typescript
// --- UPSYNC PANEL ---
interface UpsyncPanelProps {
    progress: SyncProgress;
    destType: string;
    colors: ThemeColors;
    width: number;
    height: number;
    isExpanded: boolean;
}
```

**Step 2: Create UpsyncPanel component**

```typescript
export const UpsyncPanel = React.memo(({ progress, destType, colors, width, height, isExpanded }: UpsyncPanelProps) => {
    const isCloud = progress.phase === "cloud";
    const isDone = progress.phase === "done";
    const isWaiting = progress.phase === "pull" || progress.phase === "clean";
    
    const status = isCloud ? "active" : isDone ? "complete" : isWaiting ? "waiting" : "idle";
    const accentColor = colors.accent;
    
    const maxFiles = isExpanded ? Math.max(3, Math.floor((height - 8) / 1)) : 0;

    if (!isExpanded) {
        return (
            <box border borderStyle="single" borderColor={colors.dim} padding={1}>
                <PanelHeader
                    title={`UPSYNC: ${destType}`}
                    status={status}
                    percentage={isCloud ? progress.percentage : undefined}
                    accentColor={accentColor}
                    colors={colors}
                    isExpanded={false}
                />
            </box>
        );
    }

    return (
        <box flexDirection="column" border borderStyle={isCloud ? "double" : "single"} borderColor={isCloud ? accentColor : colors.dim} padding={1} flexGrow={2}>
            <PanelHeader
                title={`UPSYNC: ${destType}`}
                status={status}
                percentage={progress.percentage}
                accentColor={accentColor}
                colors={colors}
                isExpanded={true}
            />

            {progress.cloudStats && (
                <box flexDirection="row" gap={2} marginTop={1}>
                    <text fg={colors.success}>New: {progress.cloudStats.newFiles}</text>
                    <text fg={colors.primary}>Updated: {progress.cloudStats.updatedFiles}</text>
                    <text fg={colors.danger}>Deleted: {progress.cloudStats.deletedFiles}</text>
                </box>
            )}

            {progress.uploadQueue && progress.uploadQueue.length > 0 && (
                <box marginTop={1} flexGrow={1}>
                    <FileQueue
                        queue={progress.uploadQueue}
                        maxItems={maxFiles}
                        width={width}
                        accentColor={accentColor}
                        colors={colors}
                    />
                </box>
            )}

            <box flexDirection="row" gap={2} marginTop={1}>
                {progress.transferSpeed && <text fg={colors.dim}>Speed: {progress.transferSpeed}</text>}
                {progress.eta && <text fg={colors.dim}>ETA: {progress.eta}</text>}
                {progress.filesTransferred !== undefined && (
                    <text fg={colors.dim}>Files: {progress.filesTransferred}/{progress.totalFiles || "?"}</text>
                )}
            </box>

            {!progress.uploadQueue && status === "waiting" && (
                <box marginTop={1}>
                    <text fg={colors.dim}>Waiting for shield scan to complete...</text>
                </box>
            )}
        </box>
    );
});
UpsyncPanel.displayName = "UpsyncPanel";
```

**Step 3: Run lint**

Run: `bun run lint`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/SyncPortalParts.tsx
git commit -m "feat(ui): add UpsyncPanel component with cloud stats and file queue"
```

---

## Task 7: Refactor SyncPortal Main Layout

**Files:**
- Modify: `src/components/SyncPortal.tsx`

**Step 1: Update imports**

Replace the import from SyncPortalParts:

```typescript
import { PanelHeader, FileQueue, DownsyncPanel, LocalShieldPanel, UpsyncPanel } from "./SyncPortalParts";
```

**Step 2: Add responsive layout logic**

After the existing terminal dimension check, add:

```typescript
// Responsive layout
const isWideScreen = width >= 100;
const layoutDirection = isWideScreen ? "row" : "column";

// Determine which panel is expanded
const getIsExpanded = (panelPhase: "pull" | "clean" | "cloud") => {
    if (isWideScreen) return true; // All panels visible in wide mode
    return progress.phase === panelPhase; // Only active panel expanded in narrow mode
};
```

**Step 3: Replace main render content**

Replace everything between the terminal size warning and actions with:

```tsx
{/* === RESPONSIVE PANEL LAYOUT === */}
<box flexDirection={layoutDirection as any} flexGrow={1} gap={1} width="100%">
    
    {/* Downsync Panel */}
    {(config.source_provider !== "none") && (
        <DownsyncPanel
            progress={progress}
            sourceType={sourceType}
            colors={colors}
            width={isWideScreen ? Math.floor(width / 3) : width}
            height={isWideScreen ? height - 6 : Math.floor((height - 6) / 3)}
            isExpanded={getIsExpanded("pull")}
        />
    )}

    {/* Local Shield Panel */}
    <LocalShieldPanel
        progress={progress}
        colors={colors}
        width={isWideScreen ? Math.floor(width / 3) : width}
        height={isWideScreen ? height - 6 : Math.floor((height - 6) / 3)}
        isExpanded={getIsExpanded("clean")}
    />

    {/* Upsync Panel */}
    {(config.upsync_enabled && config.backup_provider !== "none") && (
        <UpsyncPanel
            progress={progress}
            destType={destType}
            colors={colors}
            width={isWideScreen ? Math.floor(width / 3) : width}
            height={isWideScreen ? height - 6 : Math.floor((height - 6) / 3)}
            isExpanded={getIsExpanded("cloud")}
        />
    )}

</box>
```

**Step 4: Remove unused imports and components**

Delete or comment out:
- `PipelineStatus` - no longer used
- `GlobalProgress` - no longer used
- `ManifestDetails` - now integrated into DownsyncPanel
- `ActiveTransfers` - replaced by FileQueue
- `CleanupDetails` - now integrated into LocalShieldPanel
- `CloudStatsHeader` - now integrated into UpsyncPanel

**Step 5: Remove unused variables**

Delete:
- `barColor` useMemo
- `isPull`, `isClean`, `isCloud`, `isError`, `isDone` (if not used in actions)

**Step 6: Run lint**

Run: `bun run lint`
Expected: PASS

**Step 7: Commit**

```bash
git add src/components/SyncPortal.tsx src/components/SyncPortalParts.tsx
git commit -m "refactor(ui): replace pipeline/global progress with responsive panel layout"
```

---

## Task 8: Cleanup Unused Components

**Files:**
- Modify: `src/components/SyncPortalParts.tsx`

**Step 1: Delete unused components**

Remove:
- `PipelineStatus` component and interface
- `GlobalProgress` component and interface
- `ManifestDetails` component and interface (now in DownsyncPanel)
- `ActiveTransfers` component and interface (replaced by FileQueue)
- `CleanupDetails` component and interface (now in LocalShieldPanel)
- `CloudStatsHeader` component and interface (now in UpsyncPanel)

**Step 2: Run lint**

Run: `bun run lint`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/SyncPortalParts.tsx
git commit -m "chore(cleanup): remove deprecated panel components"
```

---

## Task 9: Verification

**Step 1: Run comprehensive lint**

Run: `bun run lint`
Expected: PASS with no warnings

**Step 2: Test narrow terminal (80x24)**

- Start the app in an 80x24 terminal
- Verify vertical layout (panels stacked)
- Verify active panel is expanded, others collapsed
- Verify file queue shows files

**Step 3: Test wide terminal (120x30)**

- Resize terminal to 120x30
- Verify horizontal layout (panels side-by-side)
- Verify all panels are visible
- Verify file queue in each active panel

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(sync-portal): complete panel-first responsive UI redesign"
```

---

## Execution Handoff

**Plan complete and saved to `docs/plans/2026-01-31-sync-portal-ui-redesign.md`.**

**Two execution options:**

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

2. **Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
