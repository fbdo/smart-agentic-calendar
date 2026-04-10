# Code Generation Plan — Unit 5: MCP Server

## Unit Context

**Unit**: MCP Server (5 tool handler classes + validators + server + composition root)
**Stories**: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 3.1, 4.1, 4.2, 5.1, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3 (17 of 18 stories)
**Dependencies**: Unit 1 (models, common), Unit 2 (all repositories), Unit 3 (engine), Unit 4 (analytics)
**Code location**: `src/mcp/`, `src/index.ts`
**Test location**: `tests/unit/mcp/`
**Project type**: Greenfield, single monolith

## Design References

- Business logic model: `aidlc-docs/construction/mcp-server/functional-design/business-logic-model.md`
- Business rules: `aidlc-docs/construction/mcp-server/functional-design/business-rules.md`
- Domain entities: `aidlc-docs/construction/mcp-server/functional-design/domain-entities.md`
- Component methods: `aidlc-docs/inception/application-design/component-methods.md`
- Services & orchestration: `aidlc-docs/inception/application-design/services.md`

## TDD Approach

All production code follows red-green-refactor:
1. Write a failing test (red)
2. Write minimal code to pass (green)
3. Refactor for simplicity

MCP tool handler tests use mocked/stubbed repositories and engine components (injected via constructor). Tests verify:
- Input validation (error cases)
- Correct delegation to repositories/engine
- snake_case mapping (input → camelCase, output → snake_case)
- Orchestration pattern compliance (replan triggered for mutations, not for reads)
- Error handling (AppError → MCP error response)

No PBT for this unit — MCP tools are thin orchestration wrappers; the algorithmic complexity is tested in Units 2-4.

## External Dependencies

- **@modelcontextprotocol/sdk** (`@modelcontextprotocol/sdk` npm package): Required for MCP Server class, tool registration, and StdioServerTransport. Must be installed before Step 1.

---

## Generation Steps

### Step 1: Install MCP SDK + create directory structure and barrel exports
- [x] Install `@modelcontextprotocol/sdk` package via npm
- [x] Create `src/mcp/tools/` directory
- [x] Create `src/mcp/index.ts` barrel export (empty initially)
- [x] Verify TypeScript compilation passes

### Step 2: Validators — snake_case mapping + input validation (TDD)
- [x] Write tests in `tests/unit/mcp/validators.test.ts`:
  - **Input mapping tests**:
    - mapCreateTaskInput: full input maps all snake_case fields to camelCase; defaults applied for omitted optional fields (priority→P3, description→null, category→null, tags→[])
    - mapCreateTaskInput: with recurrence_rule sets isRecurring=true
    - mapUpdateTaskInput: extracts task_id and maps only provided update fields
    - mapListTasksInput: maps snake_case filter fields to camelCase TaskFilters
    - mapCreateEventInput: timed event maps start_time/end_time; all-day event maps date
    - mapSetAvailabilityInput: maps windows array with day/start_time/end_time to DayAvailability[]
    - mapSetFocusTimeInput: maps blocks + minimum_block_minutes
    - mapSetPreferencesInput: maps partial preferences (only provided fields)
  - **Output mapping tests**:
    - mapTaskOutput: all camelCase fields mapped to snake_case (createdAt→created_at, isRecurring→is_recurring, etc.)
    - mapEventOutput: all fields mapped correctly
    - mapTimeBlockOutput: enriches with task_title, task_priority, task_category, task_status
    - mapConflictOutput: maps all Conflict fields to snake_case including nested suggestions
    - mapProductivityOutput, mapHealthOutput, mapEstimationOutput, mapAllocationOutput: all analytics types mapped
    - mapAvailabilityOutput, mapFocusTimeOutput, mapPreferencesOutput: config types mapped
  - **Validation tests**:
    - validateCreateTaskInput: missing title → ValidationError
    - validateCreateTaskInput: missing estimated_duration → ValidationError
    - validateCreateTaskInput: zero/negative duration → ValidationError
    - validateCreateTaskInput: invalid priority → ValidationError
    - validateCreateTaskInput: invalid deadline format → ValidationError
    - validateUpdateTaskInput: missing task_id → ValidationError
    - validateUpdateTaskInput: no update fields → ValidationError
    - validateCompleteTaskInput: missing task_id → ValidationError
    - validateCompleteTaskInput: zero/negative actual_duration_minutes → ValidationError
    - validateCreateEventInput: missing title → ValidationError
    - validateCreateEventInput: timed event without start_time → ValidationError
    - validateCreateEventInput: end_time before start_time → ValidationError
    - validateCreateEventInput: all-day event without date → ValidationError
    - validateListEventsInput: end_date before start_date → ValidationError
    - validateGetScheduleInput: end_date before start_date → ValidationError
    - validatePeriodInput: invalid period → ValidationError
    - validateSetAvailabilityInput: empty windows → ValidationError
    - validateSetAvailabilityInput: invalid day (7) → ValidationError
    - validateSetAvailabilityInput: end_time before start_time → ValidationError
    - validateSetFocusTimeInput: minimum_block_minutes out of range → ValidationError
    - validateSetPreferencesInput: no fields → ValidationError
    - validateSetPreferencesInput: scheduling_horizon_weeks out of range → ValidationError
