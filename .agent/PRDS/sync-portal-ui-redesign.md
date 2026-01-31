# SyncPortal UI Redesign - Panel-First Layout

## Executive Summary

Transform the SyncPortal from a "progress bar with small panels" into a "panel-dominant interface" where each sync phase (Downsync, Local Shield, Upsync) has its own prominent, responsive panel. Remove the redundant global progress elements that waste vertical space.

---

## Current State Analysis

### Layout Problems

```
Current Layout (Column, ~30 lines total):
┌──────────────────────────────────────────────────┐
│ ┌──────────┐  >>>  ┌──────────┐  >>>  ┌────────┐│  <- PipelineStatus (~8 lines)
│ │COPYPARTY │       │  LOCAL   │       │ GDRIVE ││     REDUNDANT: Phase shown in panels
│ │DOWNLOADING│       │  ACTIVE  │       │  Idle  ││
│ └──────────┘       └──────────┘       └────────┘│
├──────────────────────────────────────────────────┤
│         [████████████░░░░░░░░] 60%               │  <- GlobalProgress (~4 lines)
│         Files: 45/75 | Size: 120MB               │     REDUNDANT: Each panel has progress
├──────────────────────────────────────────────────┤
│ MANIFEST ANALYSIS (SOURCE)                       │  <- ManifestDetails (~2 lines) OK
│ Remote: 1247  Local: 1198  Missing: 49           │
├──────────────────────────────────────────────────┤
│ ACTIVE TRANSFERS                                 │  <- ActiveTransfers (~6 lines)
│   file1.brd [████░░] 40%                         │     TOO SMALL: Only 5 files shown
│   file2.zip [██░░░░] 20%                         │
│   file3.pdf [██████] 100%                        │
│   ...and 2 more                                  │
├──────────────────────────────────────────────────┤
│            [ Start Sync ]                        │  <- Actions (~3 lines)
└──────────────────────────────────────────────────┘
```

### Key Issues

| Component | Lines Used | Problem |
|-----------|------------|---------|
| `PipelineStatus` | ~8 | Wastes space showing boxes/arrows; phase already in panel header |
| `GlobalProgress` | ~4 | Wastes space with global bar; each panel has its own progress |
| `ActiveTransfers` | ~6 | Too small; only 5 files; no panel header/footer |

**Result:** In a 24-line terminal, only ~6 lines are available for the actual file queue after headers/footers.

---

## Proposed Design

### Layout Strategy

**Vertical Layout (width < 100 columns):**
```
┌───────────────────────────────────────────────────────────┐
│ ▼ DOWNSYNC: COPYPARTY                          [60%] ━━━━ │ <- Panel Header (1 line)
│   Remote: 1247 | Local: 1198 | Missing: 49                │ <- Stats (1 line)
│   ────────────────────────────────────────────────────    │
│   file1.brd                  [████████░░] 80%  1.2MB/s    │ <- Queue (10 files)
│   file2.zip                  [███░░░░░░░] 30%  2.8MB/s    │
│   file3.pdf                  [██████████] 100% ✓          │
│   file4.tvw                  [█░░░░░░░░░] 10%  3.5MB/s    │
│   ...                                                      │
│   Speed: 5.2 MB/s | ETA: 2m 15s | 45/49 files             │ <- Footer (1 line)
├───────────────────────────────────────────────────────────┤
│ ► LOCAL SHIELD (Idle)                                     │ <- Collapsed (1-2 lines)
├───────────────────────────────────────────────────────────┤
│ ► UPSYNC: GDRIVE (Idle)                                   │ <- Collapsed (1-2 lines)
├───────────────────────────────────────────────────────────┤
│ [Enter: Start Sync]                                       │ <- Actions (1 line)
└───────────────────────────────────────────────────────────┘
```

**Horizontal Layout (width >= 100 columns):**
```
┌──────────────────────────────┬──────────────────────────────┬──────────────────────────────┐
│ ▼ DOWNSYNC: COPYPARTY [60%]  │ ► LOCAL SHIELD               │ ► UPSYNC: GDRIVE             │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━  │                              │                              │
│ Remote: 1247 | Missing: 49   │ (Waiting for Downsync)       │ (Waiting for Shield)         │
│ ──────────────────────────── │                              │                              │
│ file1.brd      [████░] 80%   │                              │                              │
│ file2.zip      [██░░░] 30%   │                              │                              │
│ file3.pdf      [█████] 100%  │                              │                              │
│ file4.tvw      [█░░░░] 10%   │                              │                              │
│ file5.jpg      [███░░] 50%   │                              │                              │
│ file6.png      [████░] 75%   │                              │                              │
│ ...+4 more                   │                              │                              │
│ ──────────────────────────── │                              │                              │
│ 5.2 MB/s | ETA: 2m15s        │                              │                              │
├──────────────────────────────┴──────────────────────────────┴──────────────────────────────┤
│ [Enter: Start Sync]                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Responsive Behavior

```typescript
const { width, height } = useTerminalDimensions();

