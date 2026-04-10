# Business Logic Model — Unit 5: MCP Server

## Design Decisions Summary

| Decision | Choice | Source |
|----------|--------|--------|
| Error response format | MCP `isError: true` with structured JSON | Q1: A |
| Actual duration source | Agent-provided, defaults to estimated duration | Q2: A |
| Parameter naming | snake_case for MCP, internal mapping to camelCase | Q3: A |
| Schedule enrichment | Full: title, priority, category, status per block | Q4: A |

---

## 1. TaskTools (Stories 1.1-1.5, 1.4, 4.1, 4.2)

### 1.1 create_task (Story 1.1, 4.1)

**Pattern**: Mutation + Background Replan

```
create_task(input: CreateTaskInput):
  // Step 1: Validate
  validate required: title, estimated_duration
  validate estimated_duration > 0
  if priority present: validate in [P1, P2, P3, P4]
  if deadline present: validate ISO 8601
  if recurrence_rule present: validate RRULE syntax (delegated)
  if blocked_by present: validate all target IDs exist, no self-reference

  // Step 2: Apply defaults
  priority = input.priority ?? "P3"
  description = input.description ?? null
  category = input.category ?? null
  tags = input.tags ?? []

  // Step 3: Map snake_case input → camelCase internal types
  taskData = mapCreateTaskInput(input)

  // Step 4: Branch — recurring vs one-time
  if recurrence_rule present:
    result = recurrenceManager.createRecurringTask(taskData, recurrence_rule, now, horizonEnd)
    // Process dependencies for each generated instance if blocked_by present
    if blocked_by present:
      for each instance in result.instances:
        for each depId in blocked_by:
          dependencyResolver.validateNoCycles(instance.taskId, depId, existingDeps)
          taskRepo.addDependency(instance.taskId, depId)
    replanCoordinator.requestReplan()
    return RecurringTaskOutput {
      template_id: result.template.id,
      instances: result.instances mapped to { instance_id, task_id, scheduled_date },
      message: "Recurring task created with N instances within scheduling horizon"
    }
  else:
    task = taskRepo.create(taskData)
    if blocked_by present:
      for each depId in blocked_by:
        dependencyResolver.validateNoCycles(task.id, depId, existingDeps)
        taskRepo.addDependency(task.id, depId)
    replanCoordinator.requestReplan()
    return TaskOutput { task: mapTaskOutput(task) }
```

### 1.2 update_task (Stories 1.2, 1.4, 4.2)

**Pattern**: Mutation + Background Replan

```
update_task(input: UpdateTaskInput):
  // Step 1: Validate
  validate required: task_id
  validate at least one update field present
  if estimated_duration present: validate > 0
  if priority present: validate in [P1, P2, P3, P4]
  if deadline present: validate ISO 8601

  // Step 2: Find task
  task = taskRepo.findById(input.task_id)
  if not found: throw NotFoundError("task", input.task_id)

  // Step 3: Check state
  if task.status == "completed" and task.isRecurring:
    throw InvalidStateError("cannot modify completed instance")

  // Step 4: Handle dependency updates
  if blocked_by present:
    // Validate all targets exist
    for each depId in blocked_by:
      depTask = taskRepo.findById(depId)
      if not found: throw NotFoundError("dependency target task", depId)
      if depId == task.id: throw ValidationError("task cannot depend on itself")

    // Get current dependencies for cycle check context
    allDeps = taskRepo.getAllDependencies()

    // Remove existing dependencies for this task
    existingDeps = taskRepo.getDependencies(task.id)
    for each dep in existingDeps:
      taskRepo.removeDependency(task.id, dep.id)

    // Add new dependencies with cycle validation
    for each depId in blocked_by:
      dependencyResolver.validateNoCycles(task.id, depId, allDeps)
      taskRepo.addDependency(task.id, depId)

  // Step 5: Update other fields
  updates = mapUpdateFields(input)  // only non-undefined fields
  if updates has fields:
    task = taskRepo.update(task.id, updates)

  // Step 6: Trigger replan
  replanCoordinator.requestReplan()

  return TaskOutput { task: mapTaskOutput(task) }
```

### 1.3 complete_task (Story 1.2)

