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

## 🤖 Agent Tooling
If you are contributing using an AI agent, please utilize the local resources in the `.agent/` directory:
*   **Workflows**: Use `/push-changes` to automate the branching, changeset, and PR creation process.
*   **Skills**: Ensure your agent loads the `opentui` and `git-release-management` skills to maintain project standards.

## 📐 Coding Standards
*   **OpenTUI Patterns**: We use `ink` with `@opentui/react`. Stick to the curated color palette and layout primitives.
*   **Cross-Platform**: Do not hardcode paths. Use the [Env utility](file:///src/lib/env.ts) for OS-specific resolutions.
*   **Documentation**: If you add a new provider or feature, update the README appropriately.

## ⚖️ Governance & Redistribution
*   **License**: This project uses the **BirdMan-Slime Attribution License**. 
*   **Mandatory Attribution**: You MUST credit **BirdMan**, **Slime**, and **PD (FlexBV)** in all forks.
*   **Link Persistence**: The **FlexBV** and **Slime** links in the TUI footer are protected. Removal of these links is a violation of the license.
*   **CODEOWNERS**: Review from `@RepairYourTech` is mandatory for security-sensitive modules.

---
*Keep Right to Repair alive and thriving.*

---
*Keep Right to Repair alive and thriving.*
