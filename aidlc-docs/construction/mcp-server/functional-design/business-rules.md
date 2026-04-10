# Business Rules — Unit 5: MCP Server

## Design Decisions Applied

| Decision | Choice |
|----------|--------|
| Error response format | MCP `isError: true` with structured JSON (Q1: A) |
| Actual duration source | Agent-provided, defaults to estimated (Q2: A) |
| Parameter naming | snake_case for all MCP tool parameters (Q3: A) |
| Schedule enrichment | Full enrichment with title, priority, category, status (Q4: A) |

---

## 1. Validation Rules

### VR-1: Required Field Validation
- **Rule**: All required fields must be present and non-empty
- **Required fields by tool**:
  - `create_task`: `title`, `estimated_duration`
  - `update_task`: `task_id` (plus at least one update field)
  - `complete_task`: `task_id`
  - `delete_task`: `task_id`
  - `create_event`: `title`, plus (`start_time` + `end_time`) or (`is_all_day` + `date`)
  - `update_event`: `event_id` (plus at least one update field)
  - `delete_event`: `event_id`
  - `list_events`: `start_date`, `end_date`
  - `get_schedule`: `start_date`, `end_date`
  - `get_productivity_stats`, `get_estimation_accuracy`, `get_time_allocation`: `period`
  - `set_availability`: `windows` (non-empty array)
  - `set_focus_time`: `blocks` (non-empty array)
  - `set_preferences`: at least one preference field
- **Error**: `ValidationError("field_name is required")`

### VR-2: Title Validation
- **Rule**: `title` must be a non-empty string after trimming whitespace
- **Applies to**: `create_task`, `create_event`
- **Error**: `ValidationError("title is required")`

### VR-3: Duration Validation
- **Rule**: `estimated_duration` must be a positive integer (> 0)
- **Applies to**: `create_task`, `update_task` (when present)
- **Error**: `ValidationError("duration must be a positive number of minutes")`

### VR-4: Actual Duration Validation
- **Rule**: `actual_duration_minutes` must be a positive integer (> 0) when provided
- **Applies to**: `complete_task`
- **Error**: `ValidationError("actual_duration_minutes must be a positive number")`

### VR-5: Priority Validation
- **Rule**: `priority` must be one of: "P1", "P2", "P3", "P4"
- **Applies to**: `create_task`, `update_task`, `set_preferences` (for `default_priority`)
- **Error**: `ValidationError("invalid priority: must be P1, P2, P3, or P4")`

### VR-6: Status Filter Validation
- **Rule**: `status` filter must be one of: "pending", "scheduled", "completed", "cancelled", "at_risk"
- **Applies to**: `list_tasks`
- **Error**: `ValidationError("invalid status: must be pending, scheduled, completed, cancelled, or at_risk")`

### VR-7: Period Validation
- **Rule**: `period` must be one of: "day", "week", "month"
- **Applies to**: `get_productivity_stats`, `get_estimation_accuracy`, `get_time_allocation`
- **Error**: `ValidationError("invalid period: must be day, week, or month")`

### VR-8: Date/Time Format Validation
- **Rule**: All datetime fields must be valid ISO 8601 UTC strings; date-only fields must be valid YYYY-MM-DD
- **Applies to**: `deadline`, `start_time`, `end_time`, `start_date`, `end_date`, `date`
- **Error**: `ValidationError("field_name must be a valid ISO 8601 date")`

### VR-9: Event Time Consistency
- **Rule**: For timed events, `end_time` must be after `start_time`
- **Rule**: For all-day events, `date` is required and `start_time`/`end_time` are ignored
- **Rule**: Either (`is_all_day` + `date`) or (`start_time` + `end_time`) must be provided, not both absent
- **Error**: `ValidationError("end time must be after start time")`, `ValidationError("date is required for all-day events")`

### VR-10: Date Range Consistency
- **Rule**: `end_date` must be after `start_date` for schedule and event queries
- **Applies to**: `list_events`, `get_schedule`
- **Error**: `ValidationError("end_date must be after start_date")`

### VR-11: Availability Window Validation
- **Rule**: Each window must have `day` (0-6), `start_time` and `end_time` in "HH:MM" format, with `end_time` after `start_time`
- **Applies to**: `set_availability`
- **Error**: `ValidationError("end time must be after start time for day N")`

### VR-12: Focus Time Validation
- **Rule**: Each focus block must have `day` (0-6), `start_time` and `end_time` in "HH:MM" format
- **Rule**: `minimum_block_minutes` must be between 15 and 120 (inclusive) when provided
- **Applies to**: `set_focus_time`
- **Note**: Focus time within availability validation is handled by ConfigRepository

### VR-13: Preferences Range Validation
- **Rule**: `buffer_time_minutes` must be a non-negative integer (>= 0)
- **Rule**: `default_duration` must be a positive integer (> 0)
- **Rule**: `scheduling_horizon_weeks` must be 1-12 (inclusive)
- **Rule**: `minimum_block_minutes` must be 15-120 (inclusive)
- **Applies to**: `set_preferences`
- **Error**: `ValidationError` with field-specific message