**Pattern**: Mutation + Background Replan (with idempotency)

```
complete_task(input: CompleteTaskInput):
  // Step 1: Validate
  validate required: task_id
  if actual_duration_minutes present: validate > 0

  // Step 2: Find task
  task = taskRepo.findById(input.task_id)
  if not found: throw NotFoundError("task", input.task_id)

  // Step 3: Idempotency check
  if task.status == "completed":
    return TaskOutput { task: mapTaskOutput(task) }
    // No replan triggered — already completed

  // Step 4: Record actual duration (Q2: A)
  actualDuration = input.actual_duration_minutes ?? task.duration
  taskRepo.recordActualDuration(task.id, actualDuration)

  // Step 5: Update status
  task = taskRepo.updateStatus(task.id, "completed")

  // Step 6: Unblock dependents
  dependents = taskRepo.getDependents(task.id)
  // Dependencies are automatically satisfied — the dependent tasks
  // will be rescheduled by the replan if all their dependencies are met

  // Step 7: Trigger replan
  replanCoordinator.requestReplan()

  return TaskOutput { task: mapTaskOutput(task) }
```

### 1.4 delete_task (Story 1.5)

**Pattern**: Mutation + Background Replan

```
delete_task(input: DeleteTaskInput):
  // Step 1: Validate
  validate required: task_id

  // Step 2: Find task
  task = taskRepo.findById(input.task_id)
  if not found: throw NotFoundError("task", input.task_id)

  // Step 3: Identify dependents before cancellation
  dependents = taskRepo.getDependents(task.id)
  affectedDependentIds = dependents.map(d => d.id)

  // Step 4: Cancel task (soft delete)
  taskRepo.updateStatus(task.id, "cancelled")

  // Step 5: If this was a recurrence template, cancel all future instances
  if task.isRecurring and task.recurrenceTemplateId:
    recurrenceManager.deleteTemplate(task.recurrenceTemplateId)

  // Step 6: Trigger replan
  replanCoordinator.requestReplan()

  return DeleteTaskOutput {
    task_id: task.id,
    status: "cancelled",
    affected_dependents: affectedDependentIds,
    message: "Task cancelled." + (if affectedDependentIds.length > 0:
      " Warning: N dependent task(s) may be affected." else "")
  }
```

### 1.5 list_tasks (Story 1.3)

**Pattern**: Pure Computation (no replan)

```
list_tasks(input: ListTasksInput):
  // Step 1: Validate filters
  if status present: validate in [pending, scheduled, completed, cancelled, at_risk]
  if priority present: validate in [P1, P2, P3, P4]
  if deadline_before present: validate ISO 8601
  if deadline_after present: validate ISO 8601

  // Step 2: Map filters
  filters = mapListTasksInput(input)

  // Step 3: Query
  // Default behavior (no status filter): returns all non-cancelled tasks
  if no status filter and no other filters:
    filters.excludeStatus = "cancelled"  // Story 1.3: default excludes cancelled
  tasks = taskRepo.findAll(filters)

  return ListTasksOutput {
    tasks: tasks.map(mapTaskOutput),
    count: tasks.length
  }
```

**Note on default filtering**: When no `status` filter is provided, `list_tasks` excludes cancelled tasks per Story 1.3. When a `status` filter IS provided (including `status: "cancelled"`), it returns exactly what was requested.

---

## 2. EventTools (Story 2.1)

### 2.1 create_event

**Pattern**: Mutation + Background Replan

```
create_event(input: CreateEventInput):
  // Step 1: Validate
  validate required: title
  if is_all_day == true:
    validate required: date (YYYY-MM-DD format)
    // start_time and end_time are ignored
  else:
    validate required: start_time, end_time
    validate end_time > start_time
    validate ISO 8601 format

  // Step 2: Map and create
  eventData = mapCreateEventInput(input)
  event = eventRepo.create(eventData)

  // Step 3: Trigger replan
  replanCoordinator.requestReplan()

  return EventOutput { event: mapEventOutput(event) }
```

### 2.2 update_event

**Pattern**: Mutation + Background Replan

