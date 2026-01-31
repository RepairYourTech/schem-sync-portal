## Task: SyncPortal UI Redesign - Panel-First Layout

**ID:** sync-portal-ui-redesign
**Label:** [SyncPortal]: Panel-First Responsive UI Redesign
**Description:** Complete redesign of SyncPortal component to remove redundant elements and implement dominant, responsive panels for each sync phase
**Type:** Enhancement
**Status:** To Do
**Priority:** CRITICAL
**Created:** 2026-01-31
**Updated:** 2026-01-31
**PRD:** [Link](../PRDS/sync-portal-ui-redesign.md)

---

## Problem Statement

The current SyncPortal UI fails to utilize screen space effectively:

1. **Redundant Elements Waste Space:**
   - `PipelineStatus` (8 lines): Shows 3 boxes with arrows - phase info is already in panel headers
   - `GlobalProgress` (4 lines): Centered progress bar - each panel should have its own

2. **Panels Are Undersized:**
   - Panels appear as small, conditional add-ons below the main bars
   - No height allocation strategy - they just take whatever vertical space is left
   - File queue shows only 5 items in a tiny section

3. **Not Responsive:**
   - No adaptation to terminal width (horizontal vs vertical layout)
   - No adaptation to terminal height (truncation/scrolling)

---

## Success Criteria

- [ ] `PipelineStatus` component removed from SyncPortal
- [ ] `GlobalProgress` component removed from SyncPortal
- [ ] Three dedicated panel components: `DownsyncPanel`, `LocalShieldPanel`, `UpsyncPanel`
- [ ] Active panel gets `flexGrow={2}` (dominant), others get `flexGrow={1}` (collapsed)
- [ ] Responsive layout: horizontal (row) if width >= 100, vertical (column) otherwise
- [ ] Each panel includes: header, stats section, file queue, progress section
- [ ] File queue shows up to 10 files (not 5)
- [ ] All linting passes
- [ ] Visual verification in both wide and narrow terminals

---

## Blocked On

- User approval of PRD before implementation

---

## Related Files

- `src/components/SyncPortal.tsx` - Main component to refactor
- `src/components/SyncPortalParts.tsx` - Sub-components (some to delete, some to enhance)
- `src/lib/sync.ts` - Data pipeline (may need queue persistence fix)
