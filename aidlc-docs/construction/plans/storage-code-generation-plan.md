# Code Generation Plan — Unit 2: Storage

## Unit Context

**Unit**: Storage (6 repository classes providing CRUD data access over SQLite)
**Stories**: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 4.1, 4.2, 7.1, 7.2, 7.3
**Dependencies**: Unit 1 (models, common, database)
**Code location**: `src/storage/`
**Test location**: `tests/unit/storage/`
**Project type**: Greenfield, single monolith

## Design References

- Repository interfaces: `aidlc-docs/construction/storage/functional-design/repository-interfaces.md`
- SQL queries: `aidlc-docs/construction/storage/functional-design/sql-queries.md`
- Data access rules: `aidlc-docs/construction/storage/functional-design/data-access-rules.md`
- Component methods: `aidlc-docs/inception/application-design/component-methods.md`
- Domain entities: `aidlc-docs/construction/foundation/functional-design/domain-entities.md`
- Business rules: `aidlc-docs/construction/foundation/functional-design/business-rules.md`

## TDD Approach

All production code follows red-green-refactor:
1. Write a failing test (red)
2. Write minimal code to pass (green)
3. Refactor for simplicity

All tests use in-memory SQLite (`:memory:`) for speed. Each test file creates a fresh Database instance in beforeEach for isolation.

---

## Generation Steps

### Step 1: TaskRepository — Core CRUD (TDD)
- [x] Write tests for: create (valid input, defaults, validation errors), findById (found, not found), findAll (no filters, each filter individually, combined filters, ordering), update (valid, not found, invalid state), updateStatus (valid transitions, invalid transitions, not found)
- [x] Implement `src/storage/task-repository.ts` — constructor, rowToTask/taskToRow mappers, create, findById, findAll (dynamic SQL builder), update, updateStatus
- [x] Verify tests pass — 51 tests passing

### Step 2: TaskRepository — Dependencies & Completion (TDD)
- [x] Write tests for: delete (soft-delete + cascading dependency removal, not found, invalid state), addDependency (valid, task not found), removeDependency (valid, not found), getDependencies, getDependents, recordActualDuration (valid, not found)
- [x] Implement remaining TaskRepository methods: delete, addDependency, removeDependency, getDependencies, getDependents, recordActualDuration
- [x] Verify tests pass — included in same 51-test suite

### Step 3: EventRepository (TDD)
- [x] Write tests for: create (timed event, all-day event, validation errors), findById (found, not found), findInRange (timed events, all-day events, mixed, empty range), update (valid, not found), delete (valid, not found)
- [x] Implement `src/storage/event-repository.ts` — constructor, rowToEvent mapper, all CRUD methods
- [x] Verify tests pass — 19 tests passing

### Step 4: ConfigRepository (TDD)
- [x] Write tests for: getAvailability (empty, populated), setAvailability (replaces existing, validation errors), getFocusTime (empty, populated, default minimum), setFocusTime (replaces existing, updates minimum), getPreferences (defaults, custom values), setPreferences (partial update, validation errors), getFullConfig
- [x] Implement `src/storage/config-repository.ts` — constructor, row mappers, all config methods
- [x] Verify tests pass — 19 tests passing

### Step 5: ScheduleRepository (TDD)
- [x] Write tests for: saveSchedule (empty, multiple blocks, replaces existing), getSchedule (range filtering, ordering), getScheduleStatus (default value, after update), setScheduleStatus (up_to_date with timestamp, replan_in_progress), clearSchedule
- [x] Implement `src/storage/schedule-repository.ts` — constructor, rowToTimeBlock mapper, all methods
- [x] Verify tests pass — 9 tests passing

### Step 6: AnalyticsRepository (TDD)
- [x] Write tests for: getCompletedTasks (date range, wasOnTime calculation, empty), getOverdueTasks (past deadline, excludes completed/cancelled), getCancelledTasks (date range), getTasksByCategory (grouping, uncategorized handling), getDurationRecords (only tasks with actual_duration)
- [x] Implement `src/storage/analytics-repository.ts` — constructor, row mappers, all query methods
- [x] Verify tests pass — 11 tests passing

### Step 7: RecurrenceRepository (TDD)
- [x] Write tests for: createTemplate (valid, JSON serialization of taskData), getTemplate (found, not found), getActiveTemplates (excludes inactive), deleteTemplate (soft-delete, not found), createInstance, getInstances (date range filtering), addException (skip, modify, overwrite existing), getExceptions
- [x] Implement `src/storage/recurrence-repository.ts` — constructor, row mappers, all methods
- [x] Verify tests pass — 16 tests passing

### Step 8: Storage Barrel Export
- [x] Create `src/storage/index.ts` re-exporting Database and all 6 repository classes
- [x] Verify imports work — TypeScript compilation passes

### Step 9: Code Generation Summary
- [x] Create `aidlc-docs/construction/storage/code/code-summary.md` — list of all generated files with descriptions
- [x] Run full test suite to verify no regressions — 204 tests passing (18 test files), 0 failures