```
update_event(input: UpdateEventInput):
  // Step 1: Validate
  validate required: event_id
  validate at least one update field present
  if start_time or end_time present: validate consistency

  // Step 2: Find event
  event = eventRepo.findById(input.event_id)
  if not found: throw NotFoundError("event", input.event_id)

  // Step 3: Update
  updates = mapUpdateEventFields(input)
  event = eventRepo.update(event.id, updates)

  // Step 4: Trigger replan
  replanCoordinator.requestReplan()

  return EventOutput { event: mapEventOutput(event) }
```

### 2.3 delete_event

**Pattern**: Mutation + Background Replan

```
delete_event(input: DeleteEventInput):
  // Step 1: Validate
  validate required: event_id

  // Step 2: Find event
  event = eventRepo.findById(input.event_id)
  if not found: throw NotFoundError("event", input.event_id)

  // Step 3: Delete (hard delete — events are not soft-deleted)
  eventRepo.delete(event.id)

  // Step 4: Trigger replan
  replanCoordinator.requestReplan()

  return DeleteEventOutput {
    event_id: event.id,
    message: "Event deleted successfully"
  }
```

### 2.4 list_events

**Pattern**: Pure Computation (no replan)

```
list_events(input: ListEventsInput):
  // Step 1: Validate
  validate required: start_date, end_date
  validate end_date > start_date
  validate ISO 8601 format

  // Step 2: Query
  events = eventRepo.findInRange(new Date(input.start_date), new Date(input.end_date))

  return ListEventsOutput {
    events: events.map(mapEventOutput),
    count: events.length
  }
```

---

## 3. ScheduleTools (Stories 3.1, 5.1)

### 3.1 get_schedule (Story 3.1)

**Pattern**: Read + Status

```
get_schedule(input: GetScheduleInput):
  // Step 1: Validate
  validate required: start_date, end_date
  validate end_date > start_date

  // Step 2: Read schedule
  timeBlocks = scheduleRepo.getSchedule(new Date(input.start_date), new Date(input.end_date))

  // Step 3: Enrich time blocks (Q4: A)
  enrichedBlocks = enrichTimeBlocks(timeBlocks)

  // Step 4: Get status
  scheduleStatus = replanCoordinator.getScheduleStatus()

  // Step 5: Build response
  response = GetScheduleOutput {
    schedule: enrichedBlocks,
    schedule_status: scheduleStatus
  }

  if scheduleStatus == "replan_in_progress":
    response.message = "A replan is currently in progress. The returned schedule may not reflect the latest changes. Please try again shortly."

  return response
```

### 3.2 replan (Story 3.2 — explicit synchronous replan)

**Pattern**: Synchronous Replan

```
replan(input: ReplanInput):
  // Step 1: Await replan completion
  await replanCoordinator.awaitReplan()

  // Step 2: Read updated schedule (full horizon)
  preferences = configRepo.getPreferences()
  horizonStart = today at 00:00:00Z
  horizonEnd = horizonStart + preferences.schedulingHorizonWeeks * 7 days
  timeBlocks = scheduleRepo.getSchedule(horizonStart, horizonEnd)

  // Step 3: Enrich time blocks
  enrichedBlocks = enrichTimeBlocks(timeBlocks)

  // Step 4: Read conflicts
  // Re-read from the latest schedule result stored by the replan
  tasks = taskRepo.findAll({})
  availability = configRepo.getAvailability()
  allDeps = taskRepo.getAllDependencies()
  conflicts = conflictDetector.detectConflicts(tasks, timeBlocks, availability, allDeps, new Date())

  return ReplanOutput {
    schedule: enrichedBlocks,
    conflicts: conflicts.map(mapConflictOutput),
    schedule_status: "up_to_date",
    message: "Schedule replanned successfully"
  }
```

**Note**: `replan` is the ONLY tool that awaits `replanCoordinator.awaitReplan()`. The `ScheduleTools` class needs `ConfigRepository` access to determine the horizon for the full-schedule read after replan. This is passed via `TaskRepository` (for conflict detection) and `ConfigRepository` (for horizon).

**Updated constructor**:
```
ScheduleTools(
  scheduleRepo: ScheduleRepository,
  taskRepo: TaskRepository,
  configRepo: ConfigRepository,
  replanCoordinator: ReplanCoordinator,
  conflictDetector: ConflictDetector
)
```

