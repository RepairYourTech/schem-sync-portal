---
name: issue-management-intel
description: "Guidelines for managing the issue lifecycle with Traycer.ai, including reporting, analysis, and implementation planning."
---

# 🧠 Issue Management Intelligence (Traycer.ai)

This skill defines how to use Traycer.ai to analyze bugs and plan enhancements for the **Schematic Sync Portal**.

## 🛠️ The Traycer Loop

Traycer.ai is configured to automatically review new issues in this repository and suggest implementation steps.

### 1. Triggering Analysis
For Traycer to review an issue, it **MUST** be assigned to the repository owner.
- **Assignee**: `repairyourtech`
- Trigger: This assignment signals Traycer to analyze the issue description and provide a solution proposal.

### 2. The Analysis Wait
Once an issue is created and assigned:
- Traycer will typically respond with a comment within minutes.
- Wait for a comment from `@traycer-ai` (or similar bot identity) containing the technical breakdown.

### 3. Reviewing Suggestions
Before starting work:
- Review Traycer's proposal for alignment with **OpenTUI patterns** and **Surgical Isolation** principles.
- Use Traycer's steps as the foundation for your `implementation_plan.md`.

## 🐙 workflow Integration

1. **Submit Issue**: Use [submit-issue.md](file:///home/birdman/schem-sync-portal/.agent/workflows/submit-issue.md) to report a bug or suggest a feature.
2. **Review & Proceed**: Once Traycer responds, use [push-changes.md](file:///home/birdman/schem-sync-portal/.agent/workflows/push-changes.md) to implement the suggested fix.

---
*Powered by Traycer.ai Intelligence.*
