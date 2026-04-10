# Smart Agentic Calendar

A local-first smart calendar MCP server for AI agents. Inspired by [Reclaim.ai](https://reclaim.ai/) and [Motion](https://www.usemotion.com/), it automatically re-plans tasks, recalculates the schedule, and helps AI agents act as personal scheduling assistants.

## What It Does

- **Time-blocking scheduler** that assigns specific time slots to tasks based on deadlines, durations, and priorities (P1-P4)
- **Automatic replanning** triggered on any change (create, update, delete, complete) — runs in the background so tool responses are instant
- **Constraint satisfaction** engine that respects hard constraints (deadlines, availability, events, dependencies) and optimizes soft constraints (priority, focus time, buffer time)
- **Focus time protection** for deep work blocks with minimum uninterrupted duration enforcement
- **Task splitting** across multiple time slots when no single slot fits
- **Recurring tasks** with full RRULE support (daily, weekly, monthly, yearly, custom patterns)
- **Task dependencies** with cycle detection
- **Conflict detection** that identifies at-risk tasks and suggests deprioritizations
- **Analytics** — completion rates, schedule health, estimation accuracy, time allocation by category

## Architecture

```
src/
  models/       Domain types (Task, Event, TimeBlock, Config, etc.)
  common/       Shared utilities (ID generation, time functions, constants)
  storage/      SQLite database layer (better-sqlite3)
  services/     Business logic and orchestration (Units 2-4)
  mcp/          MCP server and tool handlers (Unit 5)
```

Single-user, single-process, local-first. All data stored in a local SQLite database with no external service dependencies.

## Tech Stack

| Component | Choice |
|-----------|--------|
| Language | TypeScript (strict mode) |
| Runtime | Node.js >= 20 |
| Storage | SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| MCP Transport | stdio |
| Test Runner | [Vitest](https://vitest.dev/) |
| Scheduling | Constraint satisfaction algorithm |

## MCP Tools

### Task Management
- `create_task` — create a task with title, duration, deadline, priority, category, tags
- `get_task` — retrieve a task by ID
- `update_task` — update any task field (triggers background replan)
- `delete_task` — soft-delete a task (triggers background replan)
- `complete_task` — mark a task done, optionally record actual duration
- `list_tasks` — query tasks with filters (status, priority, deadline range, category)

### Event Management
- `create_event` — create a fixed calendar event that blocks time
- `update_event` — modify an event
- `delete_event` — remove an event
- `list_events` — query events by date range

### Schedule & Conflicts
- `get_schedule` — view scheduled time blocks for a date range (returns `schedule_status`: "up_to_date" or "replan_in_progress")
- `replan` — force a synchronous replan (the only blocking replan path)
- `get_conflicts` — view at-risk tasks and deadline conflicts

### Analytics
- `get_productivity_stats` — completion rates, on-time rates by period
- `get_schedule_health` — composite health score, utilization, overdue/at-risk counts
- `get_time_allocation` — hours breakdown by category
- `get_estimation_accuracy` — estimated vs. actual duration analysis

### Configuration
- `set_availability` — define work hours per day of week
- `set_focus_time` — define focus/deep-work blocks
- `set_preferences` — buffer time, default priority, scheduling horizon, minimum block size

## Getting Started

### Prerequisites

- Node.js >= 20

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm test              # run all tests
npm run test:watch    # watch mode
npm run test:coverage # with coverage
```

## Development

This project follows **test-driven development** (red-green-refactor) with a healthy test pyramid and dependency injection for testability. Property-based tests are used for pure scheduling functions and serialization round-trips.

## Project Status

Under active development. Current progress:

- [x] **Unit 1: Foundation** — models, common utilities, database schema (74 tests)
- [ ] **Unit 2: Storage** — repository layer (CRUD operations)
- [ ] **Unit 3: Scheduling Engine** — constraint satisfaction, replanning, conflict detection
- [ ] **Unit 4: Analytics** — productivity stats, schedule health, estimation accuracy
- [ ] **Unit 5: MCP Server** — tool handlers, stdio transport

## License

MIT
