# Component Inventory — Smart Agentic Calendar MCP Server

## Architecture Overview

```
src/
  models/           # Domain types, interfaces, enums
  storage/          # Data access layer (SQLite via better-sqlite3)
  engine/           # Core business logic (scheduling, recurrence, conflicts)
  analytics/        # Analytics computation
  mcp/              # MCP server layer (tools, transport)
  common/           # Shared utilities, errors, constants
  index.ts          # Composition root (DI wiring)
```

**Dependency direction**: `mcp/` → `engine/` → `storage/` → `models/`. Never the reverse.

---

## Component: Models Layer (`src/models/`)

### Purpose
Define all domain types, interfaces, and enums used across layers.

### Responsibilities
- Define `Task`, `Event`, `Schedule`, `TimeBlock`, `Conflict` types
- Define `RecurrenceTemplate`, `RecurrenceInstance` types
- Define `UserConfig`, `Availability`, `FocusTime`, `Preferences` types
- Define `ScheduleStatus` enum (`up_to_date`, `replan_in_progress`)
- Define shared error types and error codes
- Define MCP tool input/output types

### Files
- `task.ts` — Task, TaskStatus, TaskPriority, TaskDependency
- `event.ts` — Event, EventType (timed, all-day)
- `schedule.ts` — Schedule, TimeBlock, ScheduleStatus, ScheduleResult
- `config.ts` — UserConfig, Availability, FocusTime, Preferences
- `conflict.ts` — Conflict, ConflictReason, DeprioritizationSuggestion
- `analytics.ts` — ProductivityStats, ScheduleHealth, EstimationAccuracy, TimeAllocation
- `recurrence.ts` — RecurrenceTemplate, RecurrenceInstance, RecurrenceException
- `errors.ts` — AppError, ErrorCode enum (VALIDATION_ERROR, NOT_FOUND, CIRCULAR_DEPENDENCY, INVALID_STATE)

---

## Component: Storage Layer (`src/storage/`)

### Purpose
Data access layer providing typed repositories over SQLite (better-sqlite3).

### Responsibilities
- Manage SQLite database connection and schema migrations
- Provide typed CRUD repositories for all entities
- Handle prepared statements for performance
- Manage ACID transactions
- Schema versioning via `PRAGMA user_version`

### Sub-components
- **Database** (`database.ts`) — Connection management, schema initialization, migration runner
- **TaskRepository** (`task-repository.ts`) — Task CRUD, dependency management, status transitions
- **EventRepository** (`event-repository.ts`) — Event CRUD, time range queries
- **ConfigRepository** (`config-repository.ts`) — Availability, focus time, preferences persistence
- **ScheduleRepository** (`schedule-repository.ts`) — Scheduled time blocks persistence, schedule status tracking
- **AnalyticsRepository** (`analytics-repository.ts`) — Historical data, completion records, duration tracking
- **RecurrenceRepository** (`recurrence-repository.ts`) — Recurrence templates, instance tracking, exceptions

---

## Component: Engine Layer (`src/engine/`)

### Purpose
Core business logic: scheduling, replanning, recurrence, conflict detection.

### Responsibilities
- Constraint satisfaction scheduling algorithm
- Background replan coordination (dirty flag + setImmediate)
- Recurrence instance generation from RRULE patterns
- Conflict detection and deprioritization suggestions
- Dependency graph validation (cycle detection)

### Sub-components
- **Scheduler** (`scheduler.ts`) — Constraint satisfaction solver, schedule generation, task placement
- **ReplanCoordinator** (`replan-coordinator.ts`) — Background replan triggering, dirty flag, debouncing, schedule status management
- **ConflictDetector** (`conflict-detector.ts`) — Infeasible deadline detection, at-risk identification, deprioritization suggestions
- **RecurrenceManager** (`recurrence-manager.ts`) — RRULE parsing, instance generation within scheduling horizon, exception handling
- **DependencyResolver** (`dependency-resolver.ts`) — Dependency graph construction, cycle detection, topological ordering

---

## Component: Analytics Layer (`src/analytics/`)

### Purpose
Compute productivity metrics, schedule health, and time allocation analytics.

### Responsibilities
- Calculate completion rates and trends
- Compute schedule health scores
- Analyze estimation accuracy (estimated vs. actual duration)
- Generate time allocation breakdowns by category

### Sub-components
- **AnalyticsEngine** (`analytics-engine.ts`) — Orchestrates all analytics computations, delegates to specialized calculators
- **ProductivityCalculator** (`productivity.ts`) — Completion rate, on-time rate, overdue counts
- **HealthCalculator** (`health.ts`) — Schedule health score, utilization, busiest/lightest day
- **EstimationCalculator** (`estimation.ts`) — Accuracy percentage, over/underestimate analysis
- **AllocationCalculator** (`allocation.ts`) — Time per category, percentage breakdowns

---

## Component: MCP Layer (`src/mcp/`)

### Purpose
MCP server exposing tools to AI agents over stdio transport.

### Responsibilities
- MCP server initialization and stdio transport
- Tool registration and handler dispatch
- Input validation and structured error responses
- Map tool calls to engine/storage operations
- Trigger background replans on mutations
- Include `schedule_status` in read responses

### Sub-components
- **Server** (`server.ts`) — MCP server setup, tool registration, transport configuration
- **TaskTools** (`tools/task-tools.ts`) — create_task, get_task, update_task, delete_task, list_tasks, complete_task
- **EventTools** (`tools/event-tools.ts`) — create_event, update_event, delete_event, list_events
- **ScheduleTools** (`tools/schedule-tools.ts`) — get_schedule, replan, get_conflicts
- **AnalyticsTools** (`tools/analytics-tools.ts`) — get_productivity_stats, get_schedule_health, get_estimation_accuracy, get_time_allocation
- **ConfigTools** (`tools/config-tools.ts`) — set_availability, set_focus_time, set_preferences
- **Validators** (`validators.ts`) — Input validation helpers shared across tool handlers

---

## Component: Common Layer (`src/common/`)

### Purpose
Shared utilities, constants, and cross-cutting concerns.

### Responsibilities
- ID generation (e.g., nanoid or UUID)
- Date/time utilities
- Shared constants (default priority, default duration, scheduling horizon)

### Files
- `id.ts` — ID generation utility
- `time.ts` — Date/time parsing, formatting, comparison helpers
- `constants.ts` — Default values, limits, configuration constants
