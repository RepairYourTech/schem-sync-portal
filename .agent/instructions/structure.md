# Project Structure

## High-Level Organization

- `src/`: Core source code.
  - `components/`: UI components (React TUI).
  - `lib/`: Business logic, rclone wrappers, sync engine.
  - `tests/`: Comprehensive Bun test suite.
  - `index.tsx`: Main entry point.
- `.agent/`: Agent-specific documentation, PRDs, and tasks.
- `scripts/`: Maintenance and utility scripts (e.g., linting).
- `assets/`: Bundled fonts and static resources.
- `memory/`: Multi-memory store for `self-improving-agent` (Semantic, Episodic, Working).

## Detailed Directory Layout & Architecture

For the complete directory structure and three-phase sync engine details, see:
- **[Architecture](.agent/instructions/architecture.md)** - Full directory tree, component hierarchy, and sync phases

## Protected Files

- **DO NOT** modify `eslint-rules/` unless specifically asked
- Be cautious when editing rclone invocation logic in `src/lib/rclone.ts`
- Configuration files in user's `~/.config/schem-sync-portal/` are user data
