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

### 2. Verify Assignment
**Traycer.ai** only reviews issues assigned to `repairyourtech`. Ensure the target issue is correctly assigned.
// turbo
```bash
# Replace <number> with the actual issue number
gh issue edit <number> --add-assignee repairyourtech
```

### 3. Review Traycer's Analysis
Wait for **Traycer.ai** to provide its automated analysis and suggested implementation plan in the issue comments.

### 4. Provide Feedback / Refine Plan (Optional)
If the plan requires adjustment:
- Comment on the issue: `@traycerai generate <your feedback>`
- Wait for the updated plan.

### 5. Transition to Implementation
Once the plan is approved and finalized by Traycer, switch to the [/push-changes](file:///home/birdman/schem-sync-portal/.agent/workflows/push-changes.md) workflow to begin writing and submitting the code.
