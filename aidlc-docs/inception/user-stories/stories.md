# User Stories — Smart Agentic Calendar MCP Server

**Format**: Standard user story + Given/When/Then acceptance criteria
**Prioritization**: MoSCoW (Must/Should/Could/Won't)
**Error Coverage**: Comprehensive (C-level) for scheduling epics, Common errors (B-level) for CRUD/analytics epics
**Algorithm Coverage**: Hybrid — observable outcomes in acceptance criteria, internal behavior in implementation notes
**Replan Pattern**: Background — mutation tools (create/update/delete/complete) return immediately and trigger replan asynchronously. Read tools (get_schedule, get_conflicts) return immediately: if a replan is in progress, the response includes a status indicator and the agent should retry later.

---

# Epic 1: Task Management

**Priority**: Must Have
**Persona**: Alex (AI Agent)
**Coverage Level**: B-level (happy path + common errors)

---

## Story 1.1: Create and Configure Tasks

**As an** AI agent managing Sam's schedule
**I want to** create a task with title, duration, deadline, priority, and optional metadata
**So that** the task is tracked and automatically scheduled into available time

### Acceptance Criteria

**Scenario: Successful task creation with all fields**
Given valid task data: title "Write quarterly report", description "Q1 summary", duration 120min, deadline 2026-04-15T17:00:00Z, priority P1, category "work"
When create_task is called
Then the task is created with a unique ID and status "pending"
And the response includes the created task with all fields (no time slot yet — scheduling is asynchronous)
And a background replan is triggered

**Scenario: Task creation with minimal required fields**
Given task data with only title "Quick email" and duration 15min
When create_task is called
Then the task is created with default priority P3 and no deadline
And status is set to "pending"
And a background replan is triggered

**Scenario: Missing required field (title)**
Given task data without a title
When create_task is called
Then an error is returned with code VALIDATION_ERROR and message "title is required"
And no task is created and no replan is triggered

**Scenario: Invalid priority value**
Given task data with priority "P5"
When create_task is called
Then an error is returned with code VALIDATION_ERROR listing valid values (P1, P2, P3, P4)

**Scenario: Negative or zero duration**
Given task data with duration 0 or -30
When create_task is called
Then an error is returned with code VALIDATION_ERROR and message "duration must be a positive number of minutes"

---

## Story 1.2: Update and Manage Task Status

**As an** AI agent managing Sam's schedule
**I want to** update task fields and mark tasks as completed
**So that** the schedule reflects current priorities and progress

### Acceptance Criteria

**Scenario: Update task fields**
Given an existing task with ID "task-123"
When update_task is called with new priority P1 and deadline 2026-04-12
Then the task is updated with the new values
And the response includes the updated task immediately
And a background replan is triggered

**Scenario: Complete a task**
Given a scheduled task with ID "task-123"
When complete_task is called with task ID "task-123"
Then the task status changes to "completed"
And actual duration is recorded (time from first scheduled slot to completion)
And dependent tasks (if any) are unblocked
And the response is returned immediately
And a background replan is triggered to reallocate freed time

**Scenario: Update non-existent task**
Given no task with ID "task-999"
When update_task is called with ID "task-999"
Then an error is returned with code NOT_FOUND and message "task not found"

**Scenario: Complete an already completed task**
Given a task with status "completed"
When complete_task is called
Then the operation is idempotent — returns success with current task state, no replan triggered

---

## Story 1.3: Query and Filter Tasks

**As an** AI agent managing Sam's schedule
**I want to** list and filter tasks by status, priority, deadline, and category
**So that** I can answer Sam's questions about their workload

### Acceptance Criteria

**Scenario: List all tasks**
Given 10 tasks exist with various statuses
When list_tasks is called with no filters
Then all non-cancelled tasks are returned, ordered by priority then deadline

**Scenario: Filter by status**
Given tasks with statuses pending, scheduled, completed
When list_tasks is called with filter status="scheduled"
Then only scheduled tasks are returned

**Scenario: Filter by priority**
Given tasks with priorities P1 through P4
When list_tasks is called with filter priority="P1"
Then only P1 tasks are returned

**Scenario: Filter by deadline range**
Given tasks with various deadlines
When list_tasks is called with deadline_before="2026-04-15" and deadline_after="2026-04-10"
Then only tasks with deadlines in that range are returned

**Scenario: No matching tasks**
Given no tasks matching the filter criteria
When list_tasks is called with the filter
Then an empty array is returned (not an error)

---

## Story 1.4: Manage Task Dependencies

**As an** AI agent managing Sam's schedule
**I want to** define blocking dependencies between tasks
**So that** the scheduler respects task ordering constraints

### Acceptance Criteria

**Scenario: Create a dependency**
Given task A "Research" and task B "Write report"
When update_task is called on task B with blocked_by=["task-A-id"]
Then the dependency is recorded and the response is returned immediately
And a background replan is triggered respecting the new dependency
And subsequent get_schedule calls reflect that task B is scheduled after task A

**Scenario: Dependency satisfied by completion**
Given task B is blocked by task A, and task A is completed
When complete_task is called on task A
Then task B is unblocked and the response is returned immediately
And a background replan schedules task B into available time

**Scenario: Circular dependency detection**
Given task A blocked by task B, and an attempt to set task B blocked by task A
When update_task is called to create the circular dependency
Then an error is returned with code CIRCULAR_DEPENDENCY and message identifying the cycle

**Scenario: Dependency on non-existent task**
Given an attempt to set blocked_by=["non-existent-id"]
When update_task is called
Then an error is returned with code NOT_FOUND and message "dependency target task not found"

---

## Story 1.5: Delete Tasks

**As an** AI agent managing Sam's schedule
**I want to** delete tasks that are no longer needed
**So that** the schedule is cleaned up and time is freed for other tasks

### Acceptance Criteria

**Scenario: Delete an existing task**
Given a scheduled task with ID "task-123"
When delete_task is called with ID "task-123"
Then the task status changes to "cancelled"
And tasks that depended on this task are flagged for review
And the response is returned immediately
And a background replan is triggered to reallocate the freed time slot

**Scenario: Delete non-existent task**
Given no task with ID "task-999"
When delete_task is called with ID "task-999"
Then an error is returned with code NOT_FOUND

---

# Epic 2: Event Management

**Priority**: Must Have
**Persona**: Alex (AI Agent)
**Coverage Level**: B-level (happy path + common errors)

---

## Story 2.1: Create and Manage Fixed Events

**As an** AI agent managing Sam's schedule
**I want to** create fixed events (meetings, appointments) that block time
**So that** the scheduler works around immovable commitments

### Acceptance Criteria

**Scenario: Create a timed event**
Given valid event data: title "Team standup", start 2026-04-10T09:00:00Z, end 2026-04-10T09:30:00Z
When create_event is called
Then the event is created with a unique ID
And the time slot is blocked from task scheduling
And the response is returned immediately
And a background replan is triggered

**Scenario: Create an all-day event**
Given event data with title "Company holiday", date 2026-04-14, all_day=true
When create_event is called
Then the entire day is blocked from task scheduling
And the response is returned immediately
And a background replan is triggered

**Scenario: Event with end before start**
Given event data with start after end time
When create_event is called
Then an error is returned with code VALIDATION_ERROR and message "end time must be after start time"

**Scenario: Update an event**
Given an existing event with ID "event-123"
When update_event is called with new start/end times
Then the event is updated and the response is returned immediately
And a background replan is triggered

**Scenario: Delete an event**
Given an existing event with ID "event-123"
When delete_event is called
Then the event is removed and the response is returned immediately
And a background replan is triggered to reallocate freed time

**Scenario: List events in date range**
Given events on various dates
When list_events is called with start_date and end_date
Then only events within the range are returned, ordered chronologically

---

# Epic 3: Scheduling Engine

**Priority**: Must Have
**Persona**: Alex (AI Agent), Jordan (Developer)
**Coverage Level**: C-level (comprehensive with boundary conditions)

---

## Story 3.1: Generate Optimized Schedule

**As an** AI agent managing Sam's schedule
**I want to** retrieve a schedule that assigns time blocks to tasks based on priorities, deadlines, and constraints
**So that** Sam's time is used optimally and all deadlines are met

### Acceptance Criteria

**Scenario: Basic schedule generation**
Given 3 tasks with different priorities and deadlines, and availability Mon-Fri 9:00-17:00
When get_schedule is called for the current week
Then the response is returned immediately
And each task is assigned a specific time block within availability windows
And no time blocks overlap with each other or with fixed events
And the response includes each task's assigned start time, end time, and date
And the response includes a `schedule_status` field set to "up_to_date"

**Scenario: Schedule read while replan in progress**
Given a task was just created (triggering a background replan that has not yet completed)
When get_schedule is called immediately after
Then the response is returned immediately with the last known schedule
And the `schedule_status` field is set to "replan_in_progress"
And a `message` field says "A replan is currently in progress. The returned schedule may not reflect the latest changes. Please try again shortly."
And the agent can retry after a brief interval to get the updated schedule

**Scenario: Priority ordering**
Given a P1 task and a P3 task both due on the same day, and limited availability
When get_schedule is called
Then the P1 task is scheduled in the earlier/better time slot
And the P3 task is scheduled in the remaining time (or marked at-risk if insufficient time)

**Scenario: Deadline-aware placement**
Given task A due tomorrow and task B due next week, both P2 priority
When get_schedule is called
Then task A is scheduled before task B

**Scenario: Buffer time between tasks**
Given two tasks scheduled consecutively and buffer time configured at 15 minutes
When get_schedule is called
Then at least 15 minutes of gap exists between the end of one task and the start of the next

**Scenario: Task splitting across days**
Given a task with duration 6 hours and daily availability of 4 hours
When get_schedule is called
Then the task is split into multiple blocks across multiple days
And each block respects the minimum block duration

### Boundary Conditions

**Scenario: Zero available time**
Given availability windows that are completely filled by fixed events
When get_schedule is called
Then all pending tasks are marked as "at_risk" with reason "no available time"
And the response includes an empty scheduled blocks list

**Scenario: Two tasks with identical priority and deadline**
Given task A and task B both P1, both due 2026-04-12, durations 2h and 1h
When get_schedule is called
Then both tasks are scheduled (order is deterministic — shorter duration first to maximize flexibility)
And neither task overlaps

**Scenario: More tasks than available time**
Given 20 hours of tasks and 8 hours of available time
When get_schedule is called
Then tasks are scheduled by priority then deadline until time is exhausted
And remaining tasks are marked "at_risk"

**Scenario: Task duration exactly equals available slot**
Given a 2-hour task and exactly one 2-hour available slot
When get_schedule is called
Then the task fills the slot exactly with no buffer (buffer only applies between consecutive tasks)

**Scenario: Dependencies affect ordering**
Given task B blocked by task A, both due same day
When get_schedule is called
Then task A is always scheduled before task B regardless of individual priority

### Implementation Notes
- The constraint solver should process hard constraints first (deadlines, availability, events, dependencies) then optimize soft constraints (energy preferences, buffer time, focus time alignment)
- Soft constraint priority order: deadline proximity > priority level > energy-time match > buffer time preference
- Schedule stability: when replanning, prefer keeping existing task placements and only moving tasks that are directly affected by the change

---

## Story 3.2: Automatic Replanning on Changes

**As an** AI agent managing Sam's schedule
**I want** the schedule to automatically replan when any task or event changes
**So that** Sam always has an up-to-date, optimal schedule

### Acceptance Criteria

**Scenario: Replan after task creation**
Given an existing schedule with 3 tasks
When a new P1 task is created
Then the mutation tool returns immediately
And a background replan incorporates the new task
And previously scheduled tasks may shift to accommodate the new task
And the next get_schedule call reflects the updated schedule

**Scenario: Replan after task completion**
Given a schedule with task A at 9:00-11:00 and task B at 13:00-15:00
When task A is completed at 10:00 (1 hour early)
Then complete_task returns immediately
And a background replan may move task B earlier into the freed time

**Scenario: Replan after event creation**
Given a schedule with a task at 10:00-12:00
When a new event is created at 10:00-11:00
Then create_event returns immediately
And a background replan reschedules the task to a non-conflicting time slot

**Scenario: Schedule stability — minimal disruption**
Given a schedule with 10 tasks
When one P4 task is added
Then the background replan preserves existing task placements where possible
And only tasks that need to move (to accommodate the new task) are rescheduled

### Boundary Conditions

**Scenario: Replan with no tasks**
Given an empty task list
When replan is triggered (e.g., by creating and immediately deleting a task)
Then the replan completes successfully with an empty schedule

**Scenario: Rapid sequential mutations**
Given 5 tasks created in rapid succession
When each creation triggers a background replan
Then intermediate replans may be coalesced (debounced) — only the final state matters
And a subsequent get_schedule call returns immediately with `schedule_status: "replan_in_progress"` until the final replan completes
And once complete, get_schedule returns the final schedule with all 5 tasks and `schedule_status: "up_to_date"`

**Scenario: Replan when all time is consumed**
Given a fully packed schedule with no available time
When a new task is added
Then the background replan marks the new task as "at_risk"
And existing scheduled tasks are not displaced

**Scenario: Explicit replan tool**
Given the agent wants to force a replan and wait for the result
When the replan tool is called directly
Then the replan executes synchronously and returns the updated schedule
And this is the only replan path that blocks the caller

### Implementation Notes
- Mutation tools (create/update/delete/complete) trigger replan asynchronously in the background and return immediately
- Read tools (get_schedule, get_conflicts) return immediately with a `schedule_status` field: "up_to_date" when current, "replan_in_progress" when a background replan is running (returns last known schedule)
- The explicit `replan` tool is the only synchronous replan path — it blocks and returns the updated schedule
- Rapid sequential mutations should be debounced: if a replan is already pending, queue the next one rather than running concurrently
- Use incremental replanning where possible: only re-solve the affected portion of the schedule
- Track a "stability score" for each task placement — tasks scheduled for longer without changes have higher stability and resist movement

---

## Story 3.3: Focus Time Protection

**As an** AI agent managing Sam's schedule
**I want** focus time blocks to be protected for deep work tasks
**So that** Sam has uninterrupted periods for high-concentration work

### Acceptance Criteria

**Scenario: Schedule deep work in focus time**
Given focus time configured as 9:00-11:00 Mon-Fri, and a P1 task tagged "deep-work" with duration 2h
When get_schedule is called
Then the task is placed within the 9:00-11:00 focus block if available

**Scenario: Focus time protected from fragmentation**
Given focus time 9:00-11:00 and minimum focus block duration 60min
When scheduling tasks
Then no task shorter than 60 minutes is placed inside the focus block
And the focus block is not split into fragments smaller than 60 minutes

**Scenario: Non-focus tasks avoid focus time**
Given focus time 9:00-11:00 and a P3 task "reply to emails" (not deep-work)
When scheduling
Then the task is placed outside focus time if any other slot is available

**Scenario: Focus time fallback when no focus slot available**
Given focus time 9:00-11:00 already occupied by a fixed event
When a deep-work task needs scheduling
Then the task is placed in the next best available slot (not rejected)

### Boundary Conditions

**Scenario: Focus time covers entire availability window**
Given availability 9:00-17:00 and focus time 9:00-17:00
When non-deep-work tasks need scheduling
Then non-deep-work tasks are still schedulable within focus time (focus time is a preference, not an absolute block)
And deep-work tasks get priority for the best slots within the window

**Scenario: Multiple focus time blocks in one day**
Given focus time 9:00-11:00 and 14:00-16:00
When a 3-hour deep-work task needs scheduling
Then the task is split across the two focus blocks (2h + 1h) rather than placed in a single non-focus 3h block

### Implementation Notes
- Focus time is a soft constraint — it influences placement but does not make slots unavailable
- Constraint weight: focus time alignment should be weighted below deadline and priority but above general energy preferences
- Deep-work tag should be configurable (could be "focus", "deep-work", or user-defined)

---

# Epic 4: Recurring Tasks

**Priority**: Must Have
**Persona**: Alex (AI Agent)
**Coverage Level**: C-level (comprehensive with boundary conditions)

---

## Story 4.1: Create and Manage Recurring Tasks

**As an** AI agent managing Sam's schedule
**I want to** create tasks that repeat on a defined schedule (daily, weekly, monthly, custom RRULE)
**So that** recurring responsibilities are automatically tracked and scheduled

### Acceptance Criteria

**Scenario: Create a daily recurring task**
Given task data with title "Daily standup prep", duration 15min, recurrence "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR"
When create_task is called
Then a recurring task template is created with task instances generated for dates within the scheduling horizon
And the response is returned immediately with the template and generated instance IDs
And a background replan is triggered to schedule each instance

**Scenario: Create a weekly recurring task**
Given task data with recurrence "FREQ=WEEKLY;BYDAY=MO" and duration 60min
When create_task is called
Then instances are generated for every Monday within the scheduling horizon
And the response is returned immediately
And a background replan is triggered

**Scenario: Create a monthly recurring task with end date**
Given task data with recurrence "FREQ=MONTHLY;BYMONTHDAY=1;UNTIL=20261231"
When create_task is called
Then instances are generated only up to December 2026
And the response is returned immediately
And a background replan is triggered

**Scenario: Create a count-limited recurrence**
Given task data with recurrence "FREQ=WEEKLY;COUNT=10"
When create_task is called
Then exactly 10 instances are generated
And the response is returned immediately
And a background replan is triggered

**Scenario: Invalid RRULE syntax**
Given task data with recurrence "FREQ=INVALID"
When create_task is called
Then an error is returned with code VALIDATION_ERROR and message explaining valid RRULE format

### Boundary Conditions

**Scenario: Recurrence generating excessive instances**
Given an indefinite daily recurrence with no end date
When instances are generated
Then instances are capped at the scheduling horizon (e.g., 4 weeks ahead)
And new instances are generated as the horizon advances

**Scenario: Recurrence with zero matching dates in horizon**
Given recurrence "FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25" and current date is April
When instances are generated
Then no instances are generated for the current horizon
And the recurrence template remains active for future generation

### Implementation Notes
- Use a standard RRULE library (e.g., rrule.js) for parsing and instance generation
- Scheduling horizon should be configurable (default: 4 weeks)
- Instance generation is lazy — only generate within the current horizon, extend as time passes

---

## Story 4.2: Modify Individual Recurrence Instances

**As an** AI agent managing Sam's schedule
**I want to** modify or skip individual instances of a recurring task without affecting the series
**So that** Sam can handle exceptions (sick days, holidays, one-off changes)

### Acceptance Criteria

**Scenario: Skip a single instance**
Given a daily recurring task with an instance on 2026-04-14
When update_task is called on the specific instance with status "cancelled"
Then only that instance is cancelled
And all other instances remain scheduled
And the response is returned immediately
And a background replan is triggered

**Scenario: Modify a single instance's time**
Given a weekly recurring task instance on Monday
When update_task is called on the instance with a different duration
Then only that instance is modified
And future instances retain the original template values

**Scenario: Delete the entire recurrence series**
Given a recurring task template
When delete_task is called on the template
Then all future instances are cancelled
And completed past instances remain in history

### Boundary Conditions

**Scenario: Modify instance after it was already completed**
Given a recurring task instance that was completed
When update_task is called on that instance
Then an error is returned with code INVALID_STATE and message "cannot modify completed instance"

### Implementation Notes
- Store recurrence exceptions as overrides linked to the template by date
- Completed instances are immutable — they preserve historical accuracy for analytics

---

# Epic 5: Conflict Detection

**Priority**: Must Have
**Persona**: Alex (AI Agent)
**Coverage Level**: C-level (comprehensive with boundary conditions)

---

## Story 5.1: Detect and Report Infeasible Deadlines

**As an** AI agent managing Sam's schedule
**I want to** be alerted when a task's deadline becomes impossible to meet
**So that** I can inform Sam and help them decide what to deprioritize

### Acceptance Criteria

**Scenario: Single task deadline infeasible**
Given a task with 8h duration and deadline tomorrow, but only 3h available before the deadline
When replan is triggered
Then the task is marked as "at_risk"
And the response includes: task ID, deadline, required duration, available hours, and a list of competing tasks that could be deprioritized

**Scenario: Multiple tasks with infeasible deadlines**
Given 3 tasks all due tomorrow totaling 15h, with only 6h available
When replan is triggered
Then all three tasks are evaluated
And the highest-priority task(s) that fit are scheduled
And remaining tasks are marked "at_risk" with deprioritization suggestions

**Scenario: Deadline becomes feasible after deprioritization**
Given task A (P3) and task B (P1) competing for the same time, task A's deadline is at-risk
When task A is deprioritized to P4 or its deadline is extended
Then task A's at-risk status is cleared on the next replan

**Scenario: Get current conflicts**
Given tasks with at-risk status in the schedule
When get_conflicts is called
Then the response is returned immediately with all at-risk tasks and their conflict details (reason, competing tasks, suggestions)
And the response includes a `schedule_status` field ("up_to_date" or "replan_in_progress")

### Boundary Conditions

**Scenario: Task with deadline in the past**
Given a task with deadline 2026-04-01 and today is 2026-04-09
When get_conflicts is called
Then the task is flagged as "overdue" (distinct from "at_risk")
And the conflict report includes the overdue duration

**Scenario: Dependency chain makes deadline infeasible**
Given task C depends on task B depends on task A, total chain duration 12h, deadline in 6h
When replan is triggered
Then task C is marked at_risk with reason "dependency chain exceeds available time"
And the conflict report identifies the full dependency chain

**Scenario: No conflicts**
Given all tasks schedulable within their deadlines
When get_conflicts is called
Then an empty conflicts list is returned (not an error)

### Implementation Notes
- Conflict detection runs as part of every replan, not as a separate pass
- v1: suggestions are simple — list which lower-priority tasks could be removed/postponed to free time
- Data model should include fields for future v2 conflict analysis: resolution_options[], impact_preview, schedule_simulation_id
- Deprioritization suggestions should never suggest deprioritizing a task with a nearer deadline than the at-risk task

---

# Epic 6: Analytics

**Priority**: Should Have
**Persona**: Alex (AI Agent)
**Coverage Level**: B-level (happy path + common errors)

---

## Story 6.1: Track Completion and Productivity

**As an** AI agent managing Sam's schedule
**I want to** retrieve productivity statistics and completion trends
**So that** I can give Sam insights into their work patterns

### Acceptance Criteria

**Scenario: Get productivity stats for a period**
Given tasks completed over the past week
When get_productivity_stats is called with period "week"
Then the response includes: tasks_completed, tasks_overdue, tasks_cancelled, completion_rate (%), on_time_rate (%)

**Scenario: Get productivity stats with no completed tasks**
Given no tasks completed in the requested period
When get_productivity_stats is called
Then the response includes all metrics as 0 or 0% (not an error)

**Scenario: Invalid period parameter**
Given an invalid period value "century"
When get_productivity_stats is called
Then an error is returned with code VALIDATION_ERROR listing valid periods (day, week, month)

---

## Story 6.2: Monitor Schedule Health

**As an** AI agent managing Sam's schedule
**I want to** check the overall health of Sam's schedule
**So that** I can proactively warn about overcommitment or imbalance

### Acceptance Criteria

**Scenario: Get schedule health**
Given a schedule with tasks, events, and availability
When get_schedule_health is called
Then the response includes: health_score (0-100), utilization_percentage, overdue_count, at_risk_count, free_hours_this_week, busiest_day, lightest_day

**Scenario: Healthy schedule**
Given a schedule at 60% utilization with no overdue or at-risk tasks
When get_schedule_health is called
Then health_score is high (80+)

**Scenario: Overloaded schedule**
Given a schedule at 95% utilization with 3 at-risk tasks
When get_schedule_health is called
Then health_score is low (<50) and the response highlights the at-risk tasks

---

## Story 6.3: Analyze Estimation Accuracy

**As an** AI agent managing Sam's schedule
**I want to** compare estimated vs. actual task durations
**So that** I can help Sam improve their time estimates over time

### Acceptance Criteria

**Scenario: Get estimation accuracy**
Given 20 completed tasks with estimated and actual durations recorded
When get_estimation_accuracy is called
Then the response includes: average_accuracy_percentage, overestimate_count, underestimate_count, average_overestimate_minutes, average_underestimate_minutes, accuracy_by_category

**Scenario: No completed tasks with duration data**
Given no completed tasks
When get_estimation_accuracy is called
Then the response includes a message "insufficient data" with all metrics as null

---

## Story 6.4: Get Time Allocation Breakdown

**As an** AI agent managing Sam's schedule
**I want to** see how Sam's time is distributed across categories
**So that** I can help Sam understand where their time goes

### Acceptance Criteria

**Scenario: Get time allocation**
Given tasks with categories "work", "personal", "admin"
When get_time_allocation is called with period "week"
Then the response includes hours and percentage per category
And categories are sorted by hours descending

**Scenario: No categories assigned**
Given tasks with no category tags
When get_time_allocation is called
Then all time is grouped under "uncategorized"

---

# Epic 7: Configuration

**Priority**: Must Have
**Persona**: Alex (AI Agent)
**Coverage Level**: B-level (happy path + common errors)

---

## Story 7.1: Configure Availability Windows

**As an** AI agent managing Sam's schedule
**I want to** set Sam's available working hours
**So that** the scheduler only places tasks during times Sam is available

### Acceptance Criteria

**Scenario: Set weekly availability**
Given availability data: Mon-Fri 9:00-17:00
When set_availability is called
Then the availability is saved and the response is returned immediately
And a background replan is triggered using the new availability

**Scenario: Set different hours per day**
Given availability: Mon-Thu 8:00-16:00, Fri 8:00-12:00
When set_availability is called
Then each day's hours are stored independently and the response is returned immediately
And a background replan is triggered respecting per-day availability

**Scenario: Invalid availability (end before start)**
Given availability with start 17:00 and end 9:00
When set_availability is called
Then an error is returned with code VALIDATION_ERROR

---

## Story 7.2: Configure Focus Time

**As an** AI agent managing Sam's schedule
**I want to** define focus time blocks for deep work
**So that** the scheduler protects uninterrupted work periods

### Acceptance Criteria

**Scenario: Set focus time**
Given focus time data: Mon-Fri 9:00-11:00, minimum block 60min
When set_focus_time is called
Then focus time configuration is saved and the response is returned immediately
And a background replan is triggered, preferring deep-work tasks in focus blocks

**Scenario: Multiple focus blocks per day**
Given focus time: 9:00-11:00 and 14:00-16:00 on weekdays
When set_focus_time is called
Then both blocks are saved and respected by the scheduler

**Scenario: Focus time outside availability**
Given availability 9:00-17:00 and focus time 7:00-9:00
When set_focus_time is called
Then an error is returned with code VALIDATION_ERROR and message "focus time must be within availability hours"

---

## Story 7.3: Configure Scheduling Preferences

**As an** AI agent managing Sam's schedule
**I want to** set scheduling preferences (buffer time, energy patterns, defaults)
**So that** the scheduler produces a schedule tailored to Sam's work style

### Acceptance Criteria

**Scenario: Set buffer time**
Given preference buffer_time_minutes=15
When set_preferences is called
Then the preference is saved and the response is returned immediately
And a background replan is triggered inserting 15 minutes of buffer between consecutive tasks

**Scenario: Set energy level preferences**
Given preferences: peak_energy_hours 9:00-12:00, low_energy_hours 14:00-15:00
When set_preferences is called
Then the preferences are saved and the response is returned immediately
And a background replan is triggered placing high-priority tasks in peak hours and routine tasks in low-energy hours

**Scenario: Set default task values**
Given preferences: default_priority P3, default_duration 60, scheduling_horizon_weeks 4
When set_preferences is called
Then new tasks without explicit priority/duration use these defaults

**Scenario: Get current preferences**
When get_preferences is called (if exposed as a tool, or included in set_preferences response)
Then all current configuration values are returned including availability, focus time, and preferences

---

# Story Summary

| Epic | Stories | Priority | Coverage |
|---|---|---|---|
| 1. Task Management | 1.1, 1.2, 1.3, 1.4, 1.5 | Must Have | B-level |
| 2. Event Management | 2.1 | Must Have | B-level |
| 3. Scheduling Engine | 3.1, 3.2, 3.3 | Must Have | C-level |
| 4. Recurring Tasks | 4.1, 4.2 | Must Have | C-level |
| 5. Conflict Detection | 5.1 | Must Have | C-level |
| 6. Analytics | 6.1, 6.2, 6.3, 6.4 | Should Have | B-level |
| 7. Configuration | 7.1, 7.2, 7.3 | Must Have | B-level |

**Total**: 7 Epics, 18 Stories, 70+ Acceptance Criteria Scenarios
