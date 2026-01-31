# Agent Workflow

## MANDATORY EXECUTION SEQUENCE

Before taking ANY action on a task, you MUST follow this exact sequence:

### 1. READ THIS FILE COMPLETELY
- You are reading MANDATORY RULES right now
- This file contains the workflow rules that govern ALL actions
- Never skip steps in this sequence

### 2. ASSESS AVAILABLE SKILLS
- Use the skills discovery mechanism to identify ALL available skills
- Review skill names and descriptions
- Determine which skills are relevant to the current task
- Load ONLY the skills that apply to this specific task
- Skills provide domain expertise - use them when available

### 3. CHECK CONNECTED MCP SERVERS
- Identify all connected MCP servers
- Understand what capabilities each server provides
- Determine which MCP tools are relevant to the current task
- MCP provides access to external systems - use when needed

### 4. IDENTIFY AVAILABLE SUBAGENTS
- Review configured subagents and their specializations
- Determine if any subagent is better suited for this task than you
- Consider spawning subagents for parallel work or specialized tasks
- Each subagent should have clear, isolated responsibilities

### 5. REVIEW APPLICABLE HOOKS
- Check which hooks are configured
- Understand what events they trigger on
- Ensure your workflow complies with hook requirements
- Hooks enforce standards automatically - don't bypass them

### 6. PLAN BEFORE EXECUTION
- Synthesize information from steps 1-5
- Create an explicit execution plan
- Identify which tools, skills, MCPs, and subagents you'll use
- Get user confirmation for complex or ambiguous tasks
- Document your plan in scratchpad or plan.md if complex

### 7. EXECUTE WITH AWARENESS
- Follow your plan
- Use the right tool for each step (skill vs MCP vs native tool)
- Delegate to subagents when appropriate
- Monitor your context window
- Pause to re-assess if the task diverges from the plan

## WORKFLOW PRINCIPLES

| Principle | ALWAYS | Skills | Tools | MCP |
|-----------|---|---|---|---|
| **Investigate First** | Analyze codebase/reqs before changes | `audit-context-building`, `brainstorming` | `grep_search`, `find_by_name` | `context7` |
| **Root Cause Debugging** | Find underlying cause of bugs | `systematic-debugging` | `read_terminal` | `arch-mcp` |
| **End-to-End Audit** | Audit all related issues | `audit-context-building` | `grep_search`, `view_code_item` | `arch-mcp` |
| **Skill Centricity** | Leverage/create skills for tasks | `find-skills` | `list_dir` (.agent/skills) | `search_web` |
| **Zero Lint Policy** | No errors or warnings | N/A | `run_command` (bun lint) | N/A |

### MANDATORY EXECUTION SEQUENCE (Embedded Guidance)

1. **READ Rules**: `view_file` on `workflow.md`.
2. **ASSESS Skills**: `list_dir` on `.agent/skills/` -> Load relevant `SKILL.md`.
3. **CHECK MCP**: `list_resources` and `list_tools` on all servers.
4. **SUBAGENTS**: Use `dispatching-parallel-agents` if 2+ independent tasks.
5. **HOOKS**: Compliance check.
6. **PLAN**: Draft `implementation_plan.md` using `writing-plans`.
7. **EXECUTE**: Use `multi_replace_file_content` for non-contiguous edits.
8. **VERIFY**: `bun run lint` and `bun test` are MANDATORY.

**NEVER:**
- Jump straight to coding without assessing available resources
- Use a skill if an MCP server provides better access
- Spawn subagents unnecessarily (context is expensive)
- Bypass this workflow sequence - it exists for consistency
