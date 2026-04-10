# Domain Entities — Unit 5: MCP Server

## Overview

Unit 5 is the **integration and presentation layer** — it does not define new persistent entities. It consumes types from Units 1-4 and defines MCP-specific input/output types that map between snake_case MCP tool parameters and the internal camelCase model types.

This document catalogs the types consumed, the MCP input/output types for each tool, and the enriched response types.

---

## 1. Existing Types Consumed

### From Unit 1: Models

| Type | Purpose | Used By |
|------|---------|---------|
| `Task` | Full task entity | TaskTools |
| `TaskPriority` | P1-P4 enum | TaskTools, validators |
| `TaskStatus` | pending/scheduled/completed/cancelled/at_risk | TaskTools, ScheduleTools |
| `Event` | Fixed event entity | EventTools |
| `TimeBlock` | Scheduled time block | ScheduleTools |
| `ScheduleResult` | Schedule generation result (blocks + conflicts + atRisk) | ScheduleTools |
| `ScheduleStatus` | "up_to_date" / "replan_in_progress" | ScheduleTools |
| `Conflict` | Deadline conflict with suggestions | ScheduleTools |
| `AtRiskTask` | Task flagged as at-risk | ScheduleTools |
| `DeprioritizationSuggestion` | Deprioritization recommendation | ScheduleTools |
| `ProductivityStats` | Completion/on-time rates | AnalyticsTools |
| `ScheduleHealth` | Health score, utilization | AnalyticsTools |
| `EstimationAccuracy` | Estimated vs actual accuracy | AnalyticsTools |
| `TimeAllocation` | Per-category time breakdown | AnalyticsTools |
| `Availability`, `DayAvailability`, `DayOfWeek` | Availability windows | ConfigTools |
| `FocusTime`, `FocusBlock` | Focus time configuration | ConfigTools |
| `Preferences` | Scheduling preferences | ConfigTools |
| `UserConfig` | Full config composite | ConfigTools |
| `RecurrenceTemplate`, `RecurrenceInstance` | Recurrence data | TaskTools |
| `AppError`, `ValidationError`, `NotFoundError`, `CircularDependencyError`, `InvalidStateError` | Error types | All tool handlers |

### From Unit 2: Repositories

| Type | Purpose | Used By |
|------|---------|---------|
| `TaskRepository` | Task CRUD and filtering | TaskTools |
| `EventRepository` | Event CRUD and date range queries | EventTools |
| `ScheduleRepository` | Schedule block read + status | ScheduleTools |
| `ConfigRepository` | Availability, focus time, preferences | ConfigTools |
| `AnalyticsRepository` | (indirect via AnalyticsEngine) | AnalyticsTools |
| `RecurrenceRepository` | (indirect via RecurrenceManager) | TaskTools |
| `TaskFilters` | Filter interface for list_tasks | TaskTools, validators |

### From Unit 3: Engine

| Type | Purpose | Used By |
|------|---------|---------|
| `Scheduler` | Schedule generation | (indirect via ReplanCoordinator) |
| `ReplanCoordinator` | Background replan lifecycle | TaskTools, EventTools, ScheduleTools, ConfigTools |
| `ConflictDetector` | Conflict detection | ScheduleTools |
| `DependencyResolver` | Cycle detection, topological sort | TaskTools |
| `RecurrenceManager` | Recurring task creation/management | TaskTools |

### From Unit 4: Analytics

| Type | Purpose | Used By |
|------|---------|---------|
| `AnalyticsEngine` | Analytics orchestrator | AnalyticsTools |

---

## 2. MCP Input Types (snake_case)

All MCP tool parameters use snake_case naming (Q3: A). Validators map these to internal camelCase types.

### TaskTools Input Types

