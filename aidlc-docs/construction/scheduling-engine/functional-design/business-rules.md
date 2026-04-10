# Business Rules — Unit 3: Scheduling Engine

## Scheduler Rules

### SR-1: Hard Constraint Enforcement
- **SR-1.1**: A task block MUST NOT be placed outside configured availability windows for its day
- **SR-1.2**: A task block MUST NOT overlap with any event (timed events block their exact range; all-day events block the entire day)
- **SR-1.3**: A task block MUST NOT overlap with a pinned block (completed or in-progress task)
- **SR-1.4**: A task with a deadline MUST have all its blocks completed before the deadline; if not possible, the task is marked at_risk
- **SR-1.5**: A task with dependencies MUST be scheduled after all its dependencies' latest scheduled end times
- **SR-1.6**: If ALL hard constraints cannot be satisfied for a task, the task is marked `at_risk` — it is never silently dropped

### SR-2: Soft Constraint Scoring
- **SR-2.1**: Soft constraints are evaluated via weighted scoring (weights: deadline proximity 40, priority 30, focus time 15, energy 10, buffer 5)
- **SR-2.2**: Soft constraints NEVER override hard constraints — they only differentiate between valid candidate slots
- **SR-2.3**: A task with no deadline receives a neutral deadline proximity score of 0.5
- **SR-2.4**: Weights are relative proportions summing to 100; each scoring function returns a value in [0.0, 1.0]

### SR-3: Task Placement Order
- **SR-3.1**: Tasks are ordered for placement by: (1) topological dependency order, (2) priority ascending (P1 first), (3) deadline ascending (soonest first), (4) duration ascending (shortest first for tie-breaking)
- **SR-3.2**: Within a dependency tier (tasks at the same topological level), ordering follows criteria 2-4
- **SR-3.3**: Tasks placed earlier in the ordering get first pick of available slots; this naturally gives higher-priority and more-urgent tasks better placements

### SR-4: Task Splitting
- **SR-4.1**: A task is split only when its remaining duration exceeds the selected slot's available duration
- **SR-4.2**: Each block MUST be at least `preferences.minimumBlockMinutes` (default: 30) — slots below this threshold are skipped
- **SR-4.3**: If splitting would leave a trailing block smaller than `minimumBlockMinutes`, the preceding block is adjusted to prevent the micro-block (either reduce the preceding block to leave enough for a minimum-sized final block, or absorb the remainder entirely)
- **SR-4.4**: If a task cannot be fully scheduled (remaining minutes > 0 after exhausting all valid slots), the scheduled portion is kept and the task is marked `at_risk` with the unscheduled minutes recorded
- **SR-4.5**: Each TimeBlock records its `blockIndex` (0-based) and `totalBlocks` count for display and tracking

### SR-5: Schedule Stability
- **SR-5.1**: Completed tasks' time blocks are pinned — they are never moved or removed during replanning (they represent historical fact)
- **SR-5.2**: In-progress tasks' time blocks are pinned — they represent active work and must not be disrupted
- **SR-5.3**: All pending, scheduled, and at_risk tasks are rescheduled from scratch on every replan
- **SR-5.4**: Pinned blocks are treated identically to events during scheduling — they block time but are never modified

---

## Focus Time Rules

### FT-1: Focus Time Identification
- **FT-1.1**: A task is a "focus-time candidate" if it has ANY tag present in the configurable focus-tags list
- **FT-1.2**: Default focus-tags list: `["deep-work", "focus"]`
- **FT-1.3**: Tag matching is case-insensitive
- **FT-1.4**: Tasks without matching tags are "non-focus tasks"

### FT-2: Focus Time Placement
- **FT-2.1**: Focus-time candidates receive a scoring bonus (1.0) when placed in a configured focus block
- **FT-2.2**: Focus-time candidates receive a scoring penalty (0.0) when placed outside focus blocks
- **FT-2.3**: Non-focus tasks receive a mild penalty (0.2) when placed in focus blocks — they are not blocked from focus time, but prefer other slots
- **FT-2.4**: Non-focus tasks receive a neutral score (0.5) when placed outside focus blocks
- **FT-2.5**: Focus time is a soft constraint — if no focus block has space, focus-time candidates are placed in the next best available slot

