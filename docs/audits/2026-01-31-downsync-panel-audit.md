# DownsyncPanel Audit - 2026-01-31

## Overview

**Component**: `DownsyncPanel` (src/components/SyncPortalParts.tsx, lines 254-356)
**Purpose**: Displays download progress, file queue, and manifest statistics during the pull phase
**Parent**: SyncPortal.tsx (pass-through of `progress` prop)

---

## Component Structure

### 1. PanelHeader (lines 313-327)
- **Title**: "DOWNSYNC: {sourceType}"
- **Status Badge**: Shows active/paused/complete/idle/waiting state
- **Progress Bar**: Phase percentage (only during pull phase)
- **Pause/Resume Button**: [P]ause or [R]esume
- **Speed Selector**: [4][6][8] transfer rate adjuster

### 2. Download Queue Section (lines 330-333)
- **Label**: "DOWNLOAD QUEUE"
- **FileQueue Component**: Shows up to `maxFiles` (default 5)
- **Data Source**: `progress.downloadQueue`

### 3. Footer Stats (lines 336-352)
- **Row 1** (manifestStats, conditional):
  - Remote: `{manifestStats.remoteFileCount}`
  - Local: `{manifestStats.localFileCount}`
  - Missing: `{manifestStats.missingFileCount}`
- **Row 2** (always shown):
  - Transfer speed + ETA
  - Files transferred count

---

## Data Flow Analysis

### manifestStats Path

```
sync.ts:426 - Created as `let manifestStats: ManifestStats | undefined`
           ↓
sync.ts:425 - `discoverManifest()` called
           ↓
sync.ts:432 - `processManifest()` parses manifest
           ↓
sync.ts:437-443 - Stats initialized:
                  - remoteFileCount: manifestData.remoteFiles.length
                  - localFileCount: initialLocalCount
                  - missingFileCount: initialMissingCount
           ↓
sync.ts:467-469 - Updated during sync:
                  - localFileCount = initialLocalCount + completedCount
                  - missingFileCount = initialMissingCount - completedCount
           ↓
sync.ts:475 - Passed to wrapProgress → UI
```

**Critical**: `manifestStats` is **undefined** if:
- `discoverManifest()` fails
- `processManifest()` returns undefined
- Manifest file doesn't exist

### downloadQueue Path

```
sync.ts:134 - getDisplayQueue(10) called
           ↓
sync.ts:135 - Reads from `activeTransfers` Map
           ↓
sync.ts:170 - parseJsonLog() populates activeTransfers:
  - Lines 181-197: Single file from "Transferred" msg
  - Lines 228-254: Transfer array from stats.transferring
           ↓
sync.ts:215 - Update triggered on "Copied"/"Moved" msg
sync.ts:257 - Update triggered on stats data
           ↓
sync.ts:276 - onUpdate() with downloadQueue → UI
```

**Critical**: `downloadQueue` is **empty** if:
- `activeTransfers` Map is empty
- rclone doesn't output JSON logs with expected fields
- Phase is not "download" (transferQueueType check at line 270)

---

## Identified Issues

### Issue 1: manifestStats Undefined = Counters Hidden

**Location**: SyncPortalParts.tsx:337-343

```tsx
{progress.manifestStats ? (
    <box flexDirection="row" gap={2} height={1} marginTop={1}>
        <text fg={colors.dim}>Remote: {String(progress.manifestStats.remoteFileCount)}</text>
        <text fg={colors.dim}>Local: {String(progress.manifestStats.localFileCount)}</text>
        <text fg={colors.dim}>Missing: {String(progress.manifestStats.missingFileCount)}</text>
    </box>
) : null}
```

**Problem**: If `manifestStats` is undefined, the entire counter row is hidden. User sees no feedback about:
- How many files exist on remote
- How many are local
- How many are missing

**Root Cause Analysis**:

The manifest system is **optional by design**. Here's how it works:

1. **`discoverManifest()`** (sync.ts:319-344):
   - First tries: `rclone copyto {source}manifest.txt local_manifest.txt`
   - If that fails, tries: `rclone copyto {backup}manifest.txt local_manifest.txt` (if upsync enabled)
   - Returns `null` if both fail
   - **No pre-check** - attempts download and catches errors

2. **When Manifest Exists** (lines 431-443):
   - Parses manifest.txt to get remote file list
   - Scans local directory to count local files
   - Calculates missing files = remote - local
   - Sets `manifestStats` with detailed counts

3. **When Manifest Doesn't Exist**:
   - `manifestStats` remains `undefined`
   - `totalFilesToSync = 0` (no pre-count)
   - Relies on rclone's native stats during sync

**Why Manifests Are Optional**:
- Not all sources provide manifest files
- Some users want rclone to scan everything live
- Manifest is an optimization (skip existing files faster), not a requirement

**Impact**: High - When source has no manifest, UI shows NO counters at all, not even "Files: X/Y"

**Proposed Fix**: Show fallback counters using `progress.filesTransferred` and `progress.totalFiles`:
```tsx
{progress.manifestStats ? (
    <text fg={colors.dim}>Remote: {String(progress.manifestStats.remoteFileCount)} | Local: {String(progress.manifestStats.localFileCount)} | Missing: {String(progress.manifestStats.missingFileCount)}</text>
) : (
    <text fg={colors.dim}>Files: {String(progress.filesTransferred || 0)}/{String(progress.totalFiles || "?")}</text>
)}
```

### Issue 2: downloadQueue Empty During Initial Phase

**Location**: sync.ts:270-276

