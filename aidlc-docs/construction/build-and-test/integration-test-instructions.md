# Integration Test Instructions — Smart Agentic Calendar MCP Server

## Purpose

Integration tests verify that units work together correctly through their real interfaces, using a real SQLite database (in-memory). These tests complement the unit tests by exercising cross-unit boundaries that mocks cannot cover.

## Test Location

```
tests/integration/
```

## Running Integration Tests

```bash
# Run only integration tests
npx vitest run tests/integration/

# Run all tests (unit + integration + performance)
npm test
```

## Test Suites — 5 files, 25 tests

### 1. MCP Tools → Storage Round-Trip (`tests/integration/mcp-storage.test.ts`) — 9 tests

**Purpose**: Verify MCP tool handlers correctly persist and retrieve data through real repositories and a real SQLite database.

**Setup**: `createApp(":memory:")` with Mon-Fri 09:00-17:00 availability configured.

| # | Test Case | Verification |
|---|---|---|
| 1 | Create task → list tasks returns it | Full round-trip: validation → repo.create → repo.findAll |
| 2 | Create task → update task → list shows updated fields | Mutation persistence |
| 3 | Create task → replan → complete task → list shows completed | Status transitions (pending → scheduled → completed) |
| 4 | Create task → delete task → list excludes cancelled | Soft delete + default filter; explicit cancelled filter finds it |
| 5 | Create timed event → list events returns it | Event round-trip |
| 6 | Create all-day event → list events in range returns it | Date-based event querying |
| 7 | Set availability → get_preferences returns it | Config persistence (array format) |
| 8 | Set focus time → get_preferences returns focus config | Focus time round-trip |
| 9 | Set preferences → get_preferences returns merged result | Partial merge with defaults preserved |

### 2. Scheduling Pipeline (`tests/integration/scheduling-pipeline.test.ts`) — 6 tests

**Purpose**: Verify the full scheduling pipeline: task creation → replan → schedule retrieval with enriched time blocks.

**Setup**: Full app with in-memory DB, Mon-Fri 09:00-17:00 availability.

| # | Test Case | Verification |
|---|---|---|
| 1 | Create task → replan → get_schedule returns enriched time blocks | End-to-end: task_title, task_priority, task_category populated |
| 2 | Create P1 + P3 tasks → replan → P1 gets earlier slot | Priority-based scheduling order |
| 3 | Create event + task → replan → task scheduled around event | Event avoidance (no overlapping blocks) |
| 4 | Create task → replan → complete → replan → task gone from schedule | Completed task removal |
| 5 | Create task with deadline → replan → all blocks before deadline | Deadline constraint enforcement |
| 6 | Create dependency chain → complete blocker → replan → dependent scheduled | Dependency unblocking (pending → at_risk → scheduled) |

### 3. Conflict Detection Pipeline (`tests/integration/conflict-detection.test.ts`) — 3 tests

**Purpose**: Verify conflict detection works end-to-end with real scheduled data.

**Setup**: Limited availability (2 hours/day) to force overdue conflicts via past deadlines.

| # | Test Case | Verification |
|---|---|---|
| 1 | Tasks with past deadlines → replan → overdue conflicts detected | Overdue reason, populated fields |
| 2 | Single overdue task → conflict details populated correctly | task_id, reason, required_minutes, deadline present |
| 3 | Complete overdue task → replan → that task's conflict cleared | Conflict resolution via completion |

### 4. Recurring Tasks Pipeline (`tests/integration/recurring-tasks.test.ts`) — 3 tests

**Purpose**: Verify recurring task creation, instance generation, and scheduling.

**Setup**: Full app with Mon-Fri 09:00-17:00 availability.

| # | Test Case | Verification |
|---|---|---|
| 1 | Create weekly recurring task → replan → instances in schedule | Template + instances created; blocks have correct title |
| 2 | Complete one instance → replan → remaining instances still scheduled | Instance independence |
| 3 | Delete recurring template → replan → all instances removed from schedule | Template deletion cascade |

### 5. Analytics Pipeline (`tests/integration/analytics-pipeline.test.ts`) — 4 tests

**Purpose**: Verify analytics calculations with real task/schedule data.

**Setup**: Full app; tasks created, replanned (to get "scheduled" status), then completed.

| # | Test Case | Verification |
|---|---|---|
| 1 | Complete 2 of 3 tasks → get_productivity_stats | tasks_completed >= 2, completion_rate > 0 |
| 2 | Schedule tasks → get_schedule_health | health_score in 0-100 range |
| 3 | Complete tasks with varied actual durations → get_estimation_accuracy | average_accuracy_percentage in 0-100 range |
| 4 | Complete categorized tasks → get_time_allocation | Both categories present in breakdown |

## Production Code Fixes Discovered

Integration tests revealed 2 bugs in production code that were invisible to unit tests (which use mocks):

1. **`src/engine/replan-coordinator.ts`** — Tasks with scheduled time blocks were never transitioned to "scheduled" status, making `pending → completed` impossible through the MCP tool layer. Fixed: tasks with time blocks are now marked "scheduled" after each replan.

2. **`src/engine/scheduler.ts`** — Topological sort failed when a completed dependency was not in the schedulable task set, causing `CircularDependencyError` (silently caught). Fixed: dependency edge filtering now only includes edges where both `taskId` and `dependsOnId` are in the schedulable set.

## Test Design Notes

- **No mocks** — all tests use real component interactions via `createApp(":memory:")`
- **Replan before complete** — tasks must be replanned to get "scheduled" status before completion (pending → scheduled → completed)
- **Fresh app per test** — each test creates a new app instance via `beforeEach` for isolation
- **Past deadlines for conflicts** — overdue detection requires deadlines in the past; the validator does not reject past deadlines
