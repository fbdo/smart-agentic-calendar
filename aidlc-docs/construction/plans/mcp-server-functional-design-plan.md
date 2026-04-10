# Functional Design Plan — Unit 5: MCP Server

## Unit Context
**Unit**: MCP Server (5 tool handlers + validators + server + composition root)
**Stories**: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 3.1, 4.1, 4.2, 5.1, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3 (17 of 18 stories)
**Dependencies**: Unit 1 (models), Unit 2 (all repositories), Unit 3 (engine), Unit 4 (analytics)
**Code location**: `src/mcp/`, `src/index.ts`
**Patterns**: 4 orchestration patterns from services.md (mutation+replan, read+status, sync replan, pure computation)

## Design Steps

- [x] Step 1: Define **input/output types** for all MCP tool handlers
  - CreateTaskInput/Output, UpdateTaskInput/Output, CompleteTaskInput/Output, etc.
  - Input types map MCP tool parameters to internal model types
  - Output types define the structured JSON response for each tool

- [x] Step 2: Define **validation rules** for all tool inputs
  - Required fields, type constraints, range constraints
  - Centralized validation in validators.ts
  - Error format for validation failures

- [x] Step 3: Define **TaskTools** business logic (Stories 1.1-1.5, 1.4, 4.1, 4.2)
  - create_task: validation → create → request replan → return task
  - update_task: validation → find → update → handle dependencies → request replan → return task
  - complete_task: validation → find → complete → record actual duration → unblock dependents → request replan
  - delete_task: validation → find → cancel → flag dependents → request replan
  - list_tasks: validation → filter → return array
  - Recurring task flow through RecurrenceManager

- [x] Step 4: Define **EventTools** business logic (Story 2.1)
  - create_event: validation → create → request replan → return event
  - update_event: validation → find → update → request replan → return event
  - delete_event: validation → find → delete → request replan → return confirmation
  - list_events: validation → date range query → return array

- [x] Step 5: Define **ScheduleTools** business logic (Stories 3.1, 5.1)
  - get_schedule: read schedule + schedule_status → return with enrichment
  - replan: await replan → return updated schedule
  - get_conflicts: read conflicts + schedule_status → return

- [x] Step 6: Define **AnalyticsTools** business logic (Stories 6.1-6.4)
  - Thin wrappers around AnalyticsEngine methods
  - Period validation at MCP layer
  - Pure computation pattern (no replan)

- [x] Step 7: Define **ConfigTools** business logic (Stories 7.1-7.3)
  - set_availability: validation → save → request replan
  - set_focus_time: validation → save → request replan
  - set_preferences: validation → merge → save → request replan
  - get_preferences: read → return full config

- [x] Step 8: Define **McpServer** setup and tool registration
  - Tool registration with descriptions, input schemas
  - Error handling wrapper (catch AppError → MCP error response)
  - stdio transport configuration

- [x] Step 9: Define **composition root** (src/index.ts)
  - DI wiring order: Database → Repos → Engine → Analytics → Tools → Server
  - Environment variable handling (DB path)

- [x] Step 10: Compile **domain entities** document
  - All input/output types per tool
  - MCP tool schema definitions

- [x] Step 11: Compile **business rules** catalog
  - Validation rules, orchestration rules, error handling rules

## Clarification Questions

### Q1: MCP tool error response format
When a tool encounters a validation error or not-found error, how should it be reported to the AI agent?

- **A) MCP protocol error**: Throw an MCP error with `isError: true` in the tool response content. The content includes a structured JSON object with `code` and `message` fields. This keeps errors within the MCP protocol's standard mechanism.
- **B) Return structured error object**: Always return a successful MCP response but include an `error` field in the JSON content with `code` and `message`. The AI agent checks for the error field.
- **C) Hybrid**: Use MCP `isError: true` for the response metadata, AND include a structured JSON body with `code`, `message`, and `details` so the agent gets both a protocol-level signal and a parseable error.

[Answer]: A

### Q2: complete_task actual duration source
Story 1.2 says "actual duration is recorded (time from first scheduled slot to completion)." How should actual duration be determined?

- **A) Agent-provided**: The `complete_task` tool accepts an optional `actual_duration_minutes` parameter. The AI agent provides the actual time spent (e.g., from user conversation or tracking). Defaults to estimated duration if not provided.
- **B) Auto-computed from schedule**: Compute from the task's first scheduled time block to the current timestamp. This is automatic but imprecise (completion might not coincide with the tool call).
- **C) Agent-provided with fallback**: Accept `actual_duration_minutes` as optional. If provided, use it. If omitted, fall back to the task's estimated duration. Never auto-compute from schedule (too imprecise for analytics).

[Answer]: A

### Q3: MCP tool parameter naming convention
MCP tool parameters are exposed to AI agents in the tool schema. What naming convention?

- **A) snake_case**: `estimated_duration`, `deadline_before`, `buffer_time_minutes` — matches MCP SDK conventions and most tool ecosystems. Requires mapping to camelCase model types internally.
- **B) camelCase**: `estimatedDuration`, `deadlineBefore`, `bufferTimeMinutes` — matches TypeScript model types directly. No mapping needed but less conventional for MCP tools.

[Answer]: A

### Q4: get_schedule response enrichment
The `get_schedule` tool returns time blocks. Should the response include task details for each block?

- **A) Enriched**: Each time block includes the task's `title`, `priority`, `category`, and `status` alongside the block's `startTime`/`endTime`. The agent gets a human-readable schedule without needing follow-up calls.
- **B) IDs only**: Time blocks include only `taskId`, `startTime`, `endTime`, `date`. The agent must call `list_tasks` separately to get task details. Keeps responses lean.
- **C) Summary enrichment**: Each time block includes `taskId`, `title`, and `priority` (minimal context) but not full task details. Balances readability with response size.

[Answer]: A
