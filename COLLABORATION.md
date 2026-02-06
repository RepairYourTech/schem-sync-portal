# Collaboration Guidelines 🦅

Welcome to the **Schematic Sync Portal**. We prioritize security, TUI aesthetics, and robust cross-platform stability. 

## 🛡️ The Security Charter
*   **Surgical Isolation**: New features must never interfere with the user's global `rclone.conf`.
*   **Zero-Terminal Handshake**: OAuth flows should be captured within the TUI whenever possible.
*   **Malware Shield First**: Any new sync logic for Google Drive **MUST** integrate with the Malware Shield to prevent project suspension.

## ⌨️ Contribution Workflow
1.  **Fork** the repository and create your branch from `main`.
2.  **Install dependencies**: `bun install`.
3.  **Strict Linting**: We use a custom TUI linter. Run `bun run lint` before committing.
    *   **Rule**: No raw text outside of `<text>` components.
    *   **Rule**: All numeric renders in JSX must be stringified (e.g., `{String(count)}`).
4.  **Tests**: Added or modified logic should be covered by `bun test`.
5.  **Submit PR**: Ensure your PR passes the automated GitHub Action verification.

## 📐 Coding Standards
*   **OpenTUI Patterns**: We use `ink` with `@opentui/react`. Stick to the curated color palette and layout primitives.
*   **Cross-Platform**: Do not hardcode paths. Use the [Env utility](file:///src/lib/env.ts) for OS-specific resolutions.
*   **Documentation**: If you add a new provider or feature, update the README appropriately.

## 🔒 Branch Protection
To maintain stability:
*   Direct pushes to `main` are **BLOCKED**.
*   All changes must come through a Pull Request.
*   PRs must pass the `verify` workflow (Lint + Test).

---
*Keep Right to Repair alive and thriving.*
