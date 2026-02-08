---
description: merge approved prs and create releases
---

# 🔐 Merge and Release Workflow (Maintainer Only)

> [!CAUTION]
> **THIS WORKFLOW IS FOR MAINTAINERS ONLY.** Contributors should use `/push-changes` instead.
> This file is tracked in the repository and visible to all contributors, but only maintainers can execute the release steps.

This workflow handles the final merge of approved PRs and the release process.

## Prerequisites
Before running this workflow, ensure:
- [ ] All review comments are resolved
- [ ] All CI checks pass (`verify`)
- [ ] PR has at least 1 approving review
- [ ] You have maintainer/admin access to the repository

## 🛠️ Steps

### 1. Verify PR Readiness
Check if the PR meets all requirements for merging.
// turbo
```bash
PR_NUMBER=$(gh pr view --json number -q .number)
echo "Checking PR #$PR_NUMBER merge readiness..."
gh pr view $PR_NUMBER --json reviewDecision,statusCheckRollup,mergeable
```

### 2. Merge the PR
Squash and merge the PR, verifying status checks and reviews.
// turbo
```bash
PR_NUMBER=$(gh pr view --json number -q .number)
gh pr merge $PR_NUMBER --squash --delete-branch
```

> [!IMPORTANT]
> The merge command will **fail** if requirements aren't met. This is correct behavior.
> Do NOT use `--admin` to bypass. Fix the underlying issue instead.

### 3. Finalize Release
Update version, changelog, and create GitHub release.
// turbo
```bash
git checkout main
git pull origin main
bun changeset version
# Update README.md version strings/badges if needed
git add package.json CHANGELOG.md README.md
git commit -m "chore: version bump and doc sync"
git push origin main
gh release create v$(node -p "require('./package.json').version") --generate-notes
```

---

## 🚨 Zero Bypass Policy

**You are STRICTLY FORBIDDEN from using `--admin` or any other administrative bypass to merge a Pull Request.**

Even as a maintainer, you must:
1. Ensure every review comment is addressed in code
2. Ensure every comment thread is resolved on GitHub
3. Ensure the PR has an approving review
4. Ensure all CI checks pass

Proceeding to merge without meeting these criteria is a **Critical Workflow Failure**.