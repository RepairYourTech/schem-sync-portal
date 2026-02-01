# UI & Backend Patterns

## FUNDAMENTAL RULES (READ FIRST)

### 1. NEVER INVENT PATTERNS - ONLY DOCUMENT WHAT EXISTS

**WRONG APPROACH**:
- See code doing different things
- Decide what you think is "better"
- Create "standardized pattern" that CHANGES the codebase
- Apply your new pattern everywhere

**CORRECT APPROACH**:
- See code doing different things
- Document what ACTUALLY EXISTS in the codebase
- Note the differences and when each is used
- NEVER change existing code to match your "pattern"

### 2. WHEN TOLD TO "MATCH CODEBASE" - CHECK 5+ EXAMPLES

**WRONG APPROACH**:
- Check 1-2 files
- Make assumptions
- Apply pattern

**CORRECT APPROACH**:
- Use Grep to find ALL occurrences
- Read 5+ different files
- Note the pattern
- Only then document

### 3. DOCUMENTATION IS SECONDARY TO CODE

**If documentation contradicts code**:
- The CODE is correct
- The DOCUMENTATION is wrong
- Fix the documentation, not the code

**Evolution markers are for learning from changes, not for creating new patterns.**

---

## UI Patterns

### 1. "No Raw Text" Rule (MANDATORY)

**NEVER** use raw string literals directly inside JSX/TSX. All text must be wrapped in a `<text>` component.

```tsx
// ❌ WRONG
<box>Hello World</box>

// ✅ CORRECT
<box><text>Hello World</text></box>
```

**Verification**: `tui-internal/no-raw-text` ESLint rule automatically enforces this.
**Manual Audit**: Use `Grep` with regex `<box[^>]*>[^<]*[a-zA-Z0-9]` to find violations.

### 2. Hotkey Component Usage

Hotkeys must follow the `[X]` format (e.g., `[B]ack`, `[S]tart`). Use the `Hotkey` component:

```tsx
import { Hotkey } from "./Hotkey";

// Let Hotkey handle bracket formatting (preferred)
<Hotkey label="Continue" keyLabel="c" onPress={...} />
// Renders: [C]ontinue

// For non-leading characters
<Hotkey label="e[X]it" keyLabel="x" onPress={...} />
```

**IMPORTANT**: Do not include manual `[...]` in labels unless a specific non-leading character needs highlighting.

See `src/components/Hotkey.tsx` for implementation.

### 3. Theme System (MANDATORY)

**ALWAYS** use the `useTheme()` hook to access the unified `colors` object. **NEVER** hardcode colors.

```tsx
import { useTheme } from "./theme"; // or similar

const MyComponent = () => {
    const colors = useTheme();

    return (
        <box style={{ backgroundColor: colors.primary }}>
            <text>Styled content</text>
        </box>
    );
};
```

**Theme Structure** (from `src/components/SyncPortal.tsx:46-57`):
- `primary`, `success`, `warning`, `danger`, `accent`, `setup`
- `bg`, `fg`, `border`, `dim`

### 4. Component Structure

Use functional components with `React.memo` and explicit `displayName`:

```tsx
export const MyComponent = React.memo(({ prop1, prop2 }: Props) => {
    // Component logic
    return <box><text>Content</text></box>;
});
MyComponent.displayName = "MyComponent";
```

### 5. OpenTUI Layouts

Use `<box>` for layout and grouping with `flexDirection`, `gap`, and `padding`:

```tsx
<box flexDirection="column" gap={1} padding={1}>
    <text>Row 1</text>
    <text>Row 2</text>
</box>
```

See `src/components/SyncPortalParts.tsx` for layout examples.

### 6. Focus Management (CRITICAL)

**Standard Pattern** (from Dashboard.tsx - reference implementation):
```tsx
<box
    onMouseOver={() => {
        onFocusChange?.("body");
        onSelectionChange?.(0);  // Explicit focus index
    }}
    onMouseDown={() => onAction?.("s")}
    border={!!(isFocused && selectedIndex === 0)}
    borderStyle="single"
    borderColor={(isFocused && selectedIndex === 0) ? colors.success : "transparent"}
    paddingLeft={1}
    paddingRight={1}
>
    <Hotkey keyLabel="s" label="Start" isFocused={!!(isFocused && selectedIndex === 0)} />
</box>
```

