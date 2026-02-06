---
name: git-release-management
description: "Guidelines and automation for managing the release lifecycle of the Schematic Sync Portal, including branching, commits, changesets, and GitHub PRs."
---

# 🚀 Git Release Management Skill

This skill provides the standards and procedures for the **Schematic Sync Portal** release flow.

## 📌 Branching Strategy

Follow a standard feature-branch workflow:
- `main`: Stable production-ready code.
- `feature/*`: New features and enhancements.
- `fix/*`: Bug fixes.
- `chore/*`: Maintenance tasks, dependency updates, or internal tooling changes.

## 💬 Commit Standards

Use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:`: A new feature.
- `fix:`: A bug fix.
- `chore:`: Changes that don't modify src or test files.
- `refactor:`: A code change that neither fixes a bug nor adds a feature.
- `docs:`: Documentation only changes.

## 🦋 Changeset Usage

We use `@changesets/cli` to automate versioning and changelogs. To ensure portability across environments without global installs, we use `bunx` via `package.json` scripts.

1. **Add a Changeset**: Run `bun changeset` (which executes `bunx @changesets/cli`) before pushing your feature branch.
2. **Version Bump**: Once a PR is merged into `main`, run `bun changeset version` locally on `main` to update `package.json`, `CHANGELOG.md`, and `README.md`.

## 🐙 GitHub Integration

Use the GitHub CLI (`gh`) for seamless PR management:
- **Create PR**: `gh pr create --title "..." --body "..."`
- **Review Requirement**: All PRs **MUST** receive a positive review from **CodeRabbit** before merging. Address all high-priority suggestions.
- **View Status**: `gh pr status`
- **Merge**: `gh pr merge --squash --delete-branch`

---

## 🛠️ Automated Steps

### 1. Preparing a Change
- Ensure you are on a feature branch.
- Run `bun run lint` and `bun test`.
- Add a changeset: `bun changeset`.

### 2. Finalizing a Release
- Merge the PR on GitHub.
- Checkout `main` and `git pull`.
- Run `bun changeset version`.
- **Sync Documentation**: Update the version badge and any hardcoded strings in `README.md` to match the new version.
- Commit the version bump and doc sync: `git commit -am "chore: version bump and README update"`.
- Push to origin: `git push origin main`.
- Tag the release: `gh release create vX.Y.Z`.