### FT-3: Fragmentation Prevention
- **FT-3.1**: A task shorter than `focusTime.minimumBlockMinutes` (default: 60) MUST NOT be placed inside a focus block unless no other valid slot exists
- **FT-3.2**: If placing a task in a focus block would leave a remaining fragment shorter than `focusTime.minimumBlockMinutes`, the task block is expanded to consume the fragment OR the focus block is skipped entirely
- **FT-3.3**: Focus time blocks' minimum duration applies independently from `preferences.minimumBlockMinutes` (task splitting minimum)

---

## Energy Matching Rules

### EM-1: Tag-Based Energy Zones
- **EM-1.1**: Tasks tagged with energy-relevant tags are matched to configured energy zones
- **EM-1.2**: Peak energy tags: `["deep-work", "focus"]` — matched to `preferences.peak_energy_hours`
- **EM-1.3**: Low energy tags: `["routine", "admin"]` — matched to `preferences.low_energy_hours`
- **EM-1.4**: Tag matching is case-insensitive
- **EM-1.5**: Tasks with no energy-relevant tags receive a neutral score (0.5) — no penalty, no bonus

### EM-2: Energy Scoring
- **EM-2.1**: Energy-tagged task in matching zone: score 1.0
- **EM-2.2**: Energy-tagged task in non-matching zone: score 0.2
- **EM-2.3**: Untagged task in any zone: score 0.5
- **EM-2.4**: If `peak_energy_hours` or `low_energy_hours` are not configured, energy scoring returns 0.5 for all tasks (effectively disabled)

---

## Dependency Rules

### DR-1: Dependency Validation
- **DR-1.1**: Before adding a dependency edge, validateNoCycles MUST be called
- **DR-1.2**: Cycle detection uses DFS reachability — check if adding edge A→B would allow B to reach A
- **DR-1.3**: If a cycle is detected, throw `CircularDependencyError` with the cycle path
- **DR-1.4**: Self-dependencies (task depends on itself) are rejected with a `ValidationError`
- **DR-1.5**: Dependencies on non-existent tasks are rejected with a `NotFoundError`

### DR-2: Dependency Ordering
- **DR-2.1**: Topological sort uses Kahn's algorithm (BFS, iterative)
- **DR-2.2**: Among tasks with zero in-degree, the dequeue order follows SR-3.1 criteria (priority, deadline, duration)
- **DR-2.3**: If Kahn's algorithm detects remaining nodes (should not happen with validation enforced), throw `CircularDependencyError`

### DR-3: Blocked Tasks
- **DR-3.1**: A task is "blocked" if ANY of its dependencies has a status other than `completed`
- **DR-3.2**: Blocked tasks are excluded from the scheduling pass — they remain in `pending` status
- **DR-3.3**: When a dependency is completed, dependent tasks are automatically unblocked and included in the next replan

---

## Conflict Detection Rules

### CD-1: Conflict Types
- **CD-1.1**: `overdue` — task's deadline is in the past
- **CD-1.2**: `insufficient_time` — task cannot be fully scheduled before its deadline due to competing tasks
- **CD-1.3**: `dependency_chain` — the sum of durations in the task's dependency chain exceeds available time before deadline

### CD-2: Conflict Reporting
- **CD-2.1**: Every conflict includes: taskId, reason, deadline, requiredMinutes, availableMinutes, competingTaskIds, suggestions
- **CD-2.2**: Overdue conflicts have empty competingTaskIds and suggestions (the issue is the past deadline, not competing tasks)
- **CD-2.3**: Dependency chain conflicts have the chain's task IDs as competingTaskIds and empty suggestions (can't resolve by deprioritization)
- **CD-2.4**: Insufficient time conflicts include competing task IDs and deprioritization suggestions