```
CreateTaskInput {
  title: string                          // required
  description?: string                   // optional, defaults to null
  estimated_duration: number             // required, positive integer (minutes)
  deadline?: string                      // optional, ISO 8601 UTC datetime
  priority?: string                      // optional, defaults to "P3"; valid: P1, P2, P3, P4
  category?: string                      // optional, defaults to null
  tags?: string[]                        // optional, defaults to []
  recurrence_rule?: string               // optional, RRULE string; if present, creates recurring task
  blocked_by?: string[]                  // optional, task IDs this task depends on
}

UpdateTaskInput {
  task_id: string                        // required
  title?: string                         // optional
  description?: string                   // optional
  estimated_duration?: number            // optional, positive integer
  deadline?: string                      // optional, ISO 8601 UTC datetime; pass null to clear
  priority?: string                      // optional, valid: P1, P2, P3, P4
  category?: string                      // optional
  tags?: string[]                        // optional
  blocked_by?: string[]                  // optional, replaces dependency list
}

CompleteTaskInput {
  task_id: string                        // required
  actual_duration_minutes?: number       // optional, positive integer; defaults to estimated duration
}

DeleteTaskInput {
  task_id: string                        // required
}

ListTasksInput {
  status?: string                        // optional, valid: pending, scheduled, completed, cancelled, at_risk
  priority?: string                      // optional, valid: P1, P2, P3, P4
  deadline_before?: string               // optional, ISO 8601 UTC datetime
  deadline_after?: string                // optional, ISO 8601 UTC datetime
  category?: string                      // optional
}
```

### EventTools Input Types

```
CreateEventInput {
  title: string                          // required
  start_time?: string                    // required for timed events, ISO 8601 UTC datetime
  end_time?: string                      // required for timed events, ISO 8601 UTC datetime
  is_all_day?: boolean                   // optional, defaults to false
  date?: string                          // required for all-day events, ISO 8601 date (YYYY-MM-DD)
}

UpdateEventInput {
  event_id: string                       // required
  title?: string                         // optional
  start_time?: string                    // optional, ISO 8601 UTC datetime
  end_time?: string                      // optional, ISO 8601 UTC datetime
  is_all_day?: boolean                   // optional
  date?: string                          // optional, ISO 8601 date
}

DeleteEventInput {
  event_id: string                       // required
}

ListEventsInput {
  start_date: string                     // required, ISO 8601 date or datetime
  end_date: string                       // required, ISO 8601 date or datetime
}
```

### ScheduleTools Input Types

```
GetScheduleInput {
  start_date: string                     // required, ISO 8601 date or datetime
  end_date: string                       // required, ISO 8601 date or datetime
}

ReplanInput {
  // No parameters — triggers a synchronous replan of the full horizon
}

GetConflictsInput {
  // No parameters — returns all current conflicts
}
```

### AnalyticsTools Input Types

```
GetProductivityStatsInput {
  period: string                         // required, valid: day, week, month
}

GetScheduleHealthInput {
  // No parameters
}

GetEstimationAccuracyInput {
  period: string                         // required, valid: day, week, month
}

GetTimeAllocationInput {
  period: string                         // required, valid: day, week, month
}
```

### ConfigTools Input Types

```
SetAvailabilityInput {
  windows: Array<{
    day: number                          // required, 0-6 (Sunday=0, Monday=1, ..., Saturday=6)
    start_time: string                   // required, "HH:MM" format
    end_time: string                     // required, "HH:MM" format
  }>
}

SetFocusTimeInput {
  blocks: Array<{
    day: number                          // required, 0-6
    start_time: string                   // required, "HH:MM" format
    end_time: string                     // required, "HH:MM" format
  }>
  minimum_block_minutes?: number         // optional, defaults to 60
}

SetPreferencesInput {
  buffer_time_minutes?: number           // optional, non-negative integer
  default_priority?: string              // optional, valid: P1, P2, P3, P4
  default_duration?: number              // optional, positive integer (minutes)
  scheduling_horizon_weeks?: number      // optional, 1-12
  minimum_block_minutes?: number         // optional, 15-120
}

GetPreferencesInput {
  // No parameters
}
```

---

## 3. MCP Output Types (snake_case)

All MCP tool responses return snake_case JSON for consistency with input parameters.

### TaskOutput (used by create, update, complete, get)

```
TaskOutput {
  task: {
    id: string
    title: string
    description: string | null
    estimated_duration: number
    deadline: string | null
    priority: string
    status: string
    category: string | null
    tags: string[]
    is_recurring: boolean
    recurrence_template_id: string | null
    actual_duration: number | null
    created_at: string
    updated_at: string
  }
}
```

