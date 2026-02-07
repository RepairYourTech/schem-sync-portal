---
description: Automated workflow for branching, changesets, and PR creation.
---

# 🚀 Push Changes Workflow

This workflow automates the process of pushing changes to a feature branch, adding a changeset, and opening a Pull Request.

## 🛠️ Steps

### 1. Environment Check
Check your current branch and status.
// turbo
```bash
git branch --show-current
git status
```

### 2. Branch Preparation
If not already on a feature branch, create one.
```bash
git checkout -b feature/your-feature-name
```

### 3. Add Changeset
Document your changes for the changelog.
> [!TIP]
> Use the `using-tmux-for-interactive-commands` skill for the `bun changeset` command to handle interactive prompts.

// turbo
```bash
# If using manual mode:
bun changeset

# If using tmux skill:
# tmux new-session -d -s changeset "bun changeset add"
# tmux send-keys -t changeset Enter ...
```

### 4. Commit and Push
Stage all changes and push to origin.
// turbo
```bash
git add .
git commit -m "feat: your description"
git push origin $(git branch --show-current)
```

### 5. Create Pull Request
Open a PR on GitHub using the `gh` CLI.
> [!IMPORTANT]
> You MUST include "Fixes #<issue-number>" (or "Closes #<issue-number>") in the body to ensure the issue is automatically closed on merge.

// turbo
```bash
gh pr create --title "feat: your description" --body "Detailed description of changes\n\nFixes #<issue-number>"
```

### 6. CodeRabbit Review
Wait for **CodeRabbit** to provide feedback. Address all critical items and ensure the review is approved/passed before proceeding to merge.

### 7. Finalizing (On Main after Merge)
Once the PR is merged, run this to finalize the version bump:
// turbo
```bash
git checkout main
git pull origin main
bun changeset version
# Manually update README.md version strings/badges
git add package.json CHANGELOG.md README.md
git commit -m "chore: version bump and doc sync"
git push origin main
gh release create v$(node -p "require('./package.json').version") --generate-notes
```
