# Unit of Work — Smart Agentic Calendar MCP Server

## Decomposition Summary

| Decision | Choice | Rationale |
|---|---|---|
| Implementation order | Bottom-up (A) | Build foundations first, each layer tested before the next |
| Scheduling engine scope | Single unit (A) | Scheduler, conflict detector, dependency resolver, replan coordinator are tightly coupled — one execution pipeline |
| Analytics timing | Include in initial implementation (A) | Analytics is core to the "smart" calendar value prop; data model requires event tracking from day one |

## Unit Inventory

### Unit 1: Foundation

**Scope**: Data models, shared utilities, database initialization and schema

**Components**:
- `src/models/task.ts` — Task, TaskStatus, TaskPriority types
- `src/models/event.ts` — Event, EventType types
- `src/models/schedule.ts` — ScheduleBlock, ScheduleResult, ScheduleStatus types
- `src/models/config.ts` — Availability, FocusTime, Preferences types
- `src/models/conflict.ts` — Conflict, DeprioritizationSuggestion types
- `src/models/analytics.ts` — ProductivityStats, ScheduleHealth, EstimationAccuracy, TimeAllocation types
- `src/models/recurrence.ts` — RecurrenceRule, RecurrenceInstance types
- `src/models/errors.ts` — Error types (ValidationError, NotFoundError, CircularDependencyError, InvalidStateError)
- `src/common/id.ts` — ID generation utility
- `src/common/time.ts` — Time/date utility functions
- `src/common/constants.ts` — Application constants (defaults, limits)
- `src/storage/database.ts` — SQLite connection, schema creation, migrations

**Responsibilities**:
- Define all TypeScript interfaces and types used across the system
- Provide shared utilities (ID generation, time manipulation, constants)
- Initialize SQLite database with complete schema (all tables for all units)
- Error type hierarchy

**Files**: ~12 source files
**Dependencies**: None (leaf unit)

---

### Unit 2: Storage

**Scope**: All repository classes providing CRUD data access over SQLite

**Components**:
- `src/storage/task-repository.ts` — Task CRUD, filtering, dependency storage
- `src/storage/event-repository.ts` — Event CRUD, date range queries
- `src/storage/config-repository.ts` — Availability, focus time, preferences persistence
- `src/storage/schedule-repository.ts` — Schedule block storage, schedule snapshots
- `src/storage/analytics-repository.ts` — Completion logs, duration tracking, time allocation data
- `src/storage/recurrence-repository.ts` — Recurrence templates, instance tracking, exception overrides

**Responsibilities**:
- Encapsulate all SQL queries behind typed repository interfaces
- Provide transactional guarantees via better-sqlite3 synchronous API
- Handle query filtering, ordering, and pagination
- Map between SQLite rows and model types

**Files**: 6 source files
**Dependencies**: Unit 1 (models, database)

---

### Unit 3: Scheduling Engine

**Scope**: Core scheduling algorithm, dependency resolution, conflict detection, recurrence management, and background replan coordination

**Components**:
- `src/engine/scheduler.ts` — Constraint satisfaction solver: hard constraints (deadlines, availability, events, dependencies) then soft constraints (energy, buffer, focus time)
- `src/engine/dependency-resolver.ts` — Cycle detection, topological sort, blocked task identification
- `src/engine/conflict-detector.ts` — Deadline feasibility analysis, at-risk detection, deprioritization suggestions
- `src/engine/replan-coordinator.ts` — Dirty flag + setImmediate pattern, debouncing, schedule status tracking
- `src/engine/recurrence-manager.ts` — RRULE parsing (via rrule.js), instance generation within scheduling horizon, exception handling

**Responsibilities**:
- Generate optimized time-block schedules respecting all constraints
- Detect and report deadline conflicts with actionable suggestions
- Manage the background replan lifecycle (trigger, debounce, status)
- Resolve task dependencies (cycle detection, topological ordering)
- Generate and manage recurring task instances

**Files**: 5 source files
**Dependencies**: Unit 1 (models), Unit 2 (task-repo, event-repo, config-repo, schedule-repo, recurrence-repo)

---

### Unit 4: Analytics

**Scope**: Productivity statistics, schedule health scoring, estimation accuracy analysis, and time allocation breakdown

**Components**:
- `src/analytics/analytics-engine.ts` — Orchestrator that delegates to specialized calculators
- `src/analytics/productivity.ts` — Completion rates, on-time rates, trends over periods
- `src/analytics/health.ts` — Schedule health score (0-100), utilization, overdue/at-risk counts
- `src/analytics/estimation.ts` — Estimated vs. actual duration comparison, accuracy metrics
- `src/analytics/allocation.ts` — Time distribution by category, period breakdowns

**Responsibilities**:
- Compute productivity metrics from completed task history
- Calculate schedule health scores from current schedule state
- Analyze estimation accuracy trends across task categories
- Break down time allocation by category and period

**Files**: 5 source files
**Dependencies**: Unit 1 (models), Unit 2 (analytics-repo, task-repo, schedule-repo, config-repo)

---

### Unit 5: MCP Server

**Scope**: MCP tool handlers, input validation, server setup, and composition root

**Components**:
- `src/mcp/tools/task-tools.ts` — create_task, update_task, complete_task, delete_task, list_tasks
- `src/mcp/tools/event-tools.ts` — create_event, update_event, delete_event, list_events
- `src/mcp/tools/schedule-tools.ts` — get_schedule, replan, get_conflicts
- `src/mcp/tools/analytics-tools.ts` — get_productivity_stats, get_schedule_health, get_estimation_accuracy, get_time_allocation
- `src/mcp/tools/config-tools.ts` — set_availability, set_focus_time, set_preferences, get_preferences
- `src/mcp/validators.ts` — Input validation for all tool parameters
- `src/mcp/server.ts` — MCP server setup, tool registration, stdio transport
- `src/index.ts` — Composition root: instantiate all components in DI order

**Responsibilities**:
- Expose all functionality as MCP tools over stdio
- Validate all incoming tool parameters
- Orchestrate the mutation → immediate return → background replan pattern
- Orchestrate the read → return with status pattern
- Wire all components together via constructor injection

**Files**: 8 source files
**Dependencies**: Unit 1 (models), Unit 2 (all repositories), Unit 3 (engine), Unit 4 (analytics)

---

## Code Organization Strategy (Greenfield)

```
SmartAgenticCalendar/
  src/
    models/          # Unit 1: Types and interfaces
    common/          # Unit 1: Shared utilities
    storage/         # Unit 1 (database.ts) + Unit 2 (repositories)
    engine/          # Unit 3: Scheduling engine
    analytics/       # Unit 4: Analytics calculators
    mcp/             # Unit 5: MCP server and tools
      tools/         # Unit 5: Individual tool handlers
    index.ts         # Unit 5: Composition root
  tests/
    unit/            # Per-unit test files
    pbt/             # Property-based tests (scheduling, serialization)
  package.json
  tsconfig.json
```

## Implementation Sequence

```
Unit 1: Foundation ──► Unit 2: Storage ──► Unit 3: Scheduling Engine ──► Unit 4: Analytics ──► Unit 5: MCP Server
     (models,              (repositories)      (scheduler, replan,          (productivity,        (tools, server,
      common,                                   conflicts, deps,             health, estimation,   validators,
      database)                                 recurrence)                  allocation)           composition root)
```

Each unit is fully implemented and tested before starting the next. Unit 5 integrates everything and is the final deliverable.