### RecurringTaskOutput (used by create_task with recurrence_rule)

```
RecurringTaskOutput {
  template_id: string
  instances: Array<{
    instance_id: string
    task_id: string
    scheduled_date: string
  }>
  message: string
}
```

### DeleteTaskOutput

```
DeleteTaskOutput {
  task_id: string
  status: "cancelled"
  affected_dependents: string[]          // IDs of tasks that depended on this task
  message: string
}
```

### ListTasksOutput

```
ListTasksOutput {
  tasks: TaskOutput["task"][]
  count: number
}
```

### EventOutput (used by create, update)

```
EventOutput {
  event: {
    id: string
    title: string
    start_time: string | null
    end_time: string | null
    is_all_day: boolean
    date: string | null
    created_at: string
    updated_at: string
  }
}
```

### DeleteEventOutput

```
DeleteEventOutput {
  event_id: string
  message: string
}
```

### ListEventsOutput

```
ListEventsOutput {
  events: EventOutput["event"][]
  count: number
}
```

### EnrichedTimeBlock (Q4: A — enriched schedule response)

```
EnrichedTimeBlock {
  id: string
  task_id: string
  start_time: string
  end_time: string
  date: string
  block_index: number
  total_blocks: number
  // Enrichment fields from Task:
  task_title: string
  task_priority: string
  task_category: string | null
  task_status: string
}
```

### GetScheduleOutput

```
GetScheduleOutput {
  schedule: EnrichedTimeBlock[]
  schedule_status: string                // "up_to_date" or "replan_in_progress"
  message?: string                       // present when replan_in_progress
}
```

### ReplanOutput

```
ReplanOutput {
  schedule: EnrichedTimeBlock[]
  conflicts: ConflictOutput[]
  schedule_status: "up_to_date"
  message: string
}
```

### ConflictOutput

```
ConflictOutput {
  task_id: string
  reason: string                         // "insufficient_time" | "dependency_chain" | "overdue"
  deadline: string | null
  required_minutes: number
  available_minutes: number
  competing_task_ids: string[]
  suggestions: Array<{
    task_id: string
    current_priority: string
    freed_minutes: number
  }>
}
```

### GetConflictsOutput

```
GetConflictsOutput {
  conflicts: ConflictOutput[]
  schedule_status: string
}
```

### Analytics Outputs

Analytics tools return the existing model types mapped to snake_case:

```
ProductivityStatsOutput {
  period: string
  tasks_completed: number
  tasks_overdue: number
  tasks_cancelled: number
  completion_rate: number
  on_time_rate: number
}

ScheduleHealthOutput {
  health_score: number
  utilization_percentage: number
  overdue_count: number
  at_risk_count: number
  free_hours_this_week: number
  busiest_day: string
  lightest_day: string
}

EstimationAccuracyOutput {
  average_accuracy_percentage: number | null
  overestimate_count: number
  underestimate_count: number
  average_overestimate_minutes: number | null
  average_underestimate_minutes: number | null
  accuracy_by_category: Record<string, number> | null
}

TimeAllocationOutput {
  period: string
  categories: Array<{
    category: string
    hours: number
    percentage: number
  }>
}
```

### ConfigOutputs

```
AvailabilityOutput {
  windows: Array<{
    day: number
    start_time: string
    end_time: string
  }>
  message: string
}

FocusTimeOutput {
  blocks: Array<{
    day: number
    start_time: string
    end_time: string
  }>
  minimum_block_minutes: number
  message: string
}

PreferencesOutput {
  buffer_time_minutes: number
  default_priority: string
  default_duration: number
  scheduling_horizon_weeks: number
  minimum_block_minutes: number
}

GetPreferencesOutput {
  availability: AvailabilityOutput
  focus_time: FocusTimeOutput
  preferences: PreferencesOutput
}
```

### MCP Error Response (Q1: A)

```
ErrorOutput (via isError: true) {
  code: string                           // VALIDATION_ERROR | NOT_FOUND | CIRCULAR_DEPENDENCY | INVALID_STATE
  message: string
}
```

---

## 4. Component Structure

