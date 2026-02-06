# Development Commands

### Development
- `bun run dev`: Start the application in development mode.
- `bun run src/index.tsx`: Direct execution.

### Testing
- `bun test`: Run the full test suite.
- `bun test <filename>`: Run a specific test file.

### Linting
- **CRITICAL**: Maintain a zero-error and zero-warning state.
- **Workflow**: `bun run lint` -> `bun run lint:fix` -> manually fix remaining.
- **Tools**: `run_command`, `multi_replace_file_content`.
- **Skills**: `remove-ai-comments` (to clean up noise before linting).

### Interactive Commands
- **Interactive tools** (e.g., `bun changeset`, `vim`, `git add -p`) MUST be run via the `using-tmux-for-interactive-commands` skill.
- **Workflow**: `tmux new-session` -> `send-keys` -> `capture-pane` -> `kill-session`.
