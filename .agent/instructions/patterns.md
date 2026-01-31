## UI Patterns & Consistency

### 1. Hotkey Formatting
- Hotkeys must follow the `[X]` format (e.g., `[B]ack`, `[S]tart`).
- Use the specialized `Hotkey` component for all keyboard triggers.
- **Resource**: Use `opentui` skill (keyboard ref) and `grep_search` to verify existing UI.

### 2. Navigation & Input
- Maintain mouse support alongside keyboard navigation.
- Adhere to existing event handling patterns (e.g., `onMouseDown` for interaction).
- Consistency is paramount: Never deviate from established UI elements or behaviors without explicit instruction.

### 3. "No Raw Text" Rule
- **NEVER** use raw string literals directly inside JSX/TSX. All text must be wrapped in a `<text>` component.
- **Verification**: `tui-internal/no-raw-text` ESLint rule.
- **Tools**: `bun run lint` (automated) or `grep_search` with regex `<box[^>]*>[^<]*[a-zA-Z0-9]` (manual audit).

### 4. OpenTUI Layouts
- Use `<box>` for layout and grouping with `flexDirection`, `gap`, and `padding`.
- **Resource**: Use `opentui` skill (layout ref) and `view_file` on `src/components/SyncPortalParts.tsx` for examples.

### 5. Component Structure
- Use functional components with `React.memo` and explicit `displayName`.
- **Resource**: Use `opentui` skill (react ref) and `ui-pattern-verifier` skill.

### 6. Theme Usage
- Always use the `ThemeColors` interface and passed-in `colors` props.
- **Tools**: `grep_search` for `ThemeColors` to find relevant theme tokens.

### 7. Type Safety
- Strictly avoid `any`.
- Define interfaces for all state and progress objects (see `src/lib/sync.ts`).
