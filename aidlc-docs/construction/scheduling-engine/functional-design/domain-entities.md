# Domain Entities — Unit 3: Scheduling Engine

## Overview

Unit 3 introduces no new persisted domain entities — all types are defined in Unit 1 (models) and persisted via Unit 2 (storage). This document defines the **internal domain concepts** used within the engine layer: intermediate data structures, algorithm inputs/outputs, and configuration objects that drive the scheduling logic.

---

## 1. Scheduler Internal Entities

### AvailableSlot

Represents a contiguous block of free time after subtracting events and pinned blocks from availability windows.

```typescript
interface AvailableSlot {
  date: string;              // YYYY-MM-DD
  startTime: string;         // ISO 8601
  endTime: string;           // ISO 8601
  durationMinutes: number;   // computed: diffMinutes(startTime, endTime)
}
```

**Lifecycle**: Built fresh each replan from availability config minus events minus pinned blocks. Not persisted.

### SlotScore

Associates a candidate slot with its weighted score for a specific task.

```typescript
interface SlotScore {
  slot: AvailableSlot;
  totalScore: number;
  breakdown: {
    deadlineProximity: number;  // 0.0 - 1.0
    priority: number;           // 0.0 - 1.0
    focusTime: number;          // 0.0 - 1.0
    energy: number;             // 0.0 - 1.0
    buffer: number;             // 0.0 - 1.0
  };
}
```

**Lifecycle**: Computed during task placement, used to select the best slot, then discarded. Not persisted.

### TaskPlacement

The result of placing a task into one or more slots.

```typescript
interface TaskPlacement {
  taskId: string;
  blocks: TimeBlock[];          // one or more blocks (from splitting)
  unscheduledMinutes: number;   // 0 if fully scheduled; >0 if at_risk
  isFullyScheduled: boolean;    // unscheduledMinutes === 0
}
```

**Lifecycle**: Built during the placement loop, collected into the ScheduleResult. Individual TimeBlocks are persisted via ScheduleRepository; the TaskPlacement wrapper is not persisted.

---

## 2. Dependency Graph Entities

### AdjacencyMap

Internal representation of the dependency graph for traversal algorithms.

```typescript
type AdjacencyMap = Map<string, string[]>;
// key: taskId, value: list of taskIds this task depends on
```

**Usage**: Built from `DependencyEdge[]` at the start of dependency operations. Used by both DFS (validation) and Kahn's (topological sort).

### InDegreeMap

Tracks the number of incoming dependency edges per task for Kahn's algorithm.

```typescript
type InDegreeMap = Map<string, number>;
// key: taskId, value: count of tasks that must complete before this task
```

**Usage**: Built from `DependencyEdge[]` for Kahn's topological sort. Decremented as nodes are processed.

---

## 3. Conflict Detection Entities

All conflict-related types are defined in `src/models/conflict.ts` (Unit 1):
- `Conflict` — full conflict record with reason, competing tasks, suggestions
- `AtRiskTask` — lightweight reference to a task that couldn't be fully scheduled
- `DeprioritizationSuggestion` — suggestion to deprioritize a specific task
- `ConflictReason` — "insufficient_time" | "dependency_chain" | "overdue"

### CompetingTask (internal)

Intermediate structure used during conflict analysis to track competing task durations.

```typescript
interface CompetingTask {
  taskId: string;
  priority: TaskPriority;
  deadline: string | null;
  scheduledMinutes: number;  // total scheduled time for this task
}
```

**Lifecycle**: Built during `findCompetingTasks`, passed to `suggestDeprioritizations`, then discarded.

---

## 4. Replan Coordinator Entities

### ReplanState

Internal state of the replan coordinator (not persisted — lives in memory).

```typescript
interface ReplanState {
  dirty: boolean;                       // mutation happened since last replan
  replanning: boolean;                  // replan currently executing
  pendingImmediate: NodeJS.Immediate | null;  // scheduled setImmediate callback
  awaitCallbacks: Array<() => void>;    // promises waiting for replan completion
}
```

**Note**: `ScheduleStatus` ("up_to_date" | "replan_in_progress") is persisted via ScheduleRepository for read operations to report. The ReplanState itself is ephemeral — on process restart, it initializes to `{ dirty: false, replanning: false }` and the schedule status in the DB may be stale from a previous run (should be reset to "up_to_date" on startup).

---

## 5. Recurrence Entities

All recurrence-related types are defined in `src/models/recurrence.ts` (Unit 1):
- `RecurrenceTemplate` — stores task data + RRULE string + active flag
- `RecurrenceInstance` — links a template to a concrete task for a specific date
- `RecurrenceException` — skip or modify override for a specific date

No additional internal entities are needed — the RecurrenceManager operates directly on these model types and the rrule.js library's `RRule` object.

---

## 6. Configuration Entities Used by Engine

The engine reads but does not own these types (defined in `src/models/config.ts`):

| Entity | Used By | Purpose |
|--------|---------|---------|
| `Availability` | Scheduler | Build daily available slots |
| `DayAvailability` | Scheduler | Per-day start/end times |
| `FocusTime` | Scheduler | Focus block definitions for scoring |
| `FocusBlock` | Scheduler | Individual focus block (day, start, end) |
| `Preferences` | Scheduler, ReplanCoordinator | Buffer time, horizon, minimums |

---

## 7. Tag Configuration

Tags drive both focus time and energy matching. The engine uses configurable tag lists:

| Tag List | Default Values | Used By | Purpose |
|----------|---------------|---------|---------|
| Focus tags | `["deep-work", "focus"]` | Scheduler (focusTimeScore) | Identify focus-time candidate tasks |
| Peak energy tags | `["deep-work", "focus"]` | Scheduler (energyScore) | Match tasks to peak energy hours |
| Low energy tags | `["routine", "admin"]` | Scheduler (energyScore) | Match tasks to low energy hours |

**Note**: Focus tags and peak energy tags overlap by default — "deep-work" tasks get both focus-time placement and peak-energy placement benefits. This is intentional: deep work should happen in focus blocks during peak energy hours.

**Tag matching rule**: A task is matched if ANY of its `tags[]` appears in the relevant tag list (case-insensitive).

---

## 8. Entity Relationship Summary

```
+---------------------+         +---------------------+
| Scheduler           |-------->| AvailableSlot       |
| (generates schedule)|  builds | (free time blocks)  |
+---------------------+         +---------------------+
        |                               |
        | scores                        | fills
        v                               v
+---------------------+         +---------------------+
| SlotScore           |         | TaskPlacement       |
| (weighted ranking)  |         | (task → blocks)     |
+---------------------+         +---------------------+
                                        |
                                        | produces
                                        v
                                +---------------------+
                                | ScheduleResult      |
                                | (timeBlocks,        |
                                |  conflicts,         |
                                |  atRiskTasks)       |
                                +---------------------+

+---------------------+         +---------------------+
| DependencyResolver  |-------->| AdjacencyMap        |
| (ordering + cycles) |  builds | InDegreeMap         |
+---------------------+         +---------------------+

+---------------------+         +---------------------+
| ConflictDetector    |-------->| CompetingTask       |
| (feasibility check) |  builds | (intermediate)      |
+---------------------+         +---------------------+

+---------------------+
| ReplanCoordinator   |
| (orchestrates all)  |
| State: ReplanState  |
+---------------------+

+---------------------+
| RecurrenceManager   |
| (RRULE → instances) |
| Uses: rrule.js      |
+---------------------+
```
