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
Wait for **CodeRabbit** to provide feedback. The agent checks for comments from `coderabbitai`.
// turbo
```bash
echo "Waiting for CodeRabbit review (polling for up to 5 minutes)..."
PR_NUMBER=$(gh pr view --json number -q .number)
for i in {1..10}; do
  COMMENTS=$(gh pr view $PR_NUMBER --json comments -q '.comments | map(select(.author.login == "coderabbitai" or .author.login == "coderabbitai[bot]")) | length')
  if [ "$COMMENTS" -gt "0" ]; then
    echo "CodeRabbit review received!"
    gh pr view $PR_NUMBER --comments
    break
  fi
  echo "Attempt $i/10: Review not yet found. Waiting 30s..."
  sleep 30
done
```
**ACTION REQUIRED**: Read the comments output above. Address all critical items in code before proceeding.

> [!CAUTION]
> **ZERO BYPASS POLICY**: You are STRICTLY FORBIDDEN from using `--admin` or any other administrative bypass to merge a Pull Request. Proceeding to merge without meeting all criteria is a **Critical Workflow Failure**.

### 6.1 Address and Resolve Review Comments
For each review comment from CodeRabbit or human reviewers:
1. **Read** the comment and understand the feedback
2. **Implement** the fix in code
3. **Commit and push** the fix
4. **Resolve** the thread programmatically via GraphQL API

// turbo
```bash
# Get PR number
PR_NUMBER=$(gh pr view --json number -q .number)

# List all unresolved review threads
echo "Fetching unresolved review threads..."
THREADS=$(gh api graphql -f query='
  query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            comments(first: 1) {
              nodes { body author { login } }
            }
          }
        }
      }
    }
  }
' -f owner="RepairYourTech" -f repo="schem-sync-portal" -F pr=$PR_NUMBER)

echo "$THREADS" | jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)'
```

After addressing each comment in code and pushing fixes, resolve all threads:
// turbo
```bash
# Resolve all unresolved threads (only after fixes are pushed!)
PR_NUMBER=$(gh pr view --json number -q .number)
THREAD_IDS=$(gh api graphql -f query='
  query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100) {
          nodes { id isResolved }
        }
      }
    }
  }
' -f owner="RepairYourTech" -f repo="schem-sync-portal" -F pr=$PR_NUMBER \
  | jq -r '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | .id')

for THREAD_ID in $THREAD_IDS; do
  echo "Resolving thread: $THREAD_ID"
  gh api graphql -f query='
    mutation($threadId: ID!) {
      resolveReviewThread(input: {threadId: $threadId}) {
        thread { isResolved }
      }
    }
  ' -f threadId="$THREAD_ID"
done
echo "All review threads resolved."
```

### 6.2 Verify and Merge
Confirm all checks pass and merge the PR (NO admin bypass).
// turbo
```bash
PR_NUMBER=$(gh pr view --json number -q .number)

# Verify all requirements are met
echo "Checking PR merge readiness..."
gh pr view $PR_NUMBER --json reviewDecision,statusCheckRollup,mergeable

# Wait for CI to pass and merge (this will fail if requirements aren't met - that's correct behavior)
gh pr merge $PR_NUMBER --squash --delete-branch
```

> [!IMPORTANT]
> The merge command above will **fail** if:
> - Unresolved review threads remain
> - Required status checks haven't passed
> - No approving review exists
> 
> This is correct behavior. Do NOT use `--admin` to bypass. Fix the underlying issue instead.

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
