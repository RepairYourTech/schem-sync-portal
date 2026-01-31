## UI Patterns & Consistency

### 1. Hotkey Formatting
- Hotkeys must follow the `[X]` format (e.g., `[B]ack`, `[S]tart`).
- Use the specialized `Hotkey` component for all keyboard triggers.
- Ensure border highlights are applied for focus state as established in the theme.

### 2. Navigation & Input
- Maintain mouse support alongside keyboard navigation.
- Adhere to existing event handling patterns (e.g., `onMouseDown` for interaction).
- Consistency is paramount: Never deviate from established UI elements or behaviors without explicit instruction.

### 3. "No Raw Text" Rule
- **NEVER** use raw string literals directly inside JSX/TSX.
- All text must be wrapped in a `<text>` component.
- This is enforced by a custom ESLint rule: `tui-internal/no-raw-text`.

### 4. OpenTUI Layouts
- Use `<box>` for layout and grouping.
- Use `flexDirection` ("row" or "column") to control alignment.
- Use `gap` and `padding` for spacing.

### 5. Component Structure
- Prefer functional components with `React.memo` for performance in TUI.
- Use explicit interfaces for props.
- Define `displayName` for every component to aid in debugging.

### 6. Theme Usage
- Always use the `ThemeColors` interface for consistent styling.
- Rely on passed-in `colors` props rather than hardcoded hex values.

### 7. Type Safety
- Strictly avoid `any`.
- Define interfaces for all state and progress objects (see `src/lib/sync.ts`).
