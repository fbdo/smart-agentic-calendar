# Application Design Plan — Smart Agentic Calendar MCP Server

## Overview
This plan defines the high-level component architecture, service layer, and dependency relationships for the Smart Agentic Calendar MCP Server.

---

## Design Questions

### Question 1
How should the codebase be organized at the top level?

A) Flat module structure — all modules in `src/` (e.g., `src/storage.ts`, `src/scheduler.ts`, `src/mcp-server.ts`)
B) Layered folder structure — organized by architectural layer (e.g., `src/storage/`, `src/engine/`, `src/mcp/`, `src/models/`)
C) Feature-based folder structure — organized by domain (e.g., `src/tasks/`, `src/events/`, `src/scheduling/`, `src/analytics/`)
X) Other (please describe after [Answer]: tag below)

[Answer]: B

### Question 2
What pattern should be used for dependency management between components?

A) Dependency injection — components receive their dependencies via constructor parameters (testable, explicit)
B) Service locator — a central registry that components query for dependencies
C) Direct imports — components import and instantiate their own dependencies (simplest, least ceremony)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

### Question 3
How should the background replan coordinator be implemented?

A) Event emitter pattern — mutations emit a "replan-needed" event, a listener debounces and runs the replan
B) Queue-based — mutations enqueue a replan job, a worker processes the queue with debouncing
C) Simple flag + setImmediate — a "dirty" flag is set on mutation, `setImmediate`/`setTimeout(0)` checks and runs replan if dirty
X) Other (please describe after [Answer]: tag below)

[Answer]: C

### Question 4
What ORM or database abstraction should be used with SQLite?

A) better-sqlite3 with raw SQL — synchronous, fast, full control, no abstraction overhead
B) Drizzle ORM — type-safe, lightweight ORM with good TypeScript support
C) Knex.js — SQL query builder with migration support, no full ORM
D) Kysely — type-safe SQL query builder, zero runtime overhead
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Design Execution Steps

After questions are answered, execute in this order:

- [x] Step 1: Define component inventory with responsibilities
- [x] Step 2: Define component method signatures and interfaces
- [x] Step 3: Define service layer and orchestration patterns
- [x] Step 4: Define component dependencies and communication patterns
- [x] Step 5: Create consolidated application design document
- [x] Step 6: Validate design completeness and consistency
