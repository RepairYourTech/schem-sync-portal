---
name: issue-resolution-workflow
description: "Use when addressing already submitted issues - guides identification, assignment to repairyourtech for Traycer.ai review, feedback iteration, and transition to implementation."
---

# 🛠️ Issue Resolution Workflow

This skill provides a structured approach to addressing issues that have already been submitted to the repository. It emphasizes the use of **Traycer.ai** for initial analysis and plan generation to ensure high-quality and consistent implementations.

## When to Use This Skill

Use this skill when:
- You are starting work on an existing issue.
- You want to leverage **Traycer.ai** for automated analysis of a reported bug or feature request.
- You need to iterate on a proposed implementation plan using AI feedback.

## 📋 Core Workflow

### 1. Issue Discovery & Identification
Before starting any development, you must identify the correct issue. Use the GitHub CLI to search for and view the details of existing issues.

```bash
# List all open issues
gh issue list

# View details and comments of a specific issue
gh issue view <issue-number>
```

### 2. Triggering Traycer.ai Review
**Traycer.ai** only analyzes issues that are assigned to `repairyourtech`. If the issue you are working on is not assigned to this user, you must add the assignment to trigger the automated review.

```bash
# Assign the issue to the repairyourtech user
gh issue edit <issue-number> --add-assignee repairyourtech
```

### 3. Reviewing Traycer's Plan
Once assigned, **Traycer.ai** will analyze the issue and post its findings and a suggested implementation plan as a comment. 

**CRITICAL:** If a plan already exists from a previous generation, you MUST assess it first. DO NOT trigger a new generation unless you determine the existing plan is missing critical information or requires significant changes.

Review the plan for:
- Correctness and technical feasibility.
- Alignment with the project's architecture and design patterns.
- Thoroughness of the proposed changes and verification steps.

### 4. Plan Iteration
If the existing plan is incomplete, requires adjustment, or clarification, you can interact with the bot by commenting on the issue. **Only use this if a meaningful change to the plan is required.**

**Interaction Pattern:**
- Post a comment: `@traycerai generate <describe the EXACT changes, omissions, or clarifications needed>`
- Wait for Traycer to respond with a revised plan.

### 5. Moving to Implementation
Once you have a satisfactory and approved plan from Traycer, transition to the **[/push-changes](file:///home/birdman/schem-sync-portal/.agent/workflows/push-changes.md)** workflow.

1. Create a new branch for the fix.
2. Implement the changes as outlined in the approved plan.
3. Verify with tests and linting.
4. Submit the PR for final review.

## 💡 Best Practices

- **Read first**: Always read through the entire issue history and Traycer's comments before starting work.
- **Specific feedback**: When asking Traycer for a refined plan, be specific about what needs to change (e.g., "instead of modifying X, use the Y utility").
- **Verification is key**: Even if Traycer provides a plan, you are responsible for the final verification using the project's testing suite.