- [x] Implement `src/mcp/validators.ts`:
  - All validate* functions (throw ValidationError on failure)
  - All map*Input functions (snake_case → camelCase, apply defaults)
  - All map*Output functions (camelCase → snake_case)
- [x] Verify all tests pass

### Step 3: TaskTools (TDD) — Stories 1.1-1.5, 1.4, 4.1, 4.2
- [x] Write tests in `tests/unit/mcp/task-tools.test.ts`:
  - **create_task**:
    - Creates task via taskRepo.create, triggers requestReplan, returns mapped output
    - With recurrence_rule: delegates to recurrenceManager.createRecurringTask, returns RecurringTaskOutput
    - With blocked_by: validates deps exist, calls dependencyResolver.validateNoCycles, adds dependencies
    - With blocked_by containing circular dep: throws CircularDependencyError
    - With blocked_by referencing non-existent task: throws NotFoundError
  - **update_task**:
    - Updates task fields via taskRepo.update, triggers requestReplan
    - Task not found: throws NotFoundError
    - With blocked_by: replaces dependencies, validates no cycles
    - Completed recurring instance: throws InvalidStateError
  - **complete_task**:
    - Records actual_duration_minutes, updates status to completed, unblocks dependents, triggers requestReplan
    - Default actual duration: uses task.duration when actual_duration_minutes omitted
    - Already completed: returns current state, no replan triggered (idempotent)
    - Task not found: throws NotFoundError
  - **delete_task**:
    - Updates status to cancelled, identifies dependents, triggers requestReplan
    - Returns affected_dependents list
    - Task not found: throws NotFoundError
    - Recurring template: delegates to recurrenceManager.deleteTemplate
  - **list_tasks**:
    - No filters: calls taskRepo.findAll with excludeStatus="cancelled"
    - With status filter: passes through, no default exclusion
    - With multiple filters: all mapped correctly
    - Empty results: returns empty array with count 0
    - No replan triggered
- [x] Implement `src/mcp/tools/task-tools.ts`:
  - `TaskTools` class with constructor(taskRepo, recurrenceManager, dependencyResolver, replanCoordinator)
  - 5 methods: createTask, updateTask, completeTask, deleteTask, listTasks
  - Each method validates → delegates → maps output
- [x] Verify all tests pass

### Step 4: EventTools (TDD) — Story 2.1
- [x] Write tests in `tests/unit/mcp/event-tools.test.ts`:
  - **create_event**:
    - Timed event: creates via eventRepo.create, triggers requestReplan
    - All-day event: creates with date, start_time/end_time null
    - Returns mapped event output
  - **update_event**:
    - Updates fields, triggers requestReplan
    - Event not found: throws NotFoundError
  - **delete_event**:
    - Deletes via eventRepo.delete, triggers requestReplan
    - Event not found: throws NotFoundError
  - **list_events**:
    - Returns events in date range, no replan triggered
    - Empty results: returns empty array with count 0
- [x] Implement `src/mcp/tools/event-tools.ts`:
  - `EventTools` class with constructor(eventRepo, replanCoordinator)
  - 4 methods: createEvent, updateEvent, deleteEvent, listEvents
- [x] Verify all tests pass

### Step 5: ScheduleTools (TDD) — Stories 3.1, 5.1
- [x] Write tests in `tests/unit/mcp/schedule-tools.test.ts`:
  - **get_schedule**:
    - Returns enriched time blocks with task details (title, priority, category, status)
    - schedule_status "up_to_date": no message field
    - schedule_status "replan_in_progress": includes message
    - No replan triggered
    - Empty schedule: returns empty array
  - **replan**:
    - Awaits replanCoordinator.awaitReplan()
    - Returns enriched schedule + conflicts + schedule_status "up_to_date"
  - **get_conflicts**:
    - Returns conflicts mapped to snake_case + schedule_status
    - No conflicts: returns empty array
    - No replan triggered
  - **enrichTimeBlocks**:
    - Batch lookup: multiple blocks with same taskId → single task lookup
    - Missing task: uses fallback values (title="Unknown", priority="P3")
- [x] Implement `src/mcp/tools/schedule-tools.ts`:
  - `ScheduleTools` class with constructor(scheduleRepo, taskRepo, configRepo, replanCoordinator, conflictDetector)
  - 3 methods: getSchedule, replan, getConflicts
  - Private enrichTimeBlocks helper
- [x] Verify all tests pass

