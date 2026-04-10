# Functional Design Plan — Unit 3: Scheduling Engine

## Plan Overview

Unit 3 covers the core scheduling algorithm, dependency resolution, conflict detection, recurrence management, and background replan coordination. This plan addresses all 5 engine components: Scheduler, DependencyResolver, ConflictDetector, ReplanCoordinator, and RecurrenceManager.

**Stories covered**: 3.1, 3.2, 3.3, 4.1, 4.2, 5.1, 1.4

---

## Design Steps

- [x] **Step 1**: Define Scheduler constraint model — hard constraints (deadlines, availability, events, dependencies) and soft constraints (priority, energy, focus time, buffer)
- [x] **Step 2**: Define task placement algorithm — slot selection, task splitting, ordering strategy
- [x] **Step 3**: Define schedule stability model — how replanning minimizes disruption
- [x] **Step 4**: Define DependencyResolver business logic — cycle detection algorithm, topological sort, blocked task identification
- [x] **Step 5**: Define ConflictDetector business logic — deadline feasibility analysis, at-risk detection, deprioritization suggestion generation
- [x] **Step 6**: Define ReplanCoordinator lifecycle — dirty flag, setImmediate debouncing, schedule status transitions, awaitReplan semantics
- [x] **Step 7**: Define RecurrenceManager business logic — RRULE parsing, instance generation within horizon, exception handling, horizon expansion
- [x] **Step 8**: Define focus time protection rules — tag matching, placement preferences, fragmentation prevention
- [x] **Step 9**: Generate functional design artifacts — business-logic-model.md, business-rules.md, domain-entities.md

---

## Clarification Questions

Please answer the following questions to finalize the functional design. Fill in the letter choice after each `[Answer]:` tag. Choose the last option (Other) if none match, and describe your preference.

### Question 1
How should the constraint satisfaction solver evaluate soft constraints when multiple valid slots exist for a task?

A) **Weighted scoring** — assign numeric weights to each soft constraint (priority, energy, focus time, buffer) and pick the slot with the highest total score
B) **Sequential filtering** — apply soft constraints one at a time in priority order, narrowing the candidate slots at each step until one remains
C) Other (please describe after [Answer]: tag below)

[Answer]: A

### Question 2
When a task must be split across multiple time blocks (duration exceeds available slot), how should blocks be sized?

A) **Fill available slots** — each block fills the available slot completely (blocks may be different sizes), minimizing the number of splits
B) **Equal-sized blocks** — divide the task into roughly equal blocks, each at least `minimumBlockMinutes` long
C) **Hybrid** — fill available slots but enforce `minimumBlockMinutes` as a floor (a slot smaller than the minimum is skipped, task moves to the next available slot)
D) Other (please describe after [Answer]: tag below)

[Answer]: C

### Question 3
For schedule stability during replanning, how should existing task placements be preserved?

A) **Full reschedule** — always regenerate the entire schedule from scratch, using priority + deadline ordering to produce deterministic results (simpler, no state tracking)
B) **Incremental with stability scores** — track how long each task has been in its current slot; higher-stability tasks resist movement unless a hard constraint forces it
C) **Pin completed/in-progress** — only keep completed and in-progress tasks pinned; all pending/scheduled tasks are rescheduled from scratch
D) Other (please describe after [Answer]: tag below)

[Answer]: C

### Question 4
How should the scheduler handle energy level preferences (peak_energy_hours, low_energy_hours from Preferences)?

A) **Soft affinity** — high-priority tasks (P1, P2) prefer peak energy hours, low-priority tasks (P3, P4) prefer low-energy hours, but any task can go anywhere if needed
B) **Tag-based matching** — only tasks with a specific tag (e.g., "deep-work", "routine") are matched to energy zones; untagged tasks ignore energy preferences
C) **No energy matching in v1** — skip energy-time alignment for now; focus time protection already covers the most important case
D) Other (please describe after [Answer]: tag below)

[Answer]: B

### Question 5
How should focus time "deep-work" tasks be identified?

A) **Category-based** — tasks with category matching a configurable value (default: "deep-work") are treated as focus-time candidates
B) **Tag-based** — tasks with any tag in a configurable focus-tags list (default: ["deep-work", "focus"]) are treated as focus-time candidates
C) **Priority-based** — all P1 tasks are automatically considered deep-work candidates for focus time slots
D) Other (please describe after [Answer]: tag below)

[Answer]: B

### Question 6
When should recurrence instances be expanded (generated for new dates as the horizon advances)?

A) **On every replan** — the RecurrenceManager checks if the horizon has moved and generates new instances as part of each replan cycle
B) **On explicit schedule read** — expansion happens when `get_schedule` or `replan` is called, not during background replans
C) **On replan + configurable check interval** — expand on replan but only check once per day to avoid unnecessary work
D) Other (please describe after [Answer]: tag below)

[Answer]: A

### Question 7
For the DependencyResolver's cycle detection, which algorithm do you prefer?

A) **DFS with coloring** — standard depth-first search with white/gray/black node coloring; O(V+E) time; well-suited for small graphs (< 200 tasks)
B) **Kahn's algorithm** — BFS-based topological sort that detects cycles by checking for remaining nodes; also produces the ordering needed for scheduling
C) **Both** — use Kahn's for topological sort (needed by the scheduler) and DFS for the validation check when adding a new dependency (needed for early cycle rejection)
D) Other (please describe after [Answer]: tag below)

[Answer]: C

### Question 8
How should the ConflictDetector generate deprioritization suggestions when a task's deadline is infeasible?

A) **Greedy by priority** — suggest deprioritizing the lowest-priority tasks that compete for the same time window, until enough time is freed
B) **Minimal disruption** — suggest the single task that, if removed, would free enough time with the least impact on other deadlines
C) **Exhaustive list** — list ALL competing tasks that could be deprioritized, ranked by (priority ascending, freed time descending), and let the agent/user choose
D) Other (please describe after [Answer]: tag below)

[Answer]: A

