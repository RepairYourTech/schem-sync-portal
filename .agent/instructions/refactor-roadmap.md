# UI Architecutral Refactor Roadmap

> [!IMPORTANT]
> This file documents the technical debt accumulated in the TUI (Terminal User Interface) layer and provides a "Session Prompt" to resolve it once the MVP is stable.

## 🚩 Current Problems (Technical Debt)

1. **Lack of Style Inheritance**: The TUI uses raw `<box>` and `<text>` primitives instead of themed components. This means every view (Dashboard, Wizard, Options, Sync) must manually re-implement focus colors and borders, leading to "style drift."
2. **Component Silos**: Major UI elements (Header, Footer, Panels) are duplicated across files rather than being shared. A change to the Header in one view does not automatically propagate to others.
3. **Prop Drilling Nightmare**: The global `AppContent.tsx` passes down dozens of state variables (`focusArea`, `selectedIndex`, `isFocused`) to every child. This makes the code brittle and hard to extend.
4. **Hardcoded State Unions**: Types like `FocusArea` were originally hardcoded strings instead of extensible types, requiring mass search-and-replace for simple upgrades.

---

## 🚀 The Fix (Future Work)

The goal is to move from **Manual Construction** to a **Primitive Design System**.

### 1. Create Core UI Primitives
Extract raw tags into a set of standard components in `src/components/ui/`:
- `StandardBox`: Automatically handles `isFocused` borders using `colors.success`.
- `StandardText`: Automatically uses `colors.fg` and supports `dim` or `bold` variants.
- `PanelContainer`: A reusable base for all full-screen views.

### 2. Unified Navigation Controller
Decouple the "Tab" and "Arrow" logic from `AppContent.tsx`. Individual views should just receive a focused signal and report their own sub-indices to a central `NavigationManager`.

---

## 📝 Future Session Prompt
**Paste the following text into a new session to trigger the refactor:**

```markdown
I need to execute the "UI Architectural Refactor" as described in `.agent/instructions/refactor-roadmap.md`. 
The goal is to stop the "style drift" between different views (Dashboard, Sync, Options, etc) by creating a set of UI primitives.

Steps:
1. Create `src/components/ui/` with `StandardBox`, `StandardText`, and `ViewContainer`.
2. Refactor `AppContent.tsx` to use these primitives instead of raw tags.
3. Unify the "Header" and "Footer" into single components shared by ALL views.
4. Replace hardcoded union type checks (like `"body" | "footer"`) with the unified `FocusArea` type everywhere.
5. Verify that all views react identically to focus changes (green borders, consistent labels).
```