### CD-3: Deprioritization Suggestions
- **CD-3.1**: NEVER suggest deprioritizing a task with a deadline nearer than the at-risk task's deadline
- **CD-3.2**: Sort candidates by priority descending (P4 first), then deadline descending (furthest first)
- **CD-3.3**: Accumulate freed minutes until the required minutes are met, then stop (greedy — minimal set)
- **CD-3.4**: If no combination of candidates frees enough time, return all valid candidates as suggestions (partial relief is better than no suggestion)
- **CD-3.5**: Each suggestion includes: taskId, currentPriority, freedMinutes

---

## Replan Coordination Rules

### RC-1: Dirty Flag
- **RC-1.1**: `requestReplan()` sets `dirty = true`
- **RC-1.2**: If no replan is pending or active, a `setImmediate` callback is scheduled
- **RC-1.3**: Multiple `requestReplan()` calls before the `setImmediate` fires coalesce into one replan
- **RC-1.4**: If `requestReplan()` is called during an active replan, `dirty` is set and a follow-up replan runs after the current one completes

### RC-2: Schedule Status
- **RC-2.1**: Status is `"up_to_date"` when no replan is pending or active
- **RC-2.2**: Status is `"replan_in_progress"` when a replan is actively executing
- **RC-2.3**: Status transitions: `up_to_date → replan_in_progress → up_to_date`
- **RC-2.4**: Read operations (get_schedule, get_conflicts) always return immediately with the last known data and current status

### RC-3: Synchronous Replan (awaitReplan)
- **RC-3.1**: If no replan is needed (not dirty, not replanning), resolves immediately
- **RC-3.2**: If dirty but not replanning, executes the replan synchronously (bypasses setImmediate) and resolves
- **RC-3.3**: If a replan is in progress, waits for it to complete and resolves
- **RC-3.4**: This is the ONLY code path that blocks the caller — all other replan triggers are fire-and-forget

### RC-4: Replan Pipeline
- **RC-4.1**: Step 1: RecurrenceManager.expandHorizon (generate any missing instances)
- **RC-4.2**: Step 2: Scheduler.generateSchedule (constraint satisfaction solving)
- **RC-4.3**: Step 3: Save schedule to ScheduleRepository
- **RC-4.4**: Step 4: Update task statuses (pending→scheduled, or →at_risk)
- **RC-4.5**: If an error occurs during replan, the previous schedule is preserved and status returns to `"up_to_date"` (graceful degradation)

---

## Recurrence Rules

### RR-1: Template Management
- **RR-1.1**: A recurrence template stores task data + RRULE string + active flag
- **RR-1.2**: RRULE strings are validated via rrule.js parsing at creation time; invalid syntax throws `ValidationError`
- **RR-1.3**: Deleting a template cancels all future (non-completed) instances and deactivates the template
- **RR-1.4**: Completed instances are never modified or cancelled — they preserve historical data for analytics

### RR-2: Instance Generation
- **RR-2.1**: Instances are generated for dates within [now, horizonEnd] using the RRULE pattern
- **RR-2.2**: Dates matching a "skip" exception are not generated
- **RR-2.3**: Dates matching a "modify" exception use the exception's task overrides merged with template defaults
- **RR-2.4**: Each instance creates a concrete Task record (with `isRecurring: true` and `recurrenceTemplateId` set)
- **RR-2.5**: Duplicate detection: instances are not generated for dates that already have a RecurrenceInstance record

### RR-3: Horizon Expansion
- **RR-3.1**: Expansion runs at the start of every replan cycle (before scheduling)
- **RR-3.2**: Expansion only generates instances for dates not yet covered by existing instances
- **RR-3.3**: If `schedulingHorizonWeeks` is increased via config, the next replan expands to the new horizon automatically
- **RR-3.4**: Indefinite recurrences (no COUNT, no UNTIL) are capped at the current scheduling horizon

### RR-4: Instance Modification
- **RR-4.1**: Individual instances can be skipped (cancelled) without affecting the series
- **RR-4.2**: Individual instances can be modified (duration, priority, etc.) without affecting the series
- **RR-4.3**: Completed instances are immutable — modifying a completed instance throws `InvalidStateError`
- **RR-4.4**: Modifications are stored as exceptions so they survive horizon re-expansion
