# Testing Architecture

The Schem Sync Portal uses a multi-layered testing strategy to ensure reliability across state management, UI interactions, and background sync operations.

## Test Layers

### 1. Unit Tests (`src/tests/*.test.tsx`)
Isolated tests for business logic and pure components.
- **Tools**: `bun:test`, `React`
- **Focus**: Validation logic, utility functions, initial state rendering.

### 2. Behavioral Tests (`src/tests/Wizard.test.tsx`)
Verifies UI orchestration and state advancement by simulating user interactions.
- **Key Pattern**: Mocking `useKeyboard` to capture and trigger handlers.
- **Focus**: Navigation flow, configuration updates (`onUpdate`), and authentication dispatch.
- **Helpers**: `ui-test-helpers.ts` (mockRender, simulate keys).

### 3. End-to-End (E2E) Tests (`src/tests/e2e/`)
Validates full system flows spanning multiple modules and side effects.
- **Sync Flow**: Uses `mock_rclone.ts` to simulate `rclone` binary output, verifying the 3-phase sync engine (Pull -> Clean -> Cloud).
- **Wizard Completion**: Simulates a complete user journey from EMPTY_CONFIG to deployment, asserting configuration persistence (`saveConfig`).

## Rclone Simulation
We use a mock rclone script located at `src/tests/mock_rclone.ts`.
- **Purpose**: Simulates rclone's JSON log output and exit codes.
- **Usage**: Set `process.env.MOCK_RCLONE = "src/tests/mock_rclone.ts"` before running tests.
- **Execution**: The sync engine (`src/lib/sync/utils.ts`) detects this environment variable and spawns `bun run mock_rclone.ts` instead of the system `rclone`.

## Running Tests

```bash
# Run all tests
bun test

# Run with coverage (if supported by environment)
bun test --coverage

# Run linting
bun run lint
```

## Writing New Tests
1. **Mocking UI**: Always wrap in `mockRender` from `ui-test-helpers.ts`.
2. **Keyboard Interaction**: Capturing the `useKeyboard` handler is the preferred way to simulate user navigation in the TUI.
3. **Mocks**: Modules with side effects (networking, filesystem) must be mocked using `mock.module`.
