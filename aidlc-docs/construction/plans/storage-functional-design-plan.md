# Functional Design Plan — Unit 2: Storage

## Overview
Design the 6 repository classes that encapsulate all SQL queries behind typed interfaces: TaskRepository, EventRepository, ConfigRepository, ScheduleRepository, AnalyticsRepository, and RecurrenceRepository. All repositories receive `Database` via constructor injection and use better-sqlite3's synchronous API.

---

## Planning Questions

### Question 1
How should SQL queries handle transactions across multiple statements?

A) **Per-method transactions** — each repository method wraps its own statements in a transaction. Simple, granular, but cross-repository atomicity requires explicit coordination at the caller level.
B) **Passed-in transaction** — repositories accept an optional transaction/connection parameter, allowing the engine layer to wrap multiple repository calls in a single transaction (e.g., create task + add dependency atomically).
C) **Unit-of-Work pattern** — a transaction manager that collects operations and commits them in a batch. More complex, full ORM-like behavior.

[Answer]: A

### Question 2
How should row-to-model mapping handle SQLite type conversions?

A) **Inline mapping** — each repository method maps rows to model types directly in the query result handling. Straightforward, keeps mapping close to the SQL. Each repo has private helper methods like `rowToTask()`, `taskToRow()`.
B) **Shared mapper module** — a separate `src/storage/mappers.ts` file with reusable mapping functions. Reduces duplication if multiple repositories need similar conversions (e.g., boolean ↔ integer, JSON ↔ string).
C) **Raw rows** — repositories return raw SQLite rows and let consumers handle mapping. Minimal repository code but pushes complexity upstream.

[Answer]: A

### Question 3
How should `TaskRepository.findAll()` handle filter combinations?

A) **Dynamic SQL builder** — build WHERE clauses dynamically based on which filters are provided. Flexible, handles any combination, but requires careful SQL construction to avoid injection (using parameterized queries).
B) **Predefined query variants** — separate prepared statements for common filter combinations (by status, by priority, by deadline range, etc.). Less flexible but simpler and fully type-safe.
C) **Fetch-all-then-filter** — retrieve all tasks and filter in TypeScript. Simplest code but O(n) performance and doesn't leverage SQLite indexes.

[Answer]: A

### Question 4
How should repositories handle "not found" scenarios on update/delete operations?

A) **Check-then-act** — run a SELECT first, throw `NotFoundError` if missing, then perform UPDATE/DELETE. Explicit error messages, two queries per operation.
B) **Act-then-check** — run the UPDATE/DELETE, check `changes` count on the result. If 0 changes, throw `NotFoundError`. Single query, relies on SQLite's `changes` property.
C) **Silent no-op** — if the entity doesn't exist, return without error. Callers must check return values. Simplest but hides potential bugs.

[Answer]: B

---

## Generation Steps

After questions are answered, execute in this order:

- [x] Step 1: Define repository interfaces — TypeScript class signatures with all public methods for each of the 6 repositories
- [x] Step 2: Define SQL query catalog — all SQL statements (SELECT, INSERT, UPDATE, DELETE) for each repository, organized by method
- [x] Step 3: Define row mapping rules — SQLite-to-TypeScript type conversions (boolean↔integer, JSON↔string, null handling)
- [x] Step 4: Define transaction boundaries — which operations require transactions, how cross-repo transactions work
- [x] Step 5: Define error handling — which methods throw which errors, edge cases per repository
- [x] Step 6: Validate completeness — all 39 methods from component-methods.md covered, all 11 Unit 2 stories supported