**Sub-Focus Pattern** (for panels with multiple interactive elements):
```tsx
// Panel with sub-focus (e.g., pause button + speed selector)
interface PanelProps {
    isFocused?: boolean;
    subFocusIndex?: number;  // 0 = pause, 1-3 = speed selector
    onSubFocusIndexChange?: (index: number) => void;
    onFocus?: (keepSubFocus?: boolean) => void;  // Key parameter!
}

// CORRECT: Preserve sub-focus on hover
<box
    onMouseOver={() => onFocus?.(true)}   // ✅ Preserves subFocus
    onMouseDown={() => onFocus?.(false)}  // Reset to index 0 on click
>

// WRONG: Always resets sub-focus
<box
    onMouseOver={() => onFocus?.(false)}  // ❌ Resets to index 0
    onMouseDown={() => onFocus?.(false)}
>
```

**Critical Rules**:
1. `onMouseOver` → Sync focus, preserve sub-focus with `onFocus?.(true)`
2. `onMouseDown` → Trigger action, may reset with `onFocus?.(false)`
3. `onMouseOver` should **NOT** duplicate focus setting in `onMouseDown`
4. Use optional chaining (`?.`) for all focus callbacks

### 7. Border Styling (CRITICAL - TWO DIFFERENT PATTERNS)

**PATTERN 1: Large Containers/Panels** - ALWAYS have static borders
```tsx
// Dashboard.tsx:33 - Panels use static dim border
border
borderStyle="single"
borderColor={colors.border}

// Options.tsx:257 - Main container uses static cyan
border
borderStyle="double"
borderColor={colors.primary}
```

**RULE**: Panels and large containers ALWAYS have borders with static colors (colors.border, colors.primary, etc.). NEVER conditional on focus. NEVER use green (colors.success).

**PATTERN 2: Tiny Interactive Elements** (buttons inside panels) - Conditional borders
```tsx
// Dashboard.tsx:100-107 - Inner buttons show focus
border={!!(isFocused && selectedIndex === 0)}
borderStyle="single"
borderColor={(isFocused && selectedIndex === 0) ? colors.success : "transparent"}
```

**RULE**: Only small buttons/interactive elements INSIDE panels use conditional borders with green when focused.

**DO NOT CONFUSE THE TWO PATTERNS**:
- ❌ WRONG: Panel using `border={isFocused} borderColor={isFocused ? colors.success : "transparent"}`
- ✅ CORRECT: Panel using `border borderColor={colors.border}`
- ✅ CORRECT: Button inside using `border={isFocused} borderColor={isFocused ? colors.success : "transparent"}`

<!-- Correction: 2026-01-31 | was: "Standardized Pattern - Use border={isFocused} borderColor={isFocused ? colors.success : 'transparent'} across ALL components" | reason: THIS WAS WRONG. I invented this pattern instead of documenting what ACTUALLY EXISTS in the codebase. The codebase uses TWO different patterns: (1) Panels/containers always have static borders with colors.border or colors.primary, (2) Only tiny buttons inside use conditional borders with green. This correction came after multiple failures to follow the ACTUAL codebase patterns. -->

### 8. Pattern Discovery Workflow (MANDATORY)

**BEFORE documenting any pattern**:

1. **Search for ALL occurrences**:
   ```bash
   # Find all uses of a pattern
   grep -r "borderColor" src/components/*.tsx
   ```

2. **Read 5+ different files**:
   - Read the actual code, don't guess
   - Note similarities AND differences
   - Document when each pattern is used

3. **Identify the pattern**:
   - What is consistent?
   - What varies and why?
   - Are there multiple valid patterns?

