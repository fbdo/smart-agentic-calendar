# Business Rules — Unit 1: Foundation

## Entity Validation Rules

### Task Validation

| Field | Rule | Error |
|---|---|---|
| title | Required, non-empty, trimmed | VALIDATION_ERROR: "title is required" |
| duration | Required, positive integer (> 0) | VALIDATION_ERROR: "duration must be a positive number of minutes" |
| priority | Must be one of: P1, P2, P3, P4 | VALIDATION_ERROR: "invalid priority, valid values: P1, P2, P3, P4" |
| deadline | If provided, must be valid ISO 8601 UTC | VALIDATION_ERROR: "deadline must be a valid ISO 8601 date" |
| category | Optional, trimmed if provided | (none) |
| tags | Optional array of strings | (none) |

**Default values on creation:**
- `priority`: P3 (from Preferences.defaultPriority)
- `duration`: 60 minutes (from Preferences.defaultDuration) — only if not provided
- `status`: "pending"
- `tags`: []
- `isRecurring`: false
- `recurrenceTemplateId`: null
- `actualDuration`: null

### Event Validation

| Field | Rule | Error |
|---|---|---|
| title | Required, non-empty, trimmed | VALIDATION_ERROR: "title is required" |
| startTime | Required for timed events, valid ISO 8601 UTC | VALIDATION_ERROR: "start time is required" |
| endTime | Required for timed events, valid ISO 8601 UTC | VALIDATION_ERROR: "end time must be after start time" |
| isAllDay | Boolean, default false | (none) |
| date | Required if isAllDay=true, YYYY-MM-DD format | VALIDATION_ERROR: "date is required for all-day events" |

**Constraint:** `endTime > startTime` (for timed events)

### Availability Validation

| Field | Rule | Error |
|---|---|---|
| day | Integer 0-6 (Sunday-Saturday) | VALIDATION_ERROR: "invalid day of week" |
| startTime | HH:MM format, valid time | VALIDATION_ERROR: "invalid time format" |
| endTime | HH:MM format, valid time, after startTime | VALIDATION_ERROR: "end time must be after start time" |

### Focus Time Validation

| Field | Rule | Error |
|---|---|---|
| blocks | Each block must be within availability for that day | VALIDATION_ERROR: "focus time must be within availability hours" |
| minimumBlockMinutes | Positive integer, default 60 | VALIDATION_ERROR: "minimum block must be positive" |

### Preferences Validation

| Field | Rule | Default |
|---|---|---|
| bufferTimeMinutes | Non-negative integer | 15 |
| defaultPriority | P1-P4 | P3 |
| defaultDuration | Positive integer | 60 |
| schedulingHorizonWeeks | Positive integer, 1-12 | 4 |
| minimumBlockMinutes | Positive integer, 15-120 | 30 |

### Recurrence Validation

| Field | Rule | Error |
|---|---|---|
| rrule | Must be parseable by rrule.js | VALIDATION_ERROR: "invalid RRULE format" |
| Instance cap | Indefinite recurrences capped at scheduling horizon | (enforced silently) |

### Dependency Validation

| Rule | Error |
|---|---|
| Both taskId and dependsOnId must reference existing tasks | NOT_FOUND: "dependency target task not found" |
| Adding dependency must not create a cycle | CIRCULAR_DEPENDENCY: "circular dependency detected: [cycle path]" |
| A task cannot depend on itself | CIRCULAR_DEPENDENCY: "a task cannot depend on itself" |

---

## Status Transition Rules

### Task Status Transitions

```
                    ┌──────────────────────┐
                    │                      │
                    v                      │
pending ──► scheduled ──► completed        │
  │            │                           │
  │            │                           │
  v            v                           │
cancelled   at_risk ──► scheduled ─────────┘
              (when deadline                
              becomes feasible              
              after replan)                 
```

**Valid transitions:**
| From | To | Trigger |
|---|---|---|
| pending | scheduled | Scheduler assigns time block(s) |
| pending | cancelled | delete_task called |
| pending | at_risk | Scheduler determines deadline infeasible |
| scheduled | completed | complete_task called |
| scheduled | cancelled | delete_task called |
| scheduled | at_risk | Replan determines deadline now infeasible |
| scheduled | pending | Time blocks removed during replan (task needs rescheduling) |
| at_risk | scheduled | Replan finds time after changes (deprioritization, deadline extension) |
| at_risk | cancelled | delete_task called |
| at_risk | completed | complete_task called (user finished it despite at-risk) |
| completed | completed | Idempotent — no error, no replan |

**Invalid transitions (return error):**
| From | To | Error |
|---|---|---|
| completed | any other | INVALID_STATE: "cannot modify completed task" (except idempotent complete) |
| cancelled | any other | INVALID_STATE: "cannot modify cancelled task" |

---

## Scheduling Constraints

### Hard Constraints (must be satisfied)
1. **Availability** — tasks only scheduled within availability windows
2. **Events** — tasks never overlap with fixed events
3. **Deadlines** — tasks must complete before their deadline (or be marked at_risk)
4. **Dependencies** — blocked tasks scheduled after their dependencies
5. **Minimum block size** — split blocks must be ≥ minimumBlockMinutes

### Soft Constraints (optimized, not guaranteed)
1. **Priority ordering** — higher priority tasks get better time slots
2. **Focus time** — deep-work tagged tasks prefer focus time blocks
3. **Buffer time** — bufferTimeMinutes gap between consecutive tasks
4. **Schedule stability** — prefer keeping existing placements during replan

**Soft constraint priority order** (highest to lowest):
1. Deadline proximity (closer deadline → schedule sooner)
2. Priority level (P1 > P2 > P3 > P4)
3. Focus time alignment (deep-work tasks in focus blocks)
4. Buffer time preference

---

## Task Splitting Rules

1. A task is split only when no single available slot can fit the full duration
2. Each block must be ≥ `minimumBlockMinutes` (default 30)
3. The scheduler decides block sizes to maximize fit within available slots
4. `TimeBlock.blockIndex` tracks position (0-based), `TimeBlock.totalBlocks` tracks total
5. All blocks for one task must be scheduled before the task's deadline
6. Split blocks should be on the same or consecutive days when possible (soft preference)

---

## Overdue Detection

- A task is **overdue** when its deadline is in the past and status is not "completed" or "cancelled"
- Overdue is distinct from at_risk: at_risk means deadline is future but infeasible, overdue means deadline already passed
- Overdue tasks are reported in `get_conflicts` with reason `"overdue"` and include overdue duration

---

## ID Generation Rules

- All entity IDs use UUID v4 via `crypto.randomUUID()`
- IDs are assigned at creation time, never changed
- IDs are case-sensitive strings

## Timestamp Rules

- All timestamps stored as UTC ISO 8601 strings with `Z` suffix
- `createdAt` set once at creation, never modified
- `updatedAt` set at creation, updated on every modification
- Time comparisons use lexicographic string comparison (valid for ISO 8601)
