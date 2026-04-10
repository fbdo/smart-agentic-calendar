# Performance Test Instructions — Smart Agentic Calendar MCP Server

## Purpose

Performance tests verify the system meets the non-functional requirements defined in NFR-1 (Performance):

| NFR | Requirement | Target | Measured Result |
|---|---|---|---|
| NFR-1.1 | Replan latency for up to 200 active tasks | < 500ms | 154ms (200 tasks), 205ms (+events), 472ms (+deps) |
| NFR-1.2 | Tool response time for CRUD operations | < 100ms | All < 2ms with 200 existing tasks |
| NFR-1.3 | Database queries with appropriate indexes | Verified via EXPLAIN QUERY PLAN | All key queries use indexes |

## Test Location

```
tests/performance/
```

## Running Performance Tests

```bash
# Run only performance tests
npx vitest run tests/performance/

# Run all tests (unit + integration + performance)
npm test
```

## Test Suites — 3 files, 17 tests

### 1. Replan Latency (`tests/performance/replan-latency.test.ts`) — 5 tests

**Purpose**: Verify NFR-1.1 — replan completes within 500ms for up to 200 active tasks.

**Setup**: Full app with in-memory SQLite, Mon-Fri 09:00-17:00 availability, focus time 09:00-11:00. Tasks seeded with varied priorities (P1-P4), durations (15-120 min), deadlines spread across 3 weeks, and categories.

**Methodology**: Warm-up replan, then median of 5 iterations using `performance.now()`. CI environments use a 2x multiplier on thresholds.

| # | Test Case | Target | Measured |
|---|---|---|---|
| 1 | Replan with 50 active tasks | < 200ms | ~37ms |
| 2 | Replan with 100 active tasks | < 350ms | ~74ms |
| 3 | Replan with 200 active tasks | < 500ms | ~154ms |
| 4 | Replan with 200 tasks + 20 events | < 500ms | ~205ms |
| 5 | Replan with 200 tasks + dependency chains (40 chains × 5) | < 500ms | ~472ms |

### 2. CRUD Response Time (`tests/performance/crud-latency.test.ts`) — 6 tests

**Purpose**: Verify NFR-1.2 — individual CRUD operations complete within 100ms.

**Setup**: Full app pre-seeded with 200 tasks, 20 events, scheduled via replan, 50 tasks completed (for analytics data). Single shared app instance via `beforeAll`.

| # | Test Case | Target | Measured |
|---|---|---|---|
| 1 | Create task (200 existing tasks) | < 100ms | < 2ms |
| 2 | Update task (200 existing tasks) | < 100ms | < 1ms |
| 3 | List tasks with filters (200 tasks) | < 100ms | < 1ms |
| 4 | Create event | < 100ms | < 1ms |
| 5 | Get schedule (2-week range) | < 100ms | < 2ms |
| 6 | Get analytics (200 tasks, 50 completed) | < 100ms | < 2ms |

### 3. Database Query Performance (`tests/performance/database-queries.test.ts`) — 6 tests

**Purpose**: Verify NFR-1.3 — database queries use indexes effectively.

**Setup**: Direct database access with 200 tasks, 50 events, 200 time blocks, 49 dependency edges seeded. Uses `EXPLAIN QUERY PLAN` to verify index usage.

| # | Test Case | Verified Index |
|---|---|---|
| 1 | Task lookup by ID | Primary key (tasks.id) |
| 2 | Tasks filtered by status | `idx_tasks_status` |
| 3 | Tasks filtered by deadline range | `idx_tasks_deadline` |
| 4 | Events in date range | Query plan present (OR query may use multi-index) |
| 5 | Schedule blocks in date range | `idx_time_blocks_start` |
| 6 | Dependencies by task_id | Composite primary key / index on dependencies |

## Test Design Notes

- **In-memory SQLite** for consistent timing (no disk I/O variance)
- **Warm-up runs** before measurement to avoid cold-start artifacts
- **Median of 5 iterations** for replan latency to reduce noise
- **CI multiplier (2x)** on thresholds for slower CI environments (`process.env.CI`)
- **`performance.now()`** for sub-millisecond precision
- **Shared setup via `beforeAll`** for CRUD tests to amortize seeding cost