### 3.3 get_conflicts (Story 5.1)

**Pattern**: Read + Status

```
get_conflicts(input: GetConflictsInput):
  // Step 1: Read current conflicts
  // Conflicts are computed during the last replan — read the at-risk tasks
  tasks = taskRepo.findAll({ status: "at_risk" })
  allTasks = taskRepo.findAll({})
  timeBlocks = scheduleRepo.getSchedule(horizonStart, horizonEnd)
  availability = configRepo.getAvailability()
  allDeps = taskRepo.getAllDependencies()

  conflicts = conflictDetector.detectConflicts(allTasks, timeBlocks, availability, allDeps, new Date())

  // Step 2: Get status
  scheduleStatus = replanCoordinator.getScheduleStatus()

  return GetConflictsOutput {
    conflicts: conflicts.map(mapConflictOutput),
    schedule_status: scheduleStatus
  }
```

### 3.4 enrichTimeBlocks Helper

```
enrichTimeBlocks(timeBlocks: TimeBlock[]): EnrichedTimeBlock[]
  // Step 1: Collect unique task IDs
  taskIds = unique set of timeBlocks.map(b => b.taskId)

  // Step 2: Batch fetch tasks
  tasksMap = new Map<string, Task>()
  for each id in taskIds:
    task = taskRepo.findById(id)
    if task: tasksMap.set(id, task)

  // Step 3: Merge
  return timeBlocks.map(block => {
    task = tasksMap.get(block.taskId)
    return {
      id: block.id,
      task_id: block.taskId,
      start_time: block.startTime,
      end_time: block.endTime,
      date: block.date,
      block_index: block.blockIndex,
      total_blocks: block.totalBlocks,
      task_title: task?.title ?? "Unknown",
      task_priority: task?.priority ?? "P3",
      task_category: task?.category ?? null,
      task_status: task?.status ?? "pending"
    }
  })
```

---

## 4. AnalyticsTools (Stories 6.1-6.4)

**Pattern**: Pure Computation (no replan) — thin wrappers around AnalyticsEngine

### 4.1 get_productivity_stats (Story 6.1)

```
get_productivity_stats(input: GetProductivityStatsInput):
  validate required: period
  validate period in ["day", "week", "month"]

  stats = analyticsEngine.getProductivityStats(input.period)

  return mapProductivityOutput(stats)
```

### 4.2 get_schedule_health (Story 6.2)

```
get_schedule_health(input: GetScheduleHealthInput):
  // No parameters to validate

  health = analyticsEngine.getScheduleHealth()

  return mapHealthOutput(health)
```

### 4.3 get_estimation_accuracy (Story 6.3)

```
get_estimation_accuracy(input: GetEstimationAccuracyInput):
  validate required: period
  validate period in ["day", "week", "month"]

  accuracy = analyticsEngine.getEstimationAccuracy(input.period)

  return mapEstimationOutput(accuracy)
```

### 4.4 get_time_allocation (Story 6.4)

```
get_time_allocation(input: GetTimeAllocationInput):
  validate required: period
  validate period in ["day", "week", "month"]

  allocation = analyticsEngine.getTimeAllocation(input.period)

  return mapAllocationOutput(allocation)
```

---

## 5. ConfigTools (Stories 7.1-7.3)

### 5.1 set_availability (Story 7.1)

**Pattern**: Mutation + Background Replan

```
set_availability(input: SetAvailabilityInput):
  // Step 1: Validate
  validate required: windows (non-empty array)
  for each window in windows:
    validate day in 0-6
    validate start_time and end_time in HH:MM format
    validate end_time > start_time

  // Step 2: Map and save
  availability = mapSetAvailabilityInput(input)
  configRepo.setAvailability(availability)

  // Step 3: Trigger replan
  replanCoordinator.requestReplan()

  return AvailabilityOutput {
    windows: input.windows,
    message: "Availability updated successfully"
  }
```

### 5.2 set_focus_time (Story 7.2)

**Pattern**: Mutation + Background Replan

