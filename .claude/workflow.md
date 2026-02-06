# Agent Workflow

## MANDATORY EXECUTION SEQUENCE

Before taking ANY action on a task, you MUST follow this exact sequence:

### 1. READ THIS FILE COMPLETELY
- You are reading MANDATORY RULES right now
- This file contains the workflow rules that govern ALL actions
- Never skip steps in this sequence

### 2. AUDIT EXISTING PATTERNS (THE "ASK" STEP)
- **CRITICAL**: Before doing ANYTHING, you MUST ask: "What are the app's existing code patterns?"
- You MUST audit:
    - **Backend**: Logic patterns, logging standards, process management.
    - **Frontend**: Component structure, state management, event handling.
    - **API**: Type definitions, request/response models, error handling.
    - **UI/UX**: Theming, hotkey standards, focus/hover behaviors.
- **Pattern Discovery Workflow** (MANDATORY when working with UI):
    1. Search for ALL occurrences: `grep -r "PATTERN_NAME" src/components/*.tsx`
    2. Read 5+ different files that use the pattern
    3. Note what is consistent AND what varies
    4. ONLY THEN document the pattern
    5. **NEVER** create "standardized" patterns that change existing code
- **Self-Correction**: If you identify anything not aligned with the audit, you MUST update yourself (and relevant instruction files) immediately.
- **Zero Defect Audit**: For recurring issues, high-stakes UI, or complex focus propagation, you MUST perform a line-by-line code-item audit. DO NOT rely on grep or summaries; read the full file to verify prop drilling and event handling.
- **Skill**: Use `audit-context-building` to perform a granular scan.

### 3. ASSESS AVAILABLE SKILLS
- Use the skills discovery mechanism to identify ALL available skills
- Review skill names and descriptions
- Determine which skills are relevant to the current task
- Load ONLY the skills that apply to this specific task
- Skills provide domain expertise - use them when available

### 4. CHECK CONNECTED MCP SERVERS
- Identify all connected MCP servers
- Understand what capabilities each server provides
- Determine which MCP tools are relevant to the current task
- MCP provides access to external systems - use when needed

### 5. IDENTIFY AVAILABLE SUBAGENTS
- Review configured subagents and their specializations
- Determine if any subagent is better suited for this task than you
- Consider spawning subagents for parallel work or specialized tasks
- Each subagent should have clear, isolated responsibilities

### 6. REVIEW APPLICABLE HOOKS
- Check which hooks are configured
- Understand what events they trigger on
- Ensure your workflow complies with hook requirements
- Hooks enforce standards automatically - don't bypass them

### 7. PLAN BEFORE EXECUTION
- Synthesize information from steps 1-6
- Create an explicit execution plan
- Identify which tools, skills, MCPs, and subagents you'll use
- Get user confirmation for complex or ambiguous tasks
- Document your plan in scratchpad or plan.md if complex
- **Workflow Mapping**: If a task involves a predefined workflow (e.g. `/push-changes`), you MUST explicitly map every step of that workflow into your `task.md` before execution.

### 8. EXECUTE WITH AWARENESS
- Follow your plan
- Use the right tool for each step (skill vs MCP vs native tool)
- Delegate to subagents when appropriate
- Monitor your context window
- Pause to re-assess if the task diverges from the plan

### 9. SELF-IMPROVEMENT CYCLE
- Once the task is complete and verified, trigger the `self-improving-agent` skill
- Analyze what happened, what went wrong, and what worked
- Extract patterns and update relevant skill files with evolution markers
- Learn from EVERY interaction to improve future performance

## WORKFLOW PRINCIPLES

| Principle | ALWAYS | Skills | Tools | MCP |
|-----------|---|---|---|---|
| **Investigate First** | Analyze codebase/reqs before changes | `audit-context-building`, `brainstorming` | `grep_search`, `find_by_name` | `context7` |
| **Root Cause Debugging** | Find underlying cause of bugs | `systematic-debugging` | `read_terminal` | `arch-mcp` |
| **End-to-End Audit** | Check all related issues | `audit-context-building` | `grep_search`, `view_code_item` | `arch-mcp` |
| **Skill Centricity** | Leverage/create skills for tasks | `find-skills`, `task-prd-creator` | `list_dir` (.agent/skills) | `search_web` |
| **Zero Lint Policy** | No errors or warnings | N/A | `run_command` (bun lint) | N/A |
| **Lifelong Learning** | Evolve codebase and skills | `self-improving-agent` | `multi_replace_file_content` | `search_web` |
| **Interactive CLI** | Use tmux for interactive tools | `using-tmux-for-interactive-commands` | `run_command` (tmux) | N/A |

### MANDATORY EXECUTION SEQUENCE (Embedded Guidance)

1. **READ Rules**: `view_file` on `workflow.md`.
2. **AUDIT Patterns**: Ask "What are the app's patterns?". Audit Backend/Frontend/API/UI/UX.
3. **ASSESS Skills**: `list_dir` on `.agent/skills/` -> Load relevant `SKILL.md`.
4. **CHECK MCP**: `list_resources` and `list_tools` on all servers.
5. **SUBAGENTS**: Use `dispatching-parallel-agents` if 2+ independent tasks.
6. **HOOKS**: Compliance check.
7. **PLAN**: Draft `implementation_plan.md` using `writing-plans`.
8. **EXECUTE**: Use `multi_replace_file_content` for non-contiguous edits.
9. **VERIFY**: `bun run lint` and `bun test` are MANDATORY.
10. **INTERACT**: Use `using-tmux-for-interactive-commands` skill for any command requiring real-time input.
11. **LEARN**: Trigger `self-improving-agent` to finalize the session.

**NEVER:**
- Jump straight to coding without assessing available resources
- Use a skill if an MCP server provides better access
- Spawn subagents unnecessarily (context is expensive)
- Bypass this workflow sequence - it exists for consistency
- **Prematurely Summary**: Never declare a task "complete" in your status or to the user until EVERY step in the mapped workflow has been verified.
- **Skip Waiting Steps**: If a workflow requires a pause (e.g., merge approval), you MUST explicitly state you are waiting. DO NOT skip to the next step or summarize the remainder as complete.
- **Create "standardized" patterns that contradict the actual codebase** - DOCUMENT WHAT EXISTS, DON'T INVENT PATTERNS
- **Apply patterns without checking 5+ files first** - ALWAYS verify against multiple examples
- **Change code to match documentation** - DOCUMENTATION SHOULD MATCH CODE, NOT THE OTHER WAY AROUND

---

## Evolution & Traceability

<!-- Evolution: 2026-01-31 | source: failure-correction-2026-01-31 | reason: Added Pattern Discovery Workflow and anti-patterns after creating wrong border patterns that contradicted the codebase. Core failure: I invented "standardized" patterns instead of documenting what exists, then followed my own wrong documentation instead of checking actual code. Added specific workflow step: check 5+ files before documenting any pattern, and NEVER change code to match documentation. -->
<!-- Evolution: 2026-02-06 | source: workflow-failure-2026-02-06 | reason: Mandated Workflow Mapping and Discipline after I prematurely summarized the /push-changes workflow as "complete" after Step 5, skipping the critical Step 7 (Finalizing/Release). Core failure: I prioritized the feeling of "progress" over the strict completion of the defined process. -->
