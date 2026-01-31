# Development Commands

### Development
- `bun run dev`: Start the application in development mode.
- `bun run src/index.tsx`: Direct execution.

### Testing
- `bun test`: Run the full test suite.
- `bun test <filename>`: Run a specific test file.

### Linting
- **CRITICAL**: Maintain a zero-error and zero-warning state.
- `bun run lint`: Run the full linting suite (includes TUI-specific checks).
- `bun run lint:fix`: Attempt to automatically fix linting issues.
- `eslint src --fix`: Run ESLint fixer directly.
