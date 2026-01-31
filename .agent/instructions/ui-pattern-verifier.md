---
name: ui-pattern-verifier
description: Audit TUI components for adherence to project standards (Hotkeys, Memoization, Raw Text, displayNames).
---

# UI Pattern Verifier

Use this skill to perform end-to-end audits of TUI components to ensure they meet the project's strict engineering and aesthetic standards.

## Audit Checklist

### 1. Hotkey Formatting
- [ ] Are all hotkeys formatted as `[X]`? (e.g., `[S]tart`, `[B]ack`).
- [ ] Is the `Hotkey` component used for all interactive keys?
- [ ] Does the hotkey correctly reflect the assigned `useKeyboard` trigger?

### 2. Structural Standards
- [ ] Is the component wrapped in `React.memo`?
- [ ] Is `displayName` explicitly defined at the bottom of the file?
- [ ] Are props defined using clear, documented interfaces?

### 3. "No Raw Text" Adherence
- [ ] Are there any raw strings inside JSX that aren't wrapped in `<text>`?
- [ ] Are icon glyphs (e.g., `\ueac2`) wrapped in their own `<text>` tags if part of a larger string?

### 4. Interactive Feedback
- [ ] Do interactive elements have `onMouseOver` handlers to sync focus?
- [ ] Do they have `border` and `borderColor` that reacts to the `isFocused` state?

## Proactive Verification
When auditing a file, use `grep_search` to find all instances of `<text>` or `Hotkey` and verify they meet the above criteria. If violations are found, apply the **Root Cause Debugging** rule to ensure the fix is consistent across the codebase.
