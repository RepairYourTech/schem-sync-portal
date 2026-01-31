# Project Structure

- `src/`: Core source code.
  - `components/`: UI components (React TUI).
  - `lib/`: Business logic, rclone wrappers, sync engine.
  - `tests/`: Comprehensive Bun test suite.
  - `index.tsx`: Main entry point.
- `.agent/`: Agent-specific documentation, PRDs, and tasks.
- `scripts/`: Maintenance and utility scripts (e.g., linting).
- `assets/`: Bundled fonts and static resources.

## Protected Files
- Do **not** modify `eslint-rules/` unless specifically asked.
- Be cautious when editing `rclone` invocation logic in `src/lib/`.