### VR-14: Recurrence Rule Validation
- **Rule**: `recurrence_rule` must be a valid RRULE string parseable by rrule.js
- **Applies to**: `create_task` (when `recurrence_rule` is present)
- **Note**: Detailed RRULE validation is delegated to RecurrenceManager

### VR-15: Dependency Target Validation
- **Rule**: All task IDs in `blocked_by` must reference existing tasks
- **Rule**: No self-references (task cannot depend on itself)
- **Applies to**: `create_task`, `update_task` (when `blocked_by` is present)
- **Note**: Cycle detection is delegated to DependencyResolver

---

## 2. Orchestration Rules

### OR-1: Mutation + Background Replan Pattern
- **Rule**: All mutation tools (create/update/delete/complete task, create/update/delete event, set availability/focus time/preferences) MUST:
  1. Validate input
  2. Persist the change via repository
  3. Call `replanCoordinator.requestReplan()`
  4. Return the result immediately (do NOT wait for replan)
- **Applies to**: 14 mutation tools
- **Rationale**: FR-9.8 — background replan pattern

### OR-2: Read + Status Pattern
- **Rule**: `get_schedule` and `get_conflicts` MUST:
  1. Read data from repository
  2. Call `replanCoordinator.getScheduleStatus()`
  3. If status is `"replan_in_progress"`, include `message: "A replan is currently in progress. The returned schedule may not reflect the latest changes. Please try again shortly."`
  4. Return data + status immediately
- **Rationale**: FR-9.8 — read with status indicator

### OR-3: Synchronous Replan Pattern
- **Rule**: The `replan` tool MUST:
  1. Call `replanCoordinator.awaitReplan()`
  2. Wait for the replan to complete
  3. Read the updated schedule and conflicts
  4. Return with `schedule_status: "up_to_date"`
- **Rationale**: FR-9.8 — explicit replan is the only synchronous path

### OR-4: Pure Computation Pattern
- **Rule**: Analytics tools and list/query tools MUST NOT trigger replans
- **Rule**: These tools validate input, call repository/engine, and return results
- **Applies to**: `get_productivity_stats`, `get_schedule_health`, `get_estimation_accuracy`, `get_time_allocation`, `list_tasks`, `list_events`, `get_preferences`

### OR-5: Complete Task Side Effects
- **Rule**: `complete_task` MUST execute in this order:
  1. Find task (error if not found)
  2. If already completed, return current state idempotently (no replan)
  3. Record actual duration (from input or fallback to estimated duration — Q2: A)
  4. Update task status to "completed"
  5. Unblock dependent tasks (remove satisfied dependencies)
  6. Call `replanCoordinator.requestReplan()`
  7. Return completed task
- **Rationale**: Story 1.2 — completion unblocks dependents and frees scheduled time

### OR-6: Delete Task Side Effects
- **Rule**: `delete_task` MUST execute in this order:
  1. Find task (error if not found)
  2. Update task status to "cancelled"
  3. Identify dependent tasks and flag them for review (not auto-cancelled)
  4. Call `replanCoordinator.requestReplan()`
  5. Return confirmation with affected dependent IDs
- **Rationale**: Story 1.5 — soft delete via cancellation, dependents are flagged

### OR-7: Create Recurring Task Flow
- **Rule**: When `create_task` input includes `recurrence_rule`:
  1. Validate recurrence rule
  2. Delegate to `recurrenceManager.createRecurringTask()` with task data and horizon
  3. Process `blocked_by` dependencies for the template (not individual instances)
  4. Call `replanCoordinator.requestReplan()`
  5. Return RecurringTaskOutput (template ID + instance list)
- **Rationale**: Story 4.1 — recurring tasks are created via RecurrenceManager

### OR-8: Update Task Dependency Flow
- **Rule**: When `update_task` input includes `blocked_by`:
  1. Validate all dependency target tasks exist
  2. For each new dependency: call `dependencyResolver.validateNoCycles()`
  3. If cycle detected: throw `CircularDependencyError`
  4. Replace dependency list in `taskRepo`
  5. Continue with normal update flow (persist other fields, trigger replan)
- **Rationale**: Story 1.4 — dependency management with cycle prevention

---

## 3. Error Handling Rules

### EH-1: MCP Error Response Format (Q1: A)
- **Rule**: All errors are returned via MCP `isError: true` mechanism
- **Response body**: `{ "code": "ERROR_CODE", "message": "human-readable message" }`
- **Error codes**: `VALIDATION_ERROR`, `NOT_FOUND`, `CIRCULAR_DEPENDENCY`, `INVALID_STATE`
- **Implementation**: McpServer wraps each tool handler in a try/catch that catches `AppError` instances and converts them to MCP error responses

### EH-2: AppError Mapping
- **Rule**: All `AppError` subclasses map to MCP error responses:
  - `ValidationError` → `{ code: "VALIDATION_ERROR", message: error.message }`
  - `NotFoundError` → `{ code: "NOT_FOUND", message: error.message }`
  - `CircularDependencyError` → `{ code: "CIRCULAR_DEPENDENCY", message: error.message }`
  - `InvalidStateError` → `{ code: "INVALID_STATE", message: error.message }`