```
src/mcp/
  server.ts                              # McpServer — tool registration, error wrapper, stdio transport
  validators.ts                          # Input validation + snake_case → camelCase mapping
  tools/
    task-tools.ts                        # TaskTools — 6 tool handlers
    event-tools.ts                       # EventTools — 4 tool handlers
    schedule-tools.ts                    # ScheduleTools — 3 tool handlers
    analytics-tools.ts                   # AnalyticsTools — 4 tool handlers
    config-tools.ts                      # ConfigTools — 4 tool handlers
src/index.ts                             # Composition root — DI wiring
```

### Component Dependency Graph

```
McpServer
  |
  +-- TaskTools -----------> TaskRepository
  |                          RecurrenceManager
  |                          DependencyResolver
  |                          ReplanCoordinator
  |
  +-- EventTools ----------> EventRepository
  |                          ReplanCoordinator
  |
  +-- ScheduleTools -------> ScheduleRepository
  |                          TaskRepository
  |                          ReplanCoordinator
  |                          ConflictDetector
  |
  +-- AnalyticsTools ------> AnalyticsEngine
  |
  +-- ConfigTools ----------> ConfigRepository
                              ReplanCoordinator
```

### Constructor Signatures

```
TaskTools(
  taskRepo: TaskRepository,
  recurrenceManager: RecurrenceManager,
  dependencyResolver: DependencyResolver,
  replanCoordinator: ReplanCoordinator
)

EventTools(
  eventRepo: EventRepository,
  replanCoordinator: ReplanCoordinator
)

ScheduleTools(
  scheduleRepo: ScheduleRepository,
  taskRepo: TaskRepository,
  replanCoordinator: ReplanCoordinator,
  conflictDetector: ConflictDetector
)

AnalyticsTools(
  analyticsEngine: AnalyticsEngine
)

ConfigTools(
  configRepo: ConfigRepository,
  replanCoordinator: ReplanCoordinator
)

McpServer(
  taskTools: TaskTools,
  eventTools: EventTools,
  scheduleTools: ScheduleTools,
  analyticsTools: AnalyticsTools,
  configTools: ConfigTools
)
```

---

## 5. snake_case Mapping Utility

The `validators.ts` module provides bidirectional mapping:

### Input mapping: snake_case MCP params → camelCase internal types

```
mapCreateTaskInput(input: CreateTaskInput): TaskInput + dependency IDs + recurrence rule
mapUpdateTaskInput(input: UpdateTaskInput): { id, updates: TaskUpdates, blockedBy?: string[] }
mapListTasksInput(input: ListTasksInput): TaskFilters
mapCreateEventInput(input: CreateEventInput): EventInput
mapUpdateEventInput(input: UpdateEventInput): { id, updates: EventUpdates }
mapSetAvailabilityInput(input: SetAvailabilityInput): Availability
mapSetFocusTimeInput(input: SetFocusTimeInput): FocusTime
mapSetPreferencesInput(input: SetPreferencesInput): Partial<Preferences>
```

### Output mapping: camelCase internal types → snake_case MCP responses

```
mapTaskOutput(task: Task): TaskOutput["task"]
mapEventOutput(event: Event): EventOutput["event"]
mapTimeBlockOutput(block: TimeBlock, task: Task): EnrichedTimeBlock
mapConflictOutput(conflict: Conflict): ConflictOutput
mapProductivityOutput(stats: ProductivityStats): ProductivityStatsOutput
mapHealthOutput(health: ScheduleHealth): ScheduleHealthOutput
mapEstimationOutput(accuracy: EstimationAccuracy): EstimationAccuracyOutput
mapAllocationOutput(allocation: TimeAllocation): TimeAllocationOutput
mapAvailabilityOutput(availability: Availability): AvailabilityOutput
mapFocusTimeOutput(focusTime: FocusTime): FocusTimeOutput
mapPreferencesOutput(preferences: Preferences): PreferencesOutput
```

---

## 6. No New Persistent Entities

Unit 5 introduces **zero new database tables or stored entities**. All data is:
- **Validated** from MCP tool input parameters
- **Mapped** to internal camelCase types
- **Delegated** to repositories (Units 1-2), engine (Unit 3), or analytics (Unit 4)
- **Mapped back** to snake_case response types for MCP output

This aligns with the thin-tool-handler design philosophy from the services document.
