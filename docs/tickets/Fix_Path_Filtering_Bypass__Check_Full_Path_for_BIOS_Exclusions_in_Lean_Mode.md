# Fix Path Filtering Bypass: Check Full Path for BIOS Exclusions in Lean Mode

## Problem

Lean mode filtering only checks filenames, not full paths. This causes BIOS folders to be downloaded even when they should be excluded.

**Location**: `file:src/lib/sync/pullPhase.ts` (Line 161)

```typescript
const filename = f.split('/').pop() || f;
const keep = shouldDownloadInLeanMode(filename);
```

**Impact**:
- `Computers/BIOS/archive.zip` checks only `archive.zip`
- "BIOS" is in the path but not the filename
- File is downloaded despite exclusion intent
- Violates requirement: "Skip BIOS Entirely"

## Solution

Pass the full path to `shouldDownloadInLeanMode()` and check both path and filename for exclusion patterns.

### Implementation Steps

1. **Update pullPhase.ts** (Line 161):
   ```typescript
   // Current:
   const filename = f.split('/').pop() || f;
   const keep = shouldDownloadInLeanMode(filename);
   
   // Proposed:
   const keep = shouldDownloadInLeanMode(f); // Pass full path
   ```

2. **Update archiveAnalyzer.ts** `shouldDownloadInLeanMode()`:
   ```typescript
   export function shouldDownloadInLeanMode(filePath: string, archiveListing?: string): boolean {
     const lowerPath = filePath.toLowerCase();
     const filename = filePath.split('/').pop() || filePath;
     const lowerFilename = filename.toLowerCase();
     
     // 1. Check FULL PATH for exclusions (catches BIOS folders)
     if (LEAN_MODE_EXCLUDE_PATTERNS.some(p => lowerPath.includes(p.toLowerCase()))) {
       Logger.debug("SHIELD", `Lean Mode: Excluded by path pattern: ${filePath}`);
       return false;
     }
     
     // 2. Check filename for valuable indicators
     if (VALUABLE_ARCHIVE_INDICATORS.some(ind => lowerFilename.includes(ind.toLowerCase()))) {
       return true;
     }
     
     // 3. Content analysis (if listing provided)
     if (archiveListing) {
       const lowerListing = archiveListing.toLowerCase();
       if (VALUABLE_ARCHIVE_INDICATORS.some(ind => lowerListing.includes(ind.toLowerCase()))) {
         return true;
       }
       if (LEAN_MODE_EXCLUDE_PATTERNS.some(p => lowerListing.includes(p.toLowerCase()))) {
         return false;
       }
     }
     
     // Default: keep ambiguous files
     return true;
   }
   ```

3. **Add path-based patterns** to `file:src/lib/shield/patterns.ts`:
   ```typescript
   export const LEAN_MODE_EXCLUDE_PATTERNS = [
     // Existing patterns...
     
     // Path-based patterns (case-insensitive)
     "/bios/", "/bios_", "\\bios\\", "\\bios_",
     "/firmware/", "\\firmware\\",
     "/drivers/", "\\drivers\\",
     "/utilities/", "\\utilities\\",
     // ... etc
   ];
   ```

### Acceptance Criteria

- [ ] Files in `BIOS/` folders are excluded in lean mode
- [ ] Files in `Firmware/` folders are excluded in lean mode
- [ ] Files in `Drivers/` folders are excluded in lean mode
- [ ] Valuable files (boardview, schematic) are kept regardless of path
- [ ] Filename-based filtering still works (backward compatibility)
- [ ] Logging shows which pattern triggered exclusion
- [ ] New test added: `tests/lean-mode.test.ts` - "excludes files by path pattern"

### Test Cases

```typescript
// Should be EXCLUDED (path contains BIOS):
shouldDownloadInLeanMode("Computers/BIOS/update.zip") // false
shouldDownloadInLeanMode("BIOS/Dell/flash.bin") // false
shouldDownloadInLeanMode("Tools/BIOS_Tools/utility.exe") // false

// Should be KEPT (valuable content):
shouldDownloadInLeanMode("BIOS/boardview.zip") // true (valuable indicator)
shouldDownloadInLeanMode("Schematics/board.pdf") // true

// Should be EXCLUDED (filename pattern):
shouldDownloadInLeanMode("BIOS_update.zip") // false (existing logic)
```

### Files to Modify

- `file:src/lib/sync/pullPhase.ts` (Line 161)
- `file:src/lib/shield/archiveAnalyzer.ts` (Lines 66-92)
- `file:src/lib/shield/patterns.ts` (Add path-based patterns)
- `file:tests/lean-mode.test.ts` (Add path filtering tests)