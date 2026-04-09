# Application Design — Smart Agentic Calendar MCP Server (Consolidated)

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Codebase organization | Layered folder structure | Mirrors architectural layers (storage → engine → MCP). Enforces dependency direction. |
| Dependency management | Constructor injection (DI) | Explicit dependencies, excellent testability for PBT, no framework needed |
| Background replan | Dirty flag + setImmediate | Simplest async pattern, natural debouncing, no event system overhead |
| Database abstraction | better-sqlite3 with raw SQL | Synchronous API (no unnecessary async), full SQL control, minimal dependencies |

## Architecture Overview

```
+-------------------------------------------------------------------+
|                        MCP Layer (src/mcp/)                        |
|  +----------+ +----------+ +-----------+ +-----------+ +--------+ |
|  |TaskTools | |EventTools| |SchedTools | |AnalyTools | |ConfTools||
|  +----------+ +----------+ +-----------+ +-----------+ +--------+ |
+-------------------------------------------------------------------+
        |              |            |              |            |
        v              v            v              v            v
+-------------------------------------------------------------------+
|                     Engine Layer (src/engine/)                      |
|  +-----------+ +--------+ +-----------+ +-----------+ +----------+|
|  | Scheduler | |Replan  | |Conflict   | |Recurrence | |Dependency||
|  |           | |Coord.  | |Detector   | |Manager    | |Resolver  ||
|  +-----------+ +--------+ +-----------+ +-----------+ +----------+|
+-------------------------------------------------------------------+
        |                                         |
        v                                         v
+-----------------------------------+ +-------------------------+
|   Storage Layer (src/storage/)    | | Analytics (src/analytics)|
|  +------+ +------+ +------+      | | +----------+ +--------+ |
|  |Task  | |Event | |Config|      | | |Analytics | |Health  | |
|  |Repo  | |Repo  | |Repo  |      | | |Engine    | |Calc    | |
|  +------+ +------+ +------+      | | +----------+ +--------+ |
|  +------+ +------+ +------+      | +-------------------------+
|  |Sched | |Analyt| |Recur |      |
|  |Repo  | |Repo  | |Repo  |      |
|  +------+ +------+ +------+      |
|  +----------+                     |
|  | Database |                     |
|  +----------+                     |
+-----------------------------------+
        |
        v
+-----------------------------------+
|    Models Layer (src/models/)     |
|  Task, Event, Schedule, Config,  |
|  Conflict, Analytics, Recurrence |
+-----------------------------------+
        |
        v
+-----------------------------------+
|    Common Layer (src/common/)     |
|  ID generation, time utils,      |
|  constants, error types           |
+-----------------------------------+
```

## Folder Structure

```
src/
  models/
    task.ts
    event.ts
    schedule.ts
    config.ts
    conflict.ts
    analytics.ts
    recurrence.ts
    errors.ts
  storage/
    database.ts
    task-repository.ts
    event-repository.ts
    config-repository.ts
    schedule-repository.ts
    analytics-repository.ts
    recurrence-repository.ts
  engine/
    scheduler.ts
    replan-coordinator.ts
    conflict-detector.ts
    recurrence-manager.ts
    dependency-resolver.ts
  analytics/
    analytics-engine.ts
    productivity.ts
    health.ts
    estimation.ts
    allocation.ts
  mcp/
    server.ts
    validators.ts
    tools/
      task-tools.ts
      event-tools.ts
      schedule-tools.ts
      analytics-tools.ts
      config-tools.ts
  common/
    id.ts
    time.ts
    constants.ts
  index.ts
```

**Total**: ~30 source files across 6 layers.

## Key Orchestration Patterns

### 1. Mutation → Immediate Return → Background Replan
All write tools (create/update/delete/complete tasks/events, config changes) persist the change, call `replanCoordinator.requestReplan()`, and return immediately. The replan runs asynchronously via `setImmediate` with dirty-flag debouncing.

### 2. Read → Return with Status
Read tools (`get_schedule`, `get_conflicts`) return the current schedule immediately with a `schedule_status` field indicating whether the data is current (`"up_to_date"`) or stale (`"replan_in_progress"`).

### 3. Synchronous Replan
The explicit `replan` tool calls `replanCoordinator.awaitReplan()`, which blocks until the background replan completes and returns the updated schedule.

### 4. Pure Computation
Analytics and query tools compute results from stored data with no side effects and no replan triggering.

## Dependency Injection Wiring

All components are created in `src/index.ts` (composition root) in dependency order:

1. Database → 2. Repositories (7) → 3. Engine components (5) → 4. Analytics (1) → 5. MCP Tools (5) → 6. MCP Server (1)

**19 components total**, no circular dependencies, all explicit via constructor injection.

## Cross-References

- **Component details**: `components.md`
- **Method signatures**: `component-methods.md`
- **Service orchestration**: `services.md`
- **Dependency relationships**: `component-dependency.md`