// Layout direction based on width
const isWideScreen = width >= 100;
const layoutDirection = isWideScreen ? "row" : "column";

// Panel sizing based on phase
const getFlexGrow = (panelPhase: string) => {
    if (panelPhase === progress.phase) return 2; // Active panel dominates
    return isWideScreen ? 1 : 0.5; // Inactive panels shrink
};

// File queue size based on available height
const maxFilesToShow = isWideScreen 
    ? Math.floor((height - 8) / 1)  // More space in horizontal mode
    : Math.floor((height - 16) / 3); // Less space when stacked
```

---

## Component Architecture

### Files to Delete

- `PipelineStatus` (in `SyncPortalParts.tsx`) - Replaced by panel headers
- `GlobalProgress` (in `SyncPortalParts.tsx`) - Replaced by per-panel progress

### Files to Create/Enhance

| Component | Purpose | Location |
|-----------|---------|----------|
| `DownsyncPanel` | Downsync phase UI with manifest stats + file queue | `SyncPortalParts.tsx` |
| `LocalShieldPanel` | Cleanup phase UI with scan progress + detection stats | `SyncPortalParts.tsx` |
| `UpsyncPanel` | Upload phase UI with cloud stats + file queue | `SyncPortalParts.tsx` |
| `PanelHeader` | Reusable header with phase indicator + inline progress | `SyncPortalParts.tsx` |
| `FileQueue` | Reusable file transfer list with truncation | `SyncPortalParts.tsx` |

### Component Interfaces

```typescript
// Shared panel header
interface PanelHeaderProps {
    title: string;
    status: "active" | "idle" | "complete" | "waiting";
    percentage?: number;
    accentColor: string;
}

// Downsync panel
interface DownsyncPanelProps {
    progress: SyncProgress;
    sourceType: string;
    colors: ThemeColors;
    width: number;
    height: number;
    isExpanded: boolean;
}

// Local shield panel
interface LocalShieldPanelProps {
    progress: SyncProgress;
    colors: ThemeColors;
    width: number;
    height: number;
    isExpanded: boolean;
}

// Upsync panel
interface UpsyncPanelProps {
    progress: SyncProgress;
    destType: string;
    colors: ThemeColors;
    width: number;
    height: number;
    isExpanded: boolean;
}
```

---

## Implementation Plan

### Phase 1: Data Pipeline Fix (sync.ts)

**Goal:** Ensure file queues persist across progress updates.

1. Add `currentDownloadQueue` and `currentUploadQueue` variables in `runSync()`
2. Persist queue state similar to `manifestStats` fix already applied
3. Always include queues in progress updates

### Phase 2: New Panel Components (SyncPortalParts.tsx)

**Goal:** Create three dedicated panel components.

1. Create `PanelHeader` component with:
   - Title + phase icon
   - Inline progress bar (compact, ~20 chars)
   - Status indicator (active/idle/waiting/complete)

2. Create `FileQueue` component with:
   - Dynamic file count based on available height
   - Truncation for long filenames
   - Speed and percentage per file

3. Create `DownsyncPanel` component combining:
   - `PanelHeader` with "DOWNSYNC: {sourceType}"
   - Manifest stats row
   - `FileQueue` for downloads
   - Footer with speed/ETA/file counts

4. Create `LocalShieldPanel` component combining:
   - `PanelHeader` with "LOCAL SHIELD"
   - Archive scan progress
   - Current archive indicator
   - Detection stats (clean/flagged)

5. Create `UpsyncPanel` component combining:
   - `PanelHeader` with "UPSYNC: {destType}"
   - Cloud sync stats (new/updated/deleted)
   - `FileQueue` for uploads
   - Footer with speed/ETA/file counts

### Phase 3: Main Layout Refactor (SyncPortal.tsx)

**Goal:** Replace current layout with responsive panel layout.

1. Delete `PipelineStatus` usage
2. Delete `GlobalProgress` usage
3. Add responsive layout logic:
   ```typescript
   const isWideScreen = width >= 100;
   const layoutDirection = isWideScreen ? "row" : "column";
   ```
4. Render three panels with `flexGrow` based on active phase
5. Keep action buttons at bottom

### Phase 4: Cleanup & Verification

1. Delete unused components from `SyncPortalParts.tsx`
2. Run linting
3. Test in narrow terminal (80x24)
4. Test in wide terminal (120x30)

---

## Verification Checklist

- [ ] `bun run lint` passes with no warnings
- [ ] Narrow terminal (80x24): Vertical layout, active panel expanded
- [ ] Wide terminal (120x30): Horizontal layout, three panels visible
- [ ] File queue shows up to 10 files
- [ ] Downsync phase: Manifest stats visible, file queue populated
- [ ] Clean phase: Archive scan progress visible
- [ ] Upsync phase: Cloud stats visible, upload queue populated

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Data pipeline still drops queue | Medium | High | Apply same persistence pattern as `manifestStats` |
| Layout breaks on small terminals | Low | Medium | Terminal size warning already exists |
| Performance with 10-file queue | Low | Low | Already using `React.memo` on components |

