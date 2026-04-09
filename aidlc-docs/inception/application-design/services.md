# Service Layer & Orchestration — Smart Agentic Calendar MCP Server

## Orchestration Philosophy

This system uses **thin tool handlers** that orchestrate components via dependency injection. There is no separate "service layer" abstraction — the MCP tool handlers ARE the orchestration layer. They coordinate between repositories, engine components, and the replan coordinator.

This is intentional: adding a service layer between MCP tools and engine/storage would be an unnecessary abstraction for a single-user local-first application.

---

## Orchestration Patterns

### Pattern 1: Mutation → Immediate Return → Background Replan

Used by: `create_task`, `update_task`, `delete_task`, `complete_task`, `create_event`, `update_event`, `delete_event`, `set_availability`, `set_focus_time`, `set_preferences`

```
Agent calls MCP tool
  → Tool handler validates input
  → Tool handler calls repository to persist change
  → Tool handler calls replanCoordinator.requestReplan()
  → Tool handler returns result immediately
  
  (async, in background via setImmediate)
  → ReplanCoordinator checks dirty flag
  → If dirty: sets schedule_status to "replan_in_progress"
  → Calls Scheduler.generateSchedule()
  → Saves new schedule via ScheduleRepository
  → Sets schedule_status to "up_to_date"
  → Clears dirty flag
```

### Pattern 2: Read → Return with Status

Used by: `get_schedule`, `get_conflicts`

```
Agent calls MCP tool
  → Tool handler calls ScheduleRepository.getSchedule()
  → Tool handler calls ReplanCoordinator.getScheduleStatus()
  → Returns schedule data + schedule_status ("up_to_date" or "replan_in_progress")
```

### Pattern 3: Synchronous Replan

Used by: `replan` (explicit tool)

```
Agent calls replan tool
  → Tool handler calls replanCoordinator.awaitReplan()
  → Waits for any pending replan to complete (or triggers one if needed)
  → Returns updated schedule with schedule_status: "up_to_date"
```

### Pattern 4: Pure Computation (no replan)

Used by: `get_productivity_stats`, `get_schedule_health`, `get_estimation_accuracy`, `get_time_allocation`, `list_tasks`, `get_task`, `list_events`

```
Agent calls MCP tool
  → Tool handler validates input
  → Tool handler calls repository/analytics engine
  → Returns computed result
```

---

## Replan Coordinator Detail

The ReplanCoordinator manages the background replan lifecycle using a dirty flag + setImmediate debouncing pattern:

```
State:
  - dirty: boolean (initially false)
  - replanning: boolean (initially false)
  - pendingImmediate: NodeJS.Immediate | null

requestReplan():
  1. Set dirty = true
  2. If pendingImmediate is null AND replanning is false:
     a. pendingImmediate = setImmediate(() => executeReplan())

executeReplan():
  1. pendingImmediate = null
  2. If not dirty, return (nothing to do)
  3. Set dirty = false, replanning = true
  4. Set schedule_status = "replan_in_progress"
  5. Call scheduler.generateSchedule(horizonStart, horizonEnd)
  6. Save result to ScheduleRepository
  7. Set replanning = false
  8. Set schedule_status = "up_to_date"
  9. If dirty again (mutation happened during replan):
     a. setImmediate(() => executeReplan())  // replan again
```

**Key behaviors**:
- Multiple rapid `requestReplan()` calls coalesce into one `setImmediate`
- If a mutation occurs during an active replan, the dirty flag is set again and a follow-up replan runs
- `awaitReplan()` returns a promise that resolves when the current replan cycle completes

---

## Composition Root (`src/index.ts`)

The composition root creates all instances and wires dependencies:

```
1. Database (path from env or default)
2. Repositories: TaskRepository, EventRepository, ConfigRepository, 
   ScheduleRepository, AnalyticsRepository, RecurrenceRepository
3. Engine: DependencyResolver, ConflictDetector, Scheduler, 
   RecurrenceManager, ReplanCoordinator
4. Analytics: AnalyticsEngine
5. MCP Tools: TaskTools, EventTools, ScheduleTools, AnalyticsTools, ConfigTools
6. MCP Server: registers all tools, starts stdio transport
```

All dependencies flow downward. No circular dependencies. Each component receives only what it needs.