### Step 6: AnalyticsTools (TDD) — Stories 6.1-6.4
- [x] Write tests in `tests/unit/mcp/analytics-tools.test.ts`:
  - **get_productivity_stats**: delegates to analyticsEngine.getProductivityStats, maps output to snake_case
  - **get_schedule_health**: delegates to analyticsEngine.getScheduleHealth, maps output
  - **get_estimation_accuracy**: delegates to analyticsEngine.getEstimationAccuracy, maps output
  - **get_time_allocation**: delegates to analyticsEngine.getTimeAllocation, maps output
  - All methods: no replan triggered
  - Invalid period: ValidationError propagated
- [x] Implement `src/mcp/tools/analytics-tools.ts`:
  - `AnalyticsTools` class with constructor(analyticsEngine)
  - 4 methods: getProductivityStats, getScheduleHealth, getEstimationAccuracy, getTimeAllocation
- [x] Verify all tests pass

### Step 7: ConfigTools (TDD) — Stories 7.1-7.3
- [x] Write tests in `tests/unit/mcp/config-tools.test.ts`:
  - **set_availability**: saves via configRepo.setAvailability, triggers requestReplan, returns confirmation
  - **set_focus_time**: saves via configRepo.setFocusTime, triggers requestReplan, returns confirmation with default minimum_block_minutes
  - **set_preferences**: saves via configRepo.setPreferences (partial merge), triggers requestReplan, returns full preferences
  - **get_preferences**: returns full config (availability + focus time + preferences), no replan triggered
- [x] Implement `src/mcp/tools/config-tools.ts`:
  - `ConfigTools` class with constructor(configRepo, replanCoordinator)
  - 4 methods: setAvailability, setFocusTime, setPreferences, getPreferences
- [x] Verify all tests pass

### Step 8: McpServer — tool registration and error wrapper (TDD)
- [x] Write tests in `tests/unit/mcp/server.test.ts`:
  - Tool registration: all 20 tools registered with correct names
  - Error wrapper: AppError (ValidationError) → isError: true with { code, message }
  - Error wrapper: AppError (NotFoundError) → isError: true with { code, message }
  - Error wrapper: unexpected Error → isError: true with { code: "INTERNAL_ERROR" }
  - Success wrapper: returns { content: [{ type: "text", text: JSON.stringify(result) }] }
  - Async handler (replan): awaits Promise before returning
- [x] Implement `src/mcp/server.ts`:
  - `McpServer` class with constructor(taskTools, eventTools, scheduleTools, analyticsTools, configTools)
  - `start()` method: creates MCP Server, registers tools with schemas, connects StdioServerTransport
  - `wrapToolHandler()`: try/catch error mapping
  - Tool descriptions (NFR-5.1): concise, self-documenting for AI agents
- [x] Update `src/mcp/index.ts` barrel export with all public classes
- [x] Verify all tests pass

### Step 9: Composition root (src/index.ts)
- [x] Write tests in `tests/unit/mcp/index.test.ts`:
  - Verifies composition root creates all components without error
  - Verifies DI wiring order (all dependencies satisfied)
  - Environment variable: CALENDAR_DB_PATH overrides default
  - Default DB path: ./calendar.db
- [x] Implement `src/index.ts`:
  - Creates all 19 components in dependency order (CR-1)
  - Reads CALENDAR_DB_PATH from environment
  - Calls server.start()
  - Logs startup to stderr
- [x] Verify all tests pass

### Step 10: Full test suite verification
- [x] Run complete test suite (`npm test`) — all unit tests across Units 1-5
- [x] Verify no regressions in Units 1-4
- [x] Report total test count

### Step 11: Code summary documentation
- [x] Create `aidlc-docs/construction/mcp-server/code/code-summary.md`:
  - List all source files created with paths and line counts
  - List all test files created with paths and test counts
  - Story coverage mapping
  - Total test count summary
  - External dependency: @modelcontextprotocol/sdk

---

## Story Traceability

| Step | Stories | Components |
|------|---------|------------|
| Step 1 | (setup) | MCP SDK install, directory structure |
| Step 2 | (shared) | validators.ts — validation + snake_case mapping |
| Step 3 | 1.1, 1.2, 1.3, 1.4, 1.5, 4.1, 4.2 | TaskTools |
| Step 4 | 2.1 | EventTools |
| Step 5 | 3.1, 5.1 | ScheduleTools |
| Step 6 | 6.1, 6.2, 6.3, 6.4 | AnalyticsTools |
| Step 7 | 7.1, 7.2, 7.3 | ConfigTools |
| Step 8 | FR-9.1, FR-9.7, NFR-5.1 | McpServer |
| Step 9 | (integration) | Composition root (index.ts) |
| Step 10 | (verification) | Full test suite |
| Step 11 | (documentation) | code-summary.md |

## Estimated Scope

- **Source files**: 8 (validators.ts, task-tools.ts, event-tools.ts, schedule-tools.ts, analytics-tools.ts, config-tools.ts, server.ts, index.ts) + 1 barrel export (mcp/index.ts)
- **Test files**: 8 (validators, task-tools, event-tools, schedule-tools, analytics-tools, config-tools, server, index)
- **Total steps**: 11
