# Shield Architecture Refactor: Manifest-Based Remediation

## Phase 1: Manifest Generation & Logic (Non-Breaking)
- [x] **Data Structures**: Define `ShieldManifest` type (header, entries, versioning) in `src/lib/shield/types.ts`
- [x] **Utility**: Implement `ManifestParser` class
    - [x] `parse(content: string): ShieldManifest`
    - [x] `stringify(manifest: ShieldManifest): string`
    - [x] `diff(old: ShieldManifest, new: ShieldManifest): ManifestDiff`
- [x] **ShieldManager Extension**:
    - [x] Implement `saveUpsyncManifest(localDir, files, policy)`
    - [x] Implement `addToExcludeList(localDir, patterns)`
    - [x] Ensure exclusion list merging logic works
- [x] **PullPhase Integration**:
    - [x] Capture all approved file paths in `runPullPhase`
    - [x] Generate `upsync-manifest.txt` at end of pull
- [x] **Verification**:
    - [x] Test: Parse generated manifest, verify Header format
    - [x] Test: `manifest.test.ts` pass

## Phase 2: Upsync Switch & Google Drive Enforcement (Breaking)
- [x] **G-Drive Enforcement Logic**:
    - [x] Mod `config.ts`: Add `validateConfig` rule (GDrive -> Shield=True, Policy=Isolate)
    - [x] Mod `SecurityStep.tsx`: Lock Shield toggle if GDrive selected
    - [x] Mod `Options.tsx`: Lock Shield toggle if GDrive selected
- [x] **CloudPhase Refactor**:
    - [x] Create `runManifestCloudPhase` in `cloudPhase.ts` using `--files-from`
    - [x] **CRITICAL**: Error handling if manifest missing
- [x] **Orchestration Update**:
    - [x] Mod `sync/index.ts`: Sequence `await runPullPhase()` -> `await runManifestCloudPhase()`
    - [x] Remove parallelism (Fixes "Upsync Blocks" bug)

## Phase 3: Cleanup & Optimization
- [x] **Delete Legacy Code**:
    - [x] Delete `src/lib/sync/streamingQueue.ts`
    - [x] Remove legacy variables from `pullPhase.ts`
- [x] **Refine Logging**:
    - [x] Integrated manifest info into progress updates

## Phase 4: Standalone Shield & Advanced Features
- [x] **Standalone Mode**:
    - [x] Implement `ShieldExecutor.scanLocal(localDir)`
    - [x] Walk file system -> Identify archives -> Run Shield logic
    - [x] Retroactively generate `upsync-manifest.txt`
- [x] **UI Visualization**:
    - [x] Update `LocalShieldPanel.tsx`: Show Manifest metadata
- [x] **Integrity Check**:
    - [x] Implement `verifyManifest()` in `ShieldManager.ts`
    - [x] Add "REGENERATE MANIFEST" button in Options
    - [x] Wire `onScan` progress through `AppContent.tsx`
