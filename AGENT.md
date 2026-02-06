# 🦅 Universal Agent Instructions

**High-security TUI application for syncing schematic archives to multiple cloud providers.**

This document follows **progressive disclosure principles**. Essentials are kept here; details are organized into linked files in [.agent/instructions/](.agent/instructions/).

## 🚀 Quick Reference

| Category | Value |
|----------|-------|
| **Runtime** | Bun (use `spawn`/`spawnSync`, NOT Node's `child_process`) |
| **UI Framework** | React TUI with `@opentui/react` |
| **Critical Rule** | **"No Raw Text"** - ALL JSX text must be in `<text>` components |
| **Zero Lint** | `bun run lint` is MANDATORY after all changes |
| **Hotkeys** | Use `Hotkey` component with `[X]` format |

---

## 🛠️ Essential Commands

```bash
# Development
bun run dev              # Start application in development mode
bun run src/index.tsx    # Direct execution

# Testing & Validation
bun test                 # Run full test suite
bun run lint             # MANDATORY: Check for errors/warnings
bun run lint:fix         # Auto-fix linting issues

# Interactivity
# Use 'using-tmux-for-interactive-commands' skill for interactive CLI tools (vim, bun changeset, REPLs)
```

---

## 🧭 Project Navigation

For specific guidelines and deep context, consult the following:

| Guide | Description |
|-------|-------------|
| 🛠️ [Workflow](.agent/instructions/workflow.md) | **MANDATORY**: Sequence & standard workflows |
| 💻 [Tech Stack](.agent/instructions/tech-stack.md) | Runtime, frameworks, & third-party tools |
| 📐 [Patterns](.agent/instructions/patterns.md) | UI patterns, backend rules, & theme usage |
| 📁 [Structure](.agent/instructions/structure.md) | Directory layout & protected files |
| 📐 [Architecture](.agent/instructions/architecture.md) | Sync engine & component hierarchy |
| ⌨️ [Commands](.agent/instructions/commands.md) | Detailed CLI reference |

---

## ⚖️ Governance

- **Attribution**: Credit **BirdMan**, **Slime**, and **PD (FlexBV)** in all derivatives.
- **Workflow**: Never skip the [Mandatory Execution Sequence](.agent/instructions/workflow.md).

<!-- Manual Override: 2026-02-06 | Refactored from tool-specific instructions to universal AGENT.md standard. -->