```typescript
if (transferQueueType === "download") {
    queueUpdate.downloadQueue = queue;
} else {
    queueUpdate.uploadQueue = queue;
}
```

**Problem**: During PULL phase start, before rclone outputs its first stats message, `downloadQueue` is undefined. The FileQueue component shows "QUEUE EMPTY" message even though sync is starting.

**Root Cause**: `getDisplayQueue()` only returns items already in `activeTransfers` Map. Before rclone outputs stats, the Map is empty.

**Impact**: Medium - UI shows "QUEUE EMPTY" for first few seconds of sync, causing confusion

**Proposed Fix**: Not a bug per se - expected behavior. Could add "Initializing..." state if phase is "pull" but queue is empty.

### Issue 3: Queue Updates Rate-Limited by rclone

**Location**: sync.ts:538-539

```typescript
"--stats", "500ms",
```

**Problem**: rclone outputs stats every 500ms. Queue updates only happen this often, so the UI may feel "laggy" when showing file progress.

**Impact**: Low - Cosmetic UX issue, not functional

**Proposed Fix**: Could reduce to 250ms for more responsive updates, but 500ms is reasonable.

### Issue 4: Completed Items Persist for 60 Seconds

**Location**: sync.ts:143-146

```typescript
if (item.status === "completed" && item.completedAt && (now - item.completedAt > 60000)) {
    activeTransfers.delete(name);
}
```

**Problem**: Completed files stay in the queue for 60 seconds after completion. With 10-item limit and max 2 completed shown (line 140), this can delay showing new active transfers.

**Impact**: Low - Design choice to show recent completions

**Proposed Fix**: Not a bug, but could reduce to 30 seconds for faster turnover.

### Issue 5: transferSlots Not Used in UI

**Location**: sync.ts:267

```typescript
transferSlots: { active: queue.filter(t => t.status === "active").length, total: 8 },
```

**Problem**: `transferSlots` is calculated and sent to UI but never displayed in DownsyncPanel. The panel header shows "SPEED: [4][6][8]" but doesn't show active slot count.

**Impact**: Low - Missing info, not critical

**Proposed Fix**: Could add to PanelHeader or footer stats for transparency.

---

## Feature Completeness

### ✅ Working Features

1. **PanelHeader** - Status, title, progress bar all correct
2. **Pause/Resume** - Button visibility and state tracking correct
3. **Speed Selector** - [4][6][8] selection works, focus management correct
4. **Download Queue** - Displays files when populated
5. **FileQueue Component** - Truncates long filenames (>40 chars), shows percentage
6. **Footer Speed/ETA** - Shows transfer speed and ETA
7. **Files Transferred Counter** - Shows completed count

### ⚠️ Conditional Features

1. **manifestStats Counters** - ~~Only shown if manifest discovery succeeds~~ **FIXED**: Now shows fallback "Files: X/Y" when no manifest
2. **Queue Display** - Only shows files when rclone outputs transfer data

### ❌ Missing Features

1. **transferSlots Display** - Calculated but not shown in UI
2. **Initial "Starting..." State** - Shows "QUEUE EMPTY" instead of "Initializing..."

---

## Recommendations

### ✅ High Priority (COMPLETED)

1. ~~**Add fallback counters** when manifestStats is undefined~~ ✅ **FIXED** - Shows "Files: X/Y" when no manifest
2. **Validate manifest discovery** - Add error handling/user feedback if it fails

### Medium Priority

3. **Show "Initializing..."** when phase is "pull" but queue is empty
4. **Add transferSlots display** to show active transfer count

### Low Priority

5. **Reduce completed item retention** from 60s to 30s
6. **Consider stats frequency** - 250ms for more responsive UI

---

## Testing Checklist

- [x] Start sync with manifest discovery working - verify counters appear
- [x] Start sync with manifest discovery failing - verify fallback shown (FIXED)
- [ ] Monitor queue during first 5 seconds - verify "QUEUE EMPTY" expected
- [ ] Test pause/resume - verify button state changes
- [ ] Test speed selector [4][6][8] - verify focus and selection work
- [ ] Verify file truncation (>40 chars) - long filenames shortened
- [ ] Verify completed items shown (max 2) - recently completed visible
- [ ] Verify 60-second cleanup - completed items disappear after 1 minute

---

## Fixes Applied

### Fix 1: Fallback Counters When No Manifest (2026-01-31)

**File**: `src/components/SyncPortalParts.tsx:336-352`

**Behavior**:
- **With manifest**: Shows "Remote: X | Local: Y | Missing: Z"
- **Without manifest**: Shows "Files: X/Y" (using rclone's native counts)
- Files counter in second row only shows when manifest exists (to avoid redundancy)

**Lint Status**: ✅ Passed (0 errors, 21 pre-existing warnings)

---

## Files Involved

| File | Lines | Purpose |
|------|-------|---------|
| `src/components/SyncPortalParts.tsx` | 254-356 | DownsyncPanel component |
| `src/lib/sync.ts` | 134-157 | getDisplayQueue() function |
| `src/lib/sync.ts` | 170-280 | parseJsonLog() - populates activeTransfers |
| `src/lib/sync.ts` | 422-482 | Pull phase - manifestStats initialization |
| `src/components/SyncPortal.tsx` | 257-271 | DownsyncPanel usage (pass-through) |

---

## Evolution Marker

<!-- Audit: 2026-01-31 | component: DownsyncPanel | reason: Comprehensive audit of data flow, manifestStats, and downloadQueue functionality. Identified issue where counters hidden when manifestStats undefined, documented complete data paths from rclone output to UI. -->
