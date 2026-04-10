# Unit Test Instructions — Smart Agentic Calendar MCP Server

## Test Framework

- **Runner**: Vitest 4.x
- **Coverage**: @vitest/coverage-v8
- **Assertion style**: Vitest built-in (`expect`, `describe`, `it`)
- **Mocking**: Vitest `vi.fn()` / `vi.spyOn()`

## Running Tests

### Run All Unit Tests

```bash
npm test
```

Runs `vitest run` — executes all test files and exits.

### Watch Mode (Development)

```bash
npm run test:watch
```

### With Coverage

```bash
npm run test:coverage
```

### Run Specific Unit

```bash
# Unit 1: Foundation (models + common)
npx vitest run tests/unit/models/ tests/unit/common/

# Unit 2: Storage (repositories + database)
npx vitest run tests/unit/storage/

# Unit 3: Scheduling Engine
npx vitest run tests/unit/engine/

# Unit 3: Property-Based Tests (PBT)
npx vitest run tests/pbt/

# Unit 4: Analytics
npx vitest run tests/unit/analytics/

# Unit 5: MCP Server
npx vitest run tests/unit/mcp/
```

### Run Single Test File

```bash
npx vitest run tests/unit/mcp/task-tools.test.ts
```

## Test Inventory

### Unit 1: Foundation — 74 tests (12 files)

| File | Tests | What It Covers |
|---|---|---|
| `tests/unit/models/task.test.ts` | varies | Task type creation, priority/status enums |
| `tests/unit/models/event.test.ts` | varies | Event type creation, timed vs all-day |
| `tests/unit/models/schedule.test.ts` | varies | TimeBlock, ScheduleResult types |
| `tests/unit/models/config.test.ts` | varies | Availability, FocusTime, Preferences types |
| `tests/unit/models/analytics.test.ts` | varies | Analytics types (productivity, health, etc.) |
| `tests/unit/models/errors.test.ts` | varies | AppError hierarchy (Validation, NotFound, etc.) |
| `tests/unit/models/conflict.test.ts` | varies | Conflict, DeprioritizationSuggestion types |
| `tests/unit/models/recurrence.test.ts` | varies | RecurrenceTemplate, RecurrenceInstance types |
| `tests/unit/common/constants.test.ts` | varies | Constants (VALID_PRIORITIES, VALID_PERIODS, etc.) |
| `tests/unit/common/id.test.ts` | varies | UUID generation |
| `tests/unit/common/time.test.ts` | varies | ISO8601 validation, date/time helpers |

### Unit 2: Storage — 125 tests (6 files)

| File | Tests | What It Covers |
|---|---|---|
| `tests/unit/storage/database.test.ts` | varies | SQLite connection, migrations, schema |
| `tests/unit/storage/task-repository.test.ts` | varies | Task CRUD, filters, dependencies |
| `tests/unit/storage/event-repository.test.ts` | varies | Event CRUD, date range queries |
| `tests/unit/storage/schedule-repository.test.ts` | varies | TimeBlock persistence, schedule queries |
| `tests/unit/storage/config-repository.test.ts` | varies | Config get/set (availability, focus, prefs) |
| `tests/unit/storage/analytics-repository.test.ts` | varies | Analytics data queries |
| `tests/unit/storage/recurrence-repository.test.ts` | varies | Recurrence template/instance persistence |

### Unit 3: Scheduling Engine — 145 tests (8 files, including 2 PBT)

| File | Tests | What It Covers |
|---|---|---|
| `tests/unit/engine/scheduler.test.ts` | varies | Core scheduling algorithm |
| `tests/unit/engine/scheduler-placement.test.ts` | varies | Time slot placement logic |
| `tests/unit/engine/replan-coordinator.test.ts` | varies | Async replan, debouncing, status tracking |
| `tests/unit/engine/dependency-resolver.test.ts` | varies | Topological sort, cycle detection |
| `tests/unit/engine/conflict-detector.test.ts` | varies | Deadline conflicts, at-risk detection |
| `tests/unit/engine/recurrence-manager.test.ts` | varies | RRULE expansion, instance generation |
| `tests/pbt/scheduler.pbt.test.ts` | varies | Property-based: scheduling invariants |
| `tests/pbt/dependency-resolver.pbt.test.ts` | varies | Property-based: DAG properties |

### Unit 4: Analytics — 62 tests (6 files)

| File | Tests | What It Covers |
|---|---|---|
| `tests/unit/analytics/analytics-engine.test.ts` | varies | AnalyticsEngine orchestration |
| `tests/unit/analytics/productivity.test.ts` | varies | Completion rate, on-time % |
| `tests/unit/analytics/health.test.ts` | varies | Schedule health score |
| `tests/unit/analytics/estimation.test.ts` | varies | Duration estimation accuracy |
| `tests/unit/analytics/allocation.test.ts` | varies | Time allocation by category |
| `tests/unit/analytics/period.test.ts` | varies | Period date range calculation |

### Unit 5: MCP Server — 123 tests (8 files)

| File | Tests | What It Covers |
|---|---|---|
| `tests/unit/mcp/validators.test.ts` | 62 | Input/output mapping, validation rules |
| `tests/unit/mcp/task-tools.test.ts` | 20 | TaskTools with mocked repos/engine |
| `tests/unit/mcp/event-tools.test.ts` | 8 | EventTools with mocked repos |
| `tests/unit/mcp/schedule-tools.test.ts` | 11 | ScheduleTools + enrichment |
| `tests/unit/mcp/analytics-tools.test.ts` | 8 | AnalyticsTools delegation |
| `tests/unit/mcp/config-tools.test.ts` | 4 | ConfigTools set/get operations |
| `tests/unit/mcp/server.test.ts` | 6 | Tool registration + error wrapping |
| `tests/unit/mcp/index.test.ts` | 4 | Composition root DI wiring |

**Grand Total: 40 test files, 536 tests**

## Test Design Patterns

1. **Unit tests use mocks/stubs for dependencies** — constructor-injected via DI (NFR-4.6)
2. **Storage tests use real in-memory SQLite** — `:memory:` database, no mocks for SQL
3. **PBT tests (Unit 3)** — fast-check library for scheduling invariants and DAG properties
4. **No network or filesystem I/O** in any unit test
5. **Each test is independent** — no shared mutable state between tests

## Expected Results

All 536 tests should pass with exit code 0:

```
✓ tests/unit/models/... (74 tests)
✓ tests/unit/storage/... (125 tests)
✓ tests/unit/engine/... (145 tests)
✓ tests/unit/analytics/... (62 tests)
✓ tests/unit/mcp/... (123 tests)
✓ tests/pbt/... (included in Unit 3 count)

Test Files  40 passed (40)
     Tests  536 passed (536)
```
