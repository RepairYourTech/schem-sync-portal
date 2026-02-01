# Schematic Sync Portal

**High-security TUI application for syncing schematic archives to multiple cloud providers.**

## Quick Reference

| Category | Value |
|----------|-------|
| **Runtime** | Bun (use `spawn`/`spawnSync`, NOT Node's `child_process`) |
| **UI Framework** | React TUI with `@opentui/react` |
| **Critical Rule** | "No Raw Text" - ALL JSX text must be in `<text>` components |
| **Validation** | `bun run lint` MANDATORY after all changes |
| **Hotkeys** | Use `Hotkey` component with `[X]` format |

---

## Commands

```bash
# Development
bun run dev              # Start application in development mode
bun run src/index.tsx    # Direct execution

# Testing
bun test                 # Run full test suite
bun test <filename>      # Run specific test file

# Linting (ZERO TOLERANCE)
bun run lint             # Check for errors/warnings
bun run lint:fix         # Auto-fix issues
```

**CRITICAL**: This project maintains a zero-error and zero-warning lint policy.

---

## Architecture

Three-Phase Sync Engine (`src/lib/sync.ts`):
1. **Pull Phase** - Downloads from source provider to staging directory
2. **Clean Phase** - Malware shield scans and sanitizes
3. **Cloud Phase** - Uploads to backup provider

Main views: `Splash` → `Wizard` → `Dashboard` → `SyncPortal` / `Options` / `ForensicView`

---

## Essential Guidelines

### Workflow (MANDATORY)
**ALWAYS** follow the mandatory execution sequence: Investigate → Plan → Execute → Verify → Learn
- **Full details**: [Agent Workflow](.agent/instructions/workflow.md)

### Critical Code Patterns
1. **No Raw Text**: All JSX text must be in `<text>` components (enforced by ESLint)
2. **Hotkeys**: Use `Hotkey` component, let it handle `[X]` formatting
3. **Theme**: Always use `useTheme()` hook, NEVER hardcode colors
4. **Components**: `React.memo` + explicit `displayName`
5. **Process**: Use Bun's `spawn`/`spawnSync`, rclone with `--use-json-log`

- **Full details**: [UI & Backend Patterns](.agent/instructions/patterns.md)

---

## Standard Workflows

### Bug Fixes
1. Use `systematic-debugging` skill
2. Use `Grep` to find related code
3. Use `Read` to understand context
4. Fix with `Edit` tool
5. Run `bun run lint` and `bun test`
6. Trigger `self-improving-agent` skill

### New Features
1. Use `brainstorming` skill
2. Use `EnterPlanMode` for planning
3. Use `Grep`/`Glob` to find patterns
4. Implement with `Edit`/`Write`
5. Run `bun run lint` and `bun test`
6. Trigger `self-improving-agent` skill

---

## Detailed Instructions

- **[Agent Workflow](.agent/instructions/workflow.md)** - Mandatory execution sequence
- **[Code Patterns](.agent/instructions/patterns.md)** - UI & backend patterns
- **[Architecture](.agent/instructions/architecture.md)** - Three-phase sync engine & component hierarchy
- **[Project Structure](.agent/instructions/structure.md)** - Directory layout & protected files
- **[Tech Stack](.agent/instructions/tech-stack.md)** - Runtime, frameworks, tools
- **[Development Commands](.agent/instructions/commands.md)** - Build, test, lint commands
- **[UI Pattern Verifier](.agent/instructions/ui-pattern-verifier.md)** - Component audit checklist

---

## Key Reference Files

| File | Purpose |
|------|---------|
| `src/lib/sync.ts` | Sync engine data models and three-phase architecture |
| `src/components/SyncPortal.tsx` | Main sync view with theme usage |
| `src/components/Hotkey.tsx` | Hotkey component implementation |
| `src/lib/rclone.ts` | Rclone CLI wrapper patterns |

---

## Key Skills

- `brainstorming` - For creative work and feature design
- `systematic-debugging` - For finding root cause of bugs
- `refactor` - For code improvement without behavior changes
- `self-improving-agent` - For learning and updating documentation
- `opentui` - For TUI development guidance
- `enforcing-typescript-standards` - For TypeScript best practices

<!-- Evolution: 2026-01-31 | source: agent-md-refactor | reason: Refactored from 409-line monolith to progressive disclosure structure, keeping essentials at root with links to detailed instructions -->