```
set_focus_time(input: SetFocusTimeInput):
  // Step 1: Validate
  validate required: blocks (non-empty array)
  for each block in blocks:
    validate day in 0-6
    validate start_time and end_time in HH:MM format
    validate end_time > start_time
  if minimum_block_minutes present:
    validate 15 <= minimum_block_minutes <= 120

  // Step 2: Map and save
  focusTime = mapSetFocusTimeInput(input)
  configRepo.setFocusTime(focusTime)
  // Note: ConfigRepository validates focus time is within availability

  // Step 3: Trigger replan
  replanCoordinator.requestReplan()

  return FocusTimeOutput {
    blocks: input.blocks,
    minimum_block_minutes: focusTime.minimumBlockMinutes,
    message: "Focus time updated successfully"
  }
```

### 5.3 set_preferences (Story 7.3)

**Pattern**: Mutation + Background Replan

```
set_preferences(input: SetPreferencesInput):
  // Step 1: Validate
  validate at least one preference field present
  if buffer_time_minutes present: validate >= 0
  if default_priority present: validate in [P1, P2, P3, P4]
  if default_duration present: validate > 0
  if scheduling_horizon_weeks present: validate 1-12
  if minimum_block_minutes present: validate 15-120

  // Step 2: Map and save (partial update — merge with existing)
  partialPrefs = mapSetPreferencesInput(input)
  configRepo.setPreferences(partialPrefs)

  // Step 3: Trigger replan
  replanCoordinator.requestReplan()

  // Step 4: Return full preferences (not just what was changed)
  preferences = configRepo.getPreferences()
  return mapPreferencesOutput(preferences)
```

### 5.4 get_preferences (Story 7.3)

**Pattern**: Pure Computation (no replan)

```
get_preferences(input: GetPreferencesInput):
  // No validation needed

  config = configRepo.getFullConfig()

  return GetPreferencesOutput {
    availability: mapAvailabilityOutput(config.availability),
    focus_time: mapFocusTimeOutput(config.focusTime),
    preferences: mapPreferencesOutput(config.preferences)
  }
```

---

## 6. McpServer Setup

### 6.1 Tool Registration

The McpServer registers all 21 tools with the MCP SDK:

| Tool Name | Handler | Pattern |
|-----------|---------|---------|
| `create_task` | TaskTools.createTask | Mutation + Replan |
| `update_task` | TaskTools.updateTask | Mutation + Replan |
| `complete_task` | TaskTools.completeTask | Mutation + Replan |
| `delete_task` | TaskTools.deleteTask | Mutation + Replan |
| `list_tasks` | TaskTools.listTasks | Pure Computation |
| `create_event` | EventTools.createEvent | Mutation + Replan |
| `update_event` | EventTools.updateEvent | Mutation + Replan |
| `delete_event` | EventTools.deleteEvent | Mutation + Replan |
| `list_events` | EventTools.listEvents | Pure Computation |
| `get_schedule` | ScheduleTools.getSchedule | Read + Status |
| `replan` | ScheduleTools.replan | Sync Replan |
| `get_conflicts` | ScheduleTools.getConflicts | Read + Status |
| `get_productivity_stats` | AnalyticsTools.getProductivityStats | Pure Computation |
| `get_schedule_health` | AnalyticsTools.getScheduleHealth | Pure Computation |
| `get_estimation_accuracy` | AnalyticsTools.getEstimationAccuracy | Pure Computation |
| `get_time_allocation` | AnalyticsTools.getTimeAllocation | Pure Computation |
| `set_availability` | ConfigTools.setAvailability | Mutation + Replan |
| `set_focus_time` | ConfigTools.setFocusTime | Mutation + Replan |
| `set_preferences` | ConfigTools.setPreferences | Mutation + Replan |
| `get_preferences` | ConfigTools.getPreferences | Pure Computation |

**Total**: 20 tools (note: `get_task` is not a separate tool — use `list_tasks` with task ID filter, or look up by ID via the enriched schedule)

### 6.2 Error Wrapper

