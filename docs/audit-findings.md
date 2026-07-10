# Schematic Sync Portal - First-Pass Findings

Scope: read-only review of the current codebase and TUI behavior. This is a diagnosis of what the app appears to do and the main problems visible from the implementation.

## What This App Appears To Be

This is a local-first TUI for managing schematic archives for repair work.

The intended flow looks like this:

1. Configure a source, usually CopyParty or another remote.
2. Choose a local archive directory.
3. Run a sync pipeline that pulls files down, applies a "shield" cleanup pass, and optionally uploads approved files to a backup cloud.
4. Offer extra utilities like launcher installation, font help, logs, a doctor view, and ntfy notifications.

The codebase is much broader than a simple terminal UI. It acts like a sync engine, archive cleaner, installer, notification client, and desktop launcher generator all at once.

## Main Problems

### 1. The app can destroy the wrong directory

The target path is accepted without meaningful safety validation, then passed into destructive filesystem operations and `rclone sync`.

Relevant code paths:

- `src/components/wizard/steps/DirectoryConfig.tsx`
- `src/components/wizard/WizardContainer.tsx`
- `src/lib/config.ts`
- `src/lib/sync/pullPhase.ts`
- `src/lib/cleanup.ts`

`Env.isSafeDirectory()` exists, but I did not find it used to gate the dangerous paths.

### 2. Cleanup can delete data even when extraction or verification fails

The shield/extraction flow swallows important errors, ignores subprocess exit status in some places, and still deletes the original archive or cleaned file afterward.

Relevant code paths:

- `src/lib/cleanup.ts`
- `src/lib/shield/archiveAnalyzer.ts`

That means a failed or partial extraction can still end in permanent deletion.

### 3. The "malware shield" is mostly heuristic filename filtering

The shield appears to rely on archive listing, extension checks, path rules, and pattern matching rather than real malware detection.

Relevant code paths:

- `src/lib/shield/patterns.ts`
- `src/lib/cleanup.ts`

That creates a product claim mismatch and a real false-positive/false-negative risk. It is not a malware scanner in the normal sense.

### 4. Secret handling is unsafe

Credentials and tokens are logged or displayed in places where they should not be.

Relevant code paths:

- `src/lib/rclone.ts`
- `src/lib/auth.ts`
- `src/components/wizard/steps/CloudDirectEntryStep.tsx`

This is especially risky because the app is explicitly handling cloud logins and remote credentials.

### 5. Sync completion and failure handling are too optimistic

Some sync paths catch errors, log them, and then still return a success-shaped result. That makes failed work look complete.

Relevant code paths:

- `src/lib/sync/index.ts`
- `src/lib/sync/cloudPhase.ts`
- `src/lib/useSync.ts`
- `src/lib/ntfy-worker.ts`

This is a reliability problem and a UX problem at the same time.

### 6. Keyboard and focus handling are brittle

The app has overlapping key handlers at the app shell and wizard levels, which makes shortcuts collide with text entry and focus state.

Relevant code paths:

- `src/components/AppContent.tsx`
- `src/components/wizard/WizardContainer.tsx`
- `src/components/SyncKeyHandler.ts`

This is the kind of issue that makes a TUI feel broken even when the underlying logic works.

### 7. The layout is not robust at terminal sizes

The current UI looks overbuilt for the available space. Several panels, headers, and controls compete for too little vertical room, and some bordered elements are effectively one-line widgets.

Relevant code paths:

- `src/components/Dashboard.tsx`
- `src/components/SyncPortal.tsx`
- `src/components/SyncPortalParts.tsx`
- `src/components/panels/DownsyncPanel.tsx`
- `src/components/panels/UpsyncPanel.tsx`
- `src/components/wizard/*`

The result is a high risk of truncation, overlap, and awkward navigation on common terminal dimensions.

### 8. The persistence and installation model is fragile

Config is stored in local working-directory files, writes are not clearly atomic, and generated launchers point back at the source checkout.

Relevant code paths:

- `src/lib/config.ts`
- `src/lib/syncState.ts`
- `src/lib/deploy.ts`
- `src/lib/daemon.ts`

That makes portability and recovery worse than the README suggests.

## Bottom Line

The app’s idea is coherent, but the implementation is trying to do too much without enough safety boundaries.

The highest-priority problems are:

1. Unsafe filesystem deletion
2. Secret exposure
3. Success/failure reporting that can lie
4. Keyboard and layout instability in the TUI

I would not trust the current version around irreplaceable files or real production credentials.
