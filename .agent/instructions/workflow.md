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

**ALWAYS:**
- **Investigate First**: Thoroughly analyze the codebase and requirements before proposing or implementing changes. No "quick fixes".
- **Root Cause Debugging**: When solving bugs, find the underlying cause. Never apply "code on top" to mask symptoms.
- **End-to-End Audit**: Never stop at the first issue found. Perform a comprehensive audit to uncover all related issues, ensuring a maintainable approach for future additions.
- **Skill Centricity**: Leverage existing skills for all tasks. If a capability is missing, find a relevant skill or create a new one.
- **Zero Lint Policy**: Adhere to a strict zero-error and zero-warning policy for all linting and type checks.
- Check what's available before deciding how to proceed
- Use the most appropriate tool/skill/MCP for each sub-task
- Consider parallelization opportunities via subagents
- Document complex decisions and reasoning
- Verify your output matches requirements

**NEVER:**
- Jump straight to coding without assessing available resources
- Use a skill if an MCP server provides better access
- Spawn subagents unnecessarily (context is expensive)
- Bypass this workflow sequence - it exists for consistency
