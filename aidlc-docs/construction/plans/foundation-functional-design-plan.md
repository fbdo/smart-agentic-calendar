# Functional Design Plan — Unit 1: Foundation

## Overview
Design the data models, shared utilities, error types, and database schema for the Smart Agentic Calendar MCP Server. This is the leaf unit — all other units depend on these types and infrastructure.

---

## Planning Questions

### Question 1
How should task IDs be generated?

A) UUID v4 — universally unique, no collision risk, standard format (e.g., `550e8400-e29b-41d4-a716-446655440000`)
B) Prefixed nanoid — shorter, URL-safe, type-prefixed for readability (e.g., `task_V1StGXR8_Z5jdHi6B-myT`, `evt_xYz...`)
C) Auto-increment integer — simplest, sequential, SQLite native (e.g., `1`, `2`, `3`)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

### Question 2
How should time/dates be stored and handled internally?

A) UTC ISO 8601 strings everywhere — stored as TEXT in SQLite, parsed on read (e.g., `"2026-04-10T09:00:00Z"`)
B) Unix timestamps (milliseconds) — stored as INTEGER in SQLite, efficient comparison/sorting
C) Mixed — UTC ISO strings for display/API, Unix timestamps for internal computation and storage
X) Other (please describe after [Answer]: tag below)

[Answer]: A

### Question 3
What energy level model should be used for scheduling preferences?

A) Simple time-based — map time ranges to energy levels: "peak" (e.g., 9-12), "normal" (e.g., 12-14, 15-17), "low" (e.g., 14-15). Tasks with high priority gravitate toward peak hours.
B) Numeric scale — energy as a number 1-5 per hour block, tasks have a preferred energy level. Scheduler matches task energy need to time slot energy.
C) No explicit energy model — rely on focus time configuration as the only energy proxy. High-priority tasks get earlier slots, focus time protects deep work.
X) Other (please describe after [Answer]: tag below)

[Answer]: C

### Question 4
How granular should task splitting be?

A) Configurable minimum block — tasks can be split into blocks no smaller than a configurable minimum (default: 30 minutes). A 3-hour task could become 2h + 1h or 1.5h + 1.5h.
B) Fixed split sizes — tasks split into equal-duration blocks of a configured size (default: 60 minutes). A 3-hour task becomes 3 × 1h blocks.
C) No splitting — tasks are always scheduled as single contiguous blocks. If a task doesn't fit in any single slot, it's marked at-risk.
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Generation Steps

After questions are answered, execute in this order:

- [ ] Step 1: Define domain entities — all TypeScript interfaces/types for models layer
- [ ] Step 2: Define business rules — validation rules, constraints, and invariants for each entity
- [ ] Step 3: Define database schema — SQLite table definitions, indexes, and migration strategy
- [ ] Step 4: Define shared utilities — ID generation, time utilities, constants, error types
- [ ] Step 5: Validate completeness — ensure all fields referenced in stories and component-methods.md are covered
