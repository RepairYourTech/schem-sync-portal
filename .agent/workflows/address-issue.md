---
description: addressing already submitted issues
---
# 🛠️ Address Issue Workflow

This workflow is for when you need to start work on an issue that has already been created in the repository. It focuses on leveraging **Traycer.ai** for initial analysis and plan generation.

## 🛠️ Steps

### 1. Identify the Target Issue
Find the issue you need to address using the GitHub CLI.
// turbo
```bash
# List open issues to find the correct number
gh issue list
```

> [!TIP]
> If any command requires interactive input (e.g., selecting from a list), consider using the `using-tmux-for-interactive-commands` skill.

### 2. Verify Assignment
**Traycer.ai** only reviews issues assigned to `repairyourtech`. Ensure the target issue is correctly assigned.
// turbo
```bash
# Replace <number> with the actual issue number
gh issue edit <number> --add-assignee repairyourtech
```

### 3. Review Traycer's Analysis
Wait for **Traycer.ai** to provide its automated analysis and suggested implementation plan in the issue comments. 

> [!IMPORTANT]
> If a plan already exists, **assess it immediately**. Do not proceed to Step 4 unless the plan is objectively insufficient.

### 4. Provide Feedback / Refine Plan (Optional)
If the existing plan requires adjustment, remediation of errors, or missing logic:
- Comment on the issue: `@traycerai generate <describe exactly what needs to be changed or added>`
- Wait for the updated plan.

### 5. Transition to Implementation
Once the plan is approved and finalized by Traycer, switch to the [/push-changes](file:///home/birdman/schem-sync-portal/.agent/workflows/push-changes.md) workflow to begin writing and submitting the code.