```
wrapToolHandler(handler: (input) => result):
  return async (input) => {
    try {
      result = handler(input)
      // If result is a Promise (replan tool), await it
      if result is Promise: result = await result
      return {
        content: [{ type: "text", text: JSON.stringify(result) }]
      }
    } catch (error) {
      if error instanceof AppError:
        return {
          content: [{ type: "text", text: JSON.stringify({
            code: error.code,
            message: error.message
          })}],
          isError: true
        }
      else:
        return {
          content: [{ type: "text", text: JSON.stringify({
            code: "INTERNAL_ERROR",
            message: "an unexpected error occurred"
          })}],
          isError: true
        }
    }
  }
```

### 6.3 Server Startup

```
start():
  1. Create MCP Server instance with name "smart-agentic-calendar" and version "1.0.0"
  2. Register all 20 tools with schemas and wrapped handlers
  3. Connect to StdioServerTransport
  4. Log startup confirmation to stderr (not stdout — stdout is MCP protocol)
```

---

## 7. Composition Root (src/index.ts)

```
main():
  // 1. Database
  dbPath = process.env.CALENDAR_DB_PATH ?? "./calendar.db"
  database = new Database(dbPath)

  // 2. Repositories
  taskRepo = new TaskRepository(database)
  eventRepo = new EventRepository(database)
  configRepo = new ConfigRepository(database)
  scheduleRepo = new ScheduleRepository(database)
  analyticsRepo = new AnalyticsRepository(database)
  recurrenceRepo = new RecurrenceRepository(database)

  // 3. Engine components
  dependencyResolver = new DependencyResolver()
  conflictDetector = new ConflictDetector()
  scheduler = new Scheduler(taskRepo, eventRepo, configRepo, conflictDetector, dependencyResolver, scheduleRepo)
  recurrenceManager = new RecurrenceManager(recurrenceRepo, taskRepo)
  replanCoordinator = new ReplanCoordinator(scheduler, scheduleRepo, taskRepo, configRepo, recurrenceManager)

  // 4. Analytics
  analyticsEngine = new AnalyticsEngine(analyticsRepo, taskRepo, scheduleRepo, configRepo)

  // 5. MCP Tool handlers
  taskTools = new TaskTools(taskRepo, recurrenceManager, dependencyResolver, replanCoordinator)
  eventTools = new EventTools(eventRepo, replanCoordinator)
  scheduleTools = new ScheduleTools(scheduleRepo, taskRepo, configRepo, replanCoordinator, conflictDetector)
  analyticsTools = new AnalyticsTools(analyticsEngine)
  configTools = new ConfigTools(configRepo, replanCoordinator)

  // 6. MCP Server
  server = new McpServer(taskTools, eventTools, scheduleTools, analyticsTools, configTools)
  server.start()
```

---

## 8. snake_case Mapping Functions

### 8.1 Input Mapping (snake_case → camelCase)

All input mapping functions are pure functions in `validators.ts`. They validate AND map simultaneously:

```
mapCreateTaskInput(input):
  return {
    title: input.title.trim(),
    description: input.description ?? null,
    duration: input.estimated_duration,
    deadline: input.deadline ?? null,
    priority: input.priority ?? DEFAULT_PRIORITY,
    category: input.category ?? null,
    tags: input.tags ?? [],
    isRecurring: input.recurrence_rule != null,
    recurrenceTemplateId: null
  }
  // Also extracts: blockedBy = input.blocked_by, recurrenceRule = input.recurrence_rule
```

### 8.2 Output Mapping (camelCase → snake_case)

```
mapTaskOutput(task: Task):
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    estimated_duration: task.duration,
    deadline: task.deadline,
    priority: task.priority,
    status: task.status,
    category: task.category,
    tags: task.tags,
    is_recurring: task.isRecurring,
    recurrence_template_id: task.recurrenceTemplateId,
    actual_duration: task.actualDuration,
    created_at: task.createdAt,
    updated_at: task.updatedAt
  }

mapEventOutput(event: Event):
  return {
    id: event.id,
    title: event.title,
    start_time: event.startTime,
    end_time: event.endTime,
    is_all_day: event.isAllDay,
    date: event.date,
    created_at: event.createdAt,
    updated_at: event.updatedAt
  }
```

All other mapping functions follow the same pattern — rename camelCase keys to snake_case, preserving values exactly.
