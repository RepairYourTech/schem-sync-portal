# Fix Folder Flattening: Preserve Directory Structure During Extraction

## Problem

Archives with nested folder structures are flattened during extraction. All files are moved to the parent directory, losing their original hierarchy.

**Location**: `file:src/lib/cleanup.ts` (Line 248)

```typescript
const destPath = join(dirPath, basename(match));
```

**Impact**:
- `SubFolder/schematic.pdf` becomes `schematic.pdf`
- Files with identical names overwrite each other
- Original organization is lost

## Solution

Replace `basename(match)` with relative path reconstruction to preserve the full directory structure.

### Implementation Steps

1. **Calculate relative path within archive**:
   ```typescript
   const relativePathInArchive = relative(stagingDir, match);
   const destPath = join(dirPath, relativePathInArchive);
   ```

2. **Ensure parent directories exist**:
   ```typescript
   const destDir = dirname(destPath);
   if (!existsSync(destDir)) {
     mkdirSync(destDir, { recursive: true });
   }
   ```

3. **Update the move operation** (around line 250):
   ```typescript
   if (!existsSync(destPath)) {
     renameSync(match, destPath);
     // ... rest of verification logic
   }
   ```

### Acceptance Criteria

- [ ] Files extracted from `Folder/SubFolder/file.pdf` are placed at `Folder/SubFolder/file.pdf` relative to archive location
- [ ] Parent directories are created automatically
- [ ] Multiple files with same name in different folders don't overwrite each other
- [ ] Nested archives maintain structure through recursive extraction
- [ ] Existing tests pass with structure preservation
- [ ] New test added: `tests/cleanup.test.ts` - "preserves folder structure during extraction"

### Test Case

```typescript
// Archive structure:
// archive.zip
//   ├── Schematics/board.pdf
//   ├── Boardviews/board.bvr
//   └── Docs/manual.pdf

// Expected output:
// target_dir/
//   ├── Schematics/board.pdf
//   ├── Boardviews/board.bvr
//   └── Docs/manual.pdf
```

### Files to Modify

- `file:src/lib/cleanup.ts` (Lines 246-266)
- `file:tests/cleanup.test.ts` (Add structure preservation test)