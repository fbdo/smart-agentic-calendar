# Personas — Smart Agentic Calendar MCP Server

---

## Persona 1: Alex — The AI Agent

**Role**: AI assistant (e.g., Claude) acting as a personal scheduling assistant via MCP tools

**Characteristics**:
- Interacts exclusively through MCP tool calls (JSON in, JSON out)
- Has no visual understanding of the schedule — relies entirely on structured data
- Makes multiple sequential tool calls to accomplish user goals (e.g., create task → check schedule → report to user)
- Operates on behalf of the end user, translating natural language requests into tool calls
- Has conversation context about the user's intent but no persistent memory across sessions

**Goals**:
- Create, update, and manage tasks and events efficiently on behalf of the user
- Retrieve the current schedule and present it conversationally
- Understand scheduling conflicts and communicate them clearly to the user
- Provide productivity insights and schedule health summaries
- Handle errors gracefully and communicate actionable feedback to the user

**Frustrations**:
- Ambiguous error messages that don't explain what went wrong or how to fix it
- Inconsistent response formats across different tools
- Missing information in tool responses that requires additional calls to piece together
- Silent failures where a tool appears to succeed but produces unexpected state
- Lack of context in conflict alerts (e.g., "deadline infeasible" without explaining why or what to do)

---

## Persona 2: Sam — The End User

**Role**: Knowledge worker who uses an AI assistant to manage their daily schedule

**Characteristics**:
- Never interacts directly with the MCP server — all interaction is through the AI agent
- Speaks in natural language: "Schedule 2 hours for the report, due Friday, high priority"
- Has varying workloads — some days packed, some days light
- Values focus time for deep work (coding, writing, analysis)
- Juggles tasks with different urgencies, durations, and deadlines

**Goals**:
- Have a well-organized daily schedule without manually arranging time blocks
- Protect focus time for deep concentration work
- Never miss deadlines due to poor planning
- Understand at a glance how their week looks (via the agent)
- Get early warnings when the schedule is overcommitted

**Frustrations**:
- Being overbooked without warning
- Important tasks getting pushed out by less important ones
- Schedule that changes too drastically after minor updates
- Not knowing when a deadline is at risk until it's too late
- Rigid schedules that don't adapt when priorities shift

---

## Persona 3: Jordan — The Developer

**Role**: Developer who builds, maintains, and extends the MCP server

**Characteristics**:
- Reads and modifies the codebase directly
- Runs tests, debugs scheduling algorithm behavior, inspects SQLite data
- Needs to understand the constraint satisfaction solver's behavior for tuning
- May extend the server with new tools or modify scheduling heuristics

**Goals**:
- Clear, well-typed code with strong separation of concerns (storage / scheduler / MCP layer)
- Reliable test suite that catches scheduling edge cases (supported by property-based tests)
- Understandable scheduling algorithm that can be tuned without breaking invariants
- Consistent MCP tool patterns that are easy to extend with new tools

**Frustrations**:
- Scheduling bugs that only manifest with specific combinations of tasks/constraints
- Unclear boundaries between storage, scheduling, and MCP layers
- Tests that pass but don't cover the edge cases that matter
- Algorithm behavior that's hard to reason about or predict

---

## Persona-to-Epic Mapping

| Epic | Alex (AI Agent) | Sam (End User) | Jordan (Developer) |
|---|---|---|---|
| Task Management | Primary | Indirect (via agent) | Maintenance |
| Event Management | Primary | Indirect (via agent) | Maintenance |
| Scheduling Engine | Primary | Beneficiary | Primary (tuning/debugging) |
| Recurring Tasks | Primary | Indirect (via agent) | Maintenance |
| Conflict Detection | Primary | Beneficiary | Maintenance |
| Analytics | Primary | Beneficiary | Maintenance |
| Configuration | Primary | Indirect (via agent) | Maintenance |