4. **THEN document**:
   - "In Dashboard.tsx, Options.tsx, Wizard.tsx, panels use X"
   - "In buttons, pattern Y is used"
   - Note exceptions and when each applies

**NEVER**:
- Create a "standardized pattern" that changes the codebase
- Assume without checking 5+ files
- Document what you "think" should be

**ALWAYS**:
- Document what ACTUALLY EXISTS
- Check multiple files first
- Note variations and exceptions

### 9. Navigation & Input

- Maintain mouse support alongside keyboard navigation
- Use `onMouseOver` handlers to sync focus with mouse interaction (see Focus Management above)
- Interactive elements should have `border` and `borderColor` that react to `isFocused` state (see Border Styling above)
- Consistency is paramount: Never deviate from established UI elements without explicit instruction
- **Reference**: Use Dashboard.tsx as the gold standard for all interaction patterns

### 7. Component Granularity

- **Rule**: Keep components under 500 lines
- **Action**: If a component grows too large, split into functional sub-components
- **Standard**: Each cloud provider or major step should be its own isolated component
- Example: `src/components/wizard/*` for provider-specific wizard steps

### 8. OpenTUI Rendering Safety (TUI-CRASH-PREVENTION)

- **Constraint**: `<text>` elements **MUST ONLY** contain string literals or string expressions.
  - **Safe**: `<text>{String(variable)}</text>`, `<text>{!!boolean && "Text"}</text>`
  - **Unsafe**: `<text>{number}</text>`, `<text>{boolean}</text>`, `<text><span>nested</span></text>` (Nesting React elements inside text causes crashes).
- **Styling**: To mix styles, use `<box flexDirection="row">` with sibling `<text>` elements.
  - **Pattern**: `<box flexDirection="row"><text fg="red">Red</text><text>Normal</text></box>`
- **Attributes**: Always set default `attributes={0}` instead of leaving it undefined to ensure stable rendering.

### 9. Interactive State & Focus

- **Rule**: All interactive elements (buttons, inputs, list items) **MUST** provide distinct visual feedback when focused or hovered.
- **Standard Implementation**:
  - **Hotkeys**: Pass `isFocused` prop to `Hotkey`.
    - **Inactive**: `colors.primary` (Cyan) or `colors.dim` (Gray).
    - **Focused**: `colors.success` (Lime) for buttons/list items; `colors.primary` (Cyan) for Sync Portal panels.
  - **Containers**: Use borders or color changes.
    - **Focused Border**: `border={isFocused}` with `borderColor={isFocused ? colors.primary : colors.dim + "33"}` (Sync Portal) or `colors.success` (Menus).
    - **Focused Text**: Switch text color to `colors.primary` (Sync Portal) or `colors.success` (Menus). Avoid `colors.fg` (White) for selection.
- **Interaction**: Ensure `onMouseDown` triggers the same focus state change as keyboard navigation.
- **Exemplar Cross-Referencing**: When fixing focus or alignment, you MUST cross-reference a "known good" component (e.g., `Dashboard.tsx`) to verify event naming and state propagation patterns.

---

## Backend Patterns

### 1. Type Safety & Interfaces

- Strictly avoid `any`
- Define interfaces for all state and progress objects
- See `src/lib/sync.ts:19-93` for data model examples:
  - `FileTransferItem` - Individual file being transferred
  - `ManifestStats` - Manifest analysis statistics
  - `CleanupStats` - Malware shield cleanup statistics
  - `CloudSyncStats` - Cloud sync summary statistics
  - `SyncProgress` - Overall progress with phase tracking

**Cleanup**: Avoid redundant property names (e.g., use `value` instead of both `value` and `val`).

### 2. Logging Patterns

Use `Logger.info`, `Logger.debug`, etc. instead of `console.log`. Always include a `LogContext`:

```tsx
import { Logger } from "./lib/logger";

Logger.info("Sync started", { context: "SYNC" });
Logger.debug("File transfer details", { context: "SYNC", file: "schematic.zip" });
```

**Common contexts**: `SYNC`, `AUTH`, `CLEANUP`, `CONFIG`