- **Rule**: Unexpected errors (non-AppError) → `{ code: "INTERNAL_ERROR", message: "an unexpected error occurred" }`
- **Note**: Unexpected errors should NOT leak stack traces or internal details

### EH-3: Idempotent Completion
- **Rule**: Calling `complete_task` on an already-completed task returns success with the current task state
- **Rule**: No replan is triggered for idempotent completion
- **Rationale**: Story 1.2 — "the operation is idempotent"

### EH-4: Validation Before Mutation
- **Rule**: All input validation MUST complete BEFORE any repository write
- **Rationale**: Ensures invalid input never partially mutates state

---

## 4. Response Formatting Rules

### RF-1: snake_case Response Keys (Q3: A)
- **Rule**: All JSON response keys use snake_case
- **Mapping**: `createdAt` → `created_at`, `isRecurring` → `is_recurring`, `startTime` → `start_time`, etc.
- **Applies to**: All tool responses

### RF-2: Schedule Enrichment (Q4: A)
- **Rule**: Every time block in `get_schedule` and `replan` responses MUST include enrichment fields: `task_title`, `task_priority`, `task_category`, `task_status`
- **Implementation**: After reading time blocks from ScheduleRepository, look up each block's task from TaskRepository and merge fields
- **Performance**: Batch task lookups — collect unique task IDs, query once, merge

### RF-3: Consistent List Responses
- **Rule**: All list/query tools return `{ items: [...], count: N }` pattern
- **list_tasks**: `{ tasks: [...], count: N }`
- **list_events**: `{ events: [...], count: N }`
- **Rationale**: FR-9.7 — consistent response formats

### RF-4: Null vs Absent Fields
- **Rule**: Optional fields that have no value are returned as `null`, not omitted
- **Applies to**: `deadline`, `description`, `category`, `actual_duration`, `date`, `start_time`, `end_time`
- **Rationale**: Explicit nulls are clearer for AI agents than absent keys

---

## 5. Default Value Rules

### DV-1: Task Defaults
- **Rule**: `create_task` applies these defaults for omitted optional fields:
  - `priority` → `"P3"` (from `DEFAULT_PRIORITY` constant)
  - `description` → `null`
  - `category` → `null`
  - `tags` → `[]`
  - `is_recurring` → `false` (set to `true` only when `recurrence_rule` is present)
  - `recurrence_template_id` → `null`
- **Note**: Defaults are applied in the validator before passing to the repository

### DV-2: Event Defaults
- **Rule**: `create_event` applies:
  - `is_all_day` → `false` if not specified
- **Rule**: When `is_all_day` is `true`, `start_time` and `end_time` are set to `null`

### DV-3: Actual Duration Default (Q2: A)
- **Rule**: `complete_task` with no `actual_duration_minutes` → uses the task's `duration` (estimated duration)
- **Rationale**: Agent-provided with fallback to estimated. Never auto-computed from schedule.

### DV-4: Focus Time Minimum Block Default
- **Rule**: `set_focus_time` with no `minimum_block_minutes` → defaults to 60 (from `DEFAULT_FOCUS_TIME_MINIMUM_BLOCK_MINUTES`)

---

## 6. Tool Description Rules

### TD-1: Self-Documenting Tool Descriptions (NFR-5.1)
- **Rule**: Each MCP tool MUST have a description that:
  - States what the tool does in one sentence
  - Lists required parameters
  - Notes important behaviors (e.g., "triggers background replan")
  - Mentions error conditions
- **Rationale**: AI agents rely on tool descriptions to select and use tools correctly

### TD-2: Parameter Descriptions
- **Rule**: Each MCP tool parameter MUST have a description that:
  - States the expected type and format
  - Lists valid values for enums
  - Notes default values for optional parameters
  - Specifies "required" or "optional"

---

## 7. Composition Root Rules

### CR-1: DI Wiring Order
- **Rule**: Components MUST be created in strict dependency order:
  1. Database (path from `CALENDAR_DB_PATH` env var or default `./calendar.db`)
  2. Repositories (7): TaskRepository, EventRepository, ConfigRepository, ScheduleRepository, AnalyticsRepository, RecurrenceRepository
  3. Engine (5): DependencyResolver, ConflictDetector, Scheduler, RecurrenceManager, ReplanCoordinator
  4. Analytics (1): AnalyticsEngine
  5. Tools (5): TaskTools, EventTools, ScheduleTools, AnalyticsTools, ConfigTools
  6. Server (1): McpServer
- **Rule**: Call `server.start()` to begin listening on stdio

### CR-2: No Circular Dependencies
- **Rule**: The composition root creates all instances in one linear pass with no circular references
- **Rule**: Each component receives only the dependencies it needs (no god-object config)

### CR-3: Database Path Configuration
- **Rule**: Database path is read from `CALENDAR_DB_PATH` environment variable
- **Rule**: Defaults to `./calendar.db` if not set
- **Rule**: Database and schema are initialized before any repository is created
