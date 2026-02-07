---
description: Automated workflow for submitting issues and triggering Traycer.ai review.
---

# 📝 Submit Issue Workflow

This workflow automates the creation of an issue and the mandatory assignment to `repairyourtech` to trigger a **Traycer.ai** review.

## 🛠️ Steps

### 1. Identify the Task
Determine if you are reporting a bug or requesting an enhancement.

### 2. Create the Issue
Open the issue using the GitHub CLI.
// turbo
```bash
# Example for a bug
gh issue create --title "bug: [component] description" --body "Steps to reproduce..." --label "bug"

# Example for an enhancement
gh issue create --title "feat: [component] description" --body "Proposed feature..." --label "enhancement"
```

> [!TIP]
> Use the `using-tmux-for-interactive-commands` skill for the `gh issue create` command if you need to handle interactive prompts for title or body.

### 3. Mandatory Assignment
Traycer.ai only reviews issues assigned to `repairyourtech`.
// turbo
```bash
# Assign the most recently created issue to the owner
gh issue edit $(gh issue list --limit 1 --json number --jq '.[0].number') --add-assignee repairyourtech
```

### 4. Wait for Traycer
Monitor the issue until **Traycer.ai** provides an automated analysis and suggested code changes.

> [!IMPORTANT]
> If a plan already exists, **assess it immediately**. Do not proceed to Step 5 unless the plan is objectively insufficient.

### 5. Iterate (Optional)
If the suggested plan needs changes, remediation of errors, or missing logic:
- Reply to Traycer's comment with `@traycerai generate <describe exactly what needs to be changed or added>`.
- Wait for the updated plan.

### 6. Transition to Implementation
Once Traycer has responded with a satisfactory plan, proceed with the [/push-changes](file:///home/birdman/schem-sync-portal/.agent/workflows/push-changes.md) workflow to implement the fix.
