# UI Testing Guide

This guide covers testing UI interactions and patterns for TUI components.

## Overview

The UI test suite ensures that all interactive components follow standardized patterns for:
- Focus management (mouse hover, click, sub-focus)
- Visual feedback (borders, colors)
- Keyboard navigation (Tab, arrows, Enter)
- Component structure (memo, displayName)

## Test Files

| Test File | Purpose |
|-----------|---------|
| `Dashboard.test.tsx` | Tests for reference standard component |
| `SyncPortalParts.test.tsx` | Tests for panel focus preservation |
| `Hotkey.test.tsx` | Tests for Hotkey component |
| `ui-test-helpers.ts` | Reusable testing utilities |

## Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test src/tests/Dashboard.test.tsx

# Run with coverage
bun test --coverage

# Run only UI tests
bun test src/tests/*.test.tsx
```

## Test Helpers

### `mockThemeColors`

Standard theme colors for testing:

```tsx
import { mockThemeColors } from "../tests/ui-test-helpers";

<Dashboard colors={mockThemeColors} />
```

### `isBorderPatternCompliant`

Checks if border follows standardized pattern:

```tsx
import { isBorderPatternCompliant } from "../tests/ui-test-helpers";

const compliant = isBorderPatternCompliant(
    { border: true, borderStyle: "single", borderColor: "#00ff00" },
    true // isFocused
);
```

### `createMockFocusCallbacks`

Creates trackable mock callbacks:

```tsx
import { createMockFocusCallbacks } from "../tests/ui-test-helpers";

const mocks = createMockFocusCallbacks();
<Dashboard onFocusChange={mocks.onFocusChange} />

// Later:
expect(mocks._calls.onFocusChange).toBe(1);
```

### `testFocusPreservation`

Tests sub-focus preservation on hover:

```tsx
import { testFocusPreservation } from "../tests/ui-test-helpers";

const result = testFocusPreservation(onFocus, 2);
expect(result.passed).toBe(true);
expect(result.subFocusPreserved).toBe(true);
```

### `validateVisualFeedback`

Validates visual feedback hierarchy:

```tsx
import { validateVisualFeedback } from "../tests/ui-test-helpers";

const result = validateVisualFeedback({
    isFocused: true,
    borderVisible: true,
    borderColor: "#00ff00",
});
expect(result.valid).toBe(true);
```

## Writing New Tests

### Template for Interactive Components

```tsx
/** @jsxImportSource @opentui/react */
import { describe, it, expect } from "bun:test";
import React from "react";
import { YourComponent } from "../components/YourComponent";
import { mockThemeColors, createMockFocusCallbacks } from "../tests/ui-test-helpers";

describe("YourComponent", () => {
    describe("Focus Management", () => {
        it("should sync focus on mouse hover", () => {
            const mocks = createMockFocusCallbacks();

            render(
                <YourComponent
                    colors={mockThemeColors}
                    onFocusChange={mocks.onFocusChange}
                />
            );

            // Simulate hover
            // Verify mocks._calls.onFocusChange > 0
        });

        it("should preserve sub-focus on hover", () => {
            let subFocusPreserved = false;

            render(
                <YourComponent
                    colors={mockThemeColors}
                    isFocused={true}
                    subFocusIndex={2}
                    onFocus={(keepSubFocus) => {
                        subFocusPreserved = keepSubFocus === true;
                    }}
                />
            );

            expect(subFocusPreserved).toBe(true);
        });
    });

    describe("Visual Feedback", () => {
        it("should show border when focused", () => {
            render(
                <YourComponent
                    colors={mockThemeColors}
                    isFocused={true}
                />
            );

            // Verify border is visible and colors.success
        });

        it("should hide border when unfocused", () => {
            render(
                <YourComponent
                    colors={mockThemeColors}
                    isFocused={false}
                />
            );

            // Verify border is transparent
        });
    });

    describe("Component Structure", () => {
        it("should be wrapped in React.memo", () => {
            expect(YourComponent.displayName).toBeDefined();
        });

        it("should have explicit displayName", () => {
            expect(YourComponent.displayName).toBe("YourComponent");
        });
    });
});
```

## Test Coverage Goals

### Minimum Coverage

- [ ] All interactive components have tests
- [ ] Focus management tested (hover, click, sub-focus)
- [ ] Visual feedback tested (border, colors)
- [ ] Component structure validated (memo, displayName)

### Priority Components

1. ✅ Dashboard (reference standard)
2. ✅ SyncPortal panels (focus preservation bugs)
3. ✅ Hotkey (core component)
4. ⏳ Wizard (complex, needs dedicated tests)
5. ⏳ Options (tab navigation)
6. ⏳ ForensicView (simple)

## Anti-Pattern Detection

### Semi-Transparent Border Hack

**Bad**: `colors.dim + "33"`
**Good**: `"transparent"`

Test for this:

```tsx
import { hasBorderAntiPattern } from "../tests/ui-test-helpers";

it("should not use semi-transparent border hack", () => {
    const borderColor = "transparent";
    expect(hasBorderAntiPattern(borderColor)).toBe(false);
});
```

### Focus Reset Bug

**Bad**: `onMouseOver={() => onFocus?.(false)}`
**Good**: `onMouseOver={() => onFocus?.(true)}`

Test for this:

```tsx
import { testFocusPreservation } from "../tests/ui-test-helpers";

it("should preserve sub-focus on hover", () => {
    const result = testFocusPreservation(onFocus, 2);
    expect(result.passed).toBe(true);
});
```

## Continuous Integration

These tests should run on:
- Every commit (pre-commit hook)
- Every pull request
- Before merging to main

## Debugging Failed Tests

### Checklist

1. **Is the pattern documented?**
   - Check `.agent/instructions/patterns.md`
   - Verify test matches documented pattern

2. **Is the component compliant?**
   - Run audit: check against Dashboard reference
   - Use `ui-pattern-verifier` skill

3. **Is the test correct?**
   - Verify mock callbacks are properly configured
   - Check event simulation is accurate

4. **Is there a regression?**
   - Check recent commits for changes
   - Compare with working version

## Common Issues

### Issue: "Sub-focus reset to 0 on hover"

**Cause**: `onMouseOver={() => onFocus?.(false)}`
**Fix**: Change to `onMouseOver={() => onFocus?.(true)}`

### Issue: "Border color inconsistency"

**Cause**: Using `colors.dim + "33"` or `colors.border`
**Fix**: Standardize on `"transparent"`

### Issue: "Test can't detect focus changes"

**Cause**: Not tracking callback invocations
**Fix**: Use `createMockFocusCallbacks()` helper

## Resources

- [Pattern Documentation](../agent/instructions/patterns.md)
- [Audit Report](../audits/2026-01-31-ui-pattern-audit.md)
- [UI Pattern Verifier](../agent/instructions/ui-pattern-verifier.md)

## Evolution

<!-- Evolution: 2026-01-31 | source: ui-audit-2026-01-31 | reason: Created comprehensive UI testing guide and test suite to catch focus management and visual feedback issues that were identified in the UI pattern audit -->