### 3. Process Management

```typescript
import { spawn, spawnSync } from "bun";

// Prefer Bun's spawn over Node's child_process
const proc = spawn(["rclone", "ls", "source:", "--use-json-log"]);

// For sync operations
const result = spawnSync(["rclone", "version"]);
```

**Rclone Best Practices**:
- Use `--use-json-log` for structured, safe parsing
- Avoid manual parsing of `rclone.conf` - use `rclone config` commands
- Break down monolithic functions into smaller, testable units focused on single phases

---

## Testing Requirements

### UI Interaction Tests (MANDATORY)

All interactive components MUST have tests covering:

1. **Focus Management**:
   - Test that `onMouseOver` properly syncs focus state
   - Test that `onMouseDown` triggers the correct action
   - Test sub-focus preservation on hover (for panels)

2. **Visual Feedback**:
   - Test border visibility/color changes with `isFocused` state
   - Test text/icon color changes on focus

3. **Keyboard Navigation**:
   - Test Tab/Shift+Tab navigation
   - Test arrow key selection
   - Test Enter/Return key activation

4. **Mouse Interactions**:
   - Test hover feedback
   - Test click activation
   - Test focus preservation across hover/click

**Test File Naming**: `src/components/<ComponentName>.test.tsx`

**Example Test Structure**:
```tsx
describe("Dashboard", () => {
    it("should sync focus on mouse hover", () => {
        // Test onMouseOver calls focus callbacks
    });
    it("should show border when focused", () => {
        // Test border prop changes with isFocused
    });
    it("should preserve sub-focus on panel hover", () => {
        // Test sub-focus not reset on hover
    });
});
```

---

## Evolution & Traceability

### Evolution Markers

When improving this file or other instruction files based on experience, include an evolution marker:

```html
<!-- Evolution: YYYY-MM-DD | source: {experience_id} | reason: {brief_description} -->
```

### Correction Markers

If guidance is found to be incorrect and is updated, include a correction marker:

```html
<!-- Correction: YYYY-MM-DD | was: "{old_guidance}" | reason: {why_it_changed} -->
```

### Audit Alignment

If a pattern audit (Step 2 of Workflow) identifies a misalignment between instructions and codebase, you **MUST** update these instructions immediately to match reality.

Use the `self-improving-agent` skill to manage these updates autonomously after task completion.

<!-- Evolution: 2026-01-31 | source: failure-correction-2026-01-31 | reason: Added FUNDAMENTAL RULES section after creating wrong border patterns that contradicted the actual codebase. Core issue: I invented "standardized" patterns instead of documenting what exists, leading to green borders on panels which the codebase never uses. -->
<!-- Correction: 2026-01-31 | was: "Standardized Pattern - Use border={isFocused} borderColor={isFocused ? colors.success : 'transparent'} across ALL components" | reason: THIS WAS WRONG. I invented this pattern instead of documenting what ACTUALLY EXISTS in the codebase. The codebase uses TWO different patterns: (1) Panels/containers always have static borders with colors.border or colors.primary, (2) Only tiny buttons inside use conditional borders with green. This correction came after multiple failures to follow the ACTUAL codebase patterns. -->
<!-- Evolution: 2026-01-31 | source: ui-pattern-audit-2026-01-31 | reason: Added comprehensive focus management patterns, sub-focus handling with keepSubFocus parameter, standardized border styling, and UI testing requirements based on comprehensive component audit -->
<!-- Correction: 2026-01-31 | was: "Use onMouseOver to sync focus" | reason: Updated to include critical detail about preserving sub-focus with onFocus?(true) vs resetting with onFocus?(false). This distinction was missing and caused focus reset bugs in panels. -->
<!-- Evolution: 2026-01-31 | source: agent-md-refactor | reason: Expanded with code examples from original CLAUDE.md for better clarity and reference -->
<!-- Evolution: 2026-01-31 | source: ep-2026-01-31-001 | reason: Codifying line-by-line audit and cross-referencing requirement for zero-defect focus fixes. -->
