# Business Logic Model — Unit 3: Scheduling Engine

## Design Decisions Summary

| Decision | Choice | Source |
|----------|--------|--------|
| Soft constraint evaluation | Weighted scoring | Q1: A |
| Task splitting | Hybrid (fill slots + minimum floor) | Q2: C |
| Schedule stability | Pin completed/in-progress, reschedule rest | Q3: C |
| Energy matching | Tag-based | Q4: B |
| Focus-time identification | Tag-based | Q5: B |
| Recurrence expansion | On every replan | Q6: A |
| Cycle detection | DFS for validation, Kahn's for ordering | Q7: C |
| Deprioritization suggestions | Greedy by priority | Q8: A |

---

## 1. Scheduler — Constraint Satisfaction Solver

### 1.1 Algorithm Overview

The scheduler generates an optimized time-block schedule by:
1. Collecting inputs (tasks, events, config, dependencies)
2. Pinning immovable blocks (completed/in-progress tasks, events)
3. Resolving dependency ordering (Kahn's topological sort)
4. Placing each task into the best available slot (hard constraint filtering → soft constraint scoring)
5. Splitting tasks across slots when needed (hybrid strategy)
6. Running conflict detection on unschedulable tasks

```
generateSchedule(start, end):
  1. Load inputs:
     - pendingTasks = taskRepo.findAll({ status: [pending, scheduled, at_risk] })
     - pinnedBlocks = scheduleRepo.getSchedule(start, end) filtered to completed/in-progress tasks
     - events = eventRepo.findInRange(start, end)
     - config = configRepo.getFullConfig()
     - dependencies = all DependencyEdge records for pending tasks

  2. Build availability map:
     - For each day in [start, end]: compute available slots from config.availability
     - Subtract event blocks (immovable)
     - Subtract pinned task blocks (completed/in-progress)
     - Result: list of AvailableSlot { date, startTime, endTime, durationMinutes }

  3. Order tasks for placement:
     - Run dependencyResolver.topologicalSort(pendingTasks, dependencies)
     - Within each dependency tier, sort by: priority ASC (P1 first), deadline ASC (soonest first), duration ASC (shortest first for tie-breaking)

  4. Place each task:
     - Filter slots by hard constraints (see Section 1.2)
     - Score remaining slots by soft constraints (see Section 1.3)
     - Select highest-scoring slot(s)
     - If task fits in one slot → create single TimeBlock
     - If task exceeds slot → split using hybrid strategy (see Section 1.4)
     - If no valid slot exists → mark task as at_risk

  5. Run conflict detection:
     - conflictDetector.detectConflicts(unscheduledTasks, timeBlocks, config.availability)

  6. Save and return:
     - Return ScheduleResult { timeBlocks, conflicts, atRiskTasks }
```

### 1.2 Hard Constraints (Binary — Pass/Fail)

Hard constraints eliminate invalid slots. A slot is invalid if ANY hard constraint fails.

| Constraint | Rule | Fail Condition |
|------------|------|----------------|
| **Availability** | Task blocks must fall within availability windows | Slot is outside configured availability for that day |
| **Event conflicts** | Task blocks must not overlap with events | Slot overlaps with any event time range |
| **Deadline** | Task must complete before its deadline | Slot's end time + remaining task duration exceeds deadline |
| **Dependencies** | Task must be scheduled after all dependencies | Slot's start time is before the latest dependency's scheduled end time |
| **Pinned blocks** | Task must not overlap with completed/in-progress blocks | Slot overlaps with a pinned block |

### 1.3 Soft Constraints (Weighted Scoring)

After hard constraint filtering, each remaining candidate slot receives a weighted score. The slot with the highest total score is selected.

```
scoreSlot(task, slot, config):
  score = 0
  score += WEIGHT_DEADLINE_PROXIMITY * deadlineProximityScore(task, slot)
  score += WEIGHT_PRIORITY           * priorityScore(task, slot)
  score += WEIGHT_FOCUS_TIME         * focusTimeScore(task, slot, config.focusTime)
  score += WEIGHT_ENERGY             * energyScore(task, slot, config.preferences)
  score += WEIGHT_BUFFER             * bufferScore(slot, adjacentBlocks, config.preferences)
  return score
```

#### Default Weights

| Soft Constraint | Weight | Rationale |
|-----------------|--------|-----------|
| Deadline proximity | 40 | Nearest deadlines get priority for earlier slots |
| Priority level | 30 | P1 tasks get preferred slots over P4 tasks |
| Focus time alignment | 15 | Deep-work tagged tasks prefer focus blocks |
| Energy-time match | 10 | Energy-tagged tasks prefer matching energy zones |
| Buffer time | 5 | Prefer slots that allow buffer between adjacent tasks |

**Total: 100** — weights are relative proportions, not absolute scores.

#### Scoring Functions

**deadlineProximityScore(task, slot)**: Score 0.0 to 1.0
- Tasks with no deadline: 0.5 (neutral)
- Tasks with deadline: `1.0 - (slotStart - now) / (deadline - now)`, clamped to [0, 1]
- Effect: slots closer to now score higher for tasks with imminent deadlines

**priorityScore(task, slot)**: Score 0.0 to 1.0
- P1: 1.0, P2: 0.75, P3: 0.5, P4: 0.25
- Higher-priority tasks get a flat bonus regardless of slot; this pushes them to be placed first and get best slots via the ordering in Step 3

**focusTimeScore(task, slot, focusTime)**: Score 0.0 to 1.0
- Task has a tag in focusTagsList AND slot is within a focus block: 1.0
- Task has a focus tag AND slot is NOT in a focus block: 0.0
- Task has NO focus tag AND slot is in a focus block: 0.2 (mild penalty — prefer non-focus slots for non-focus tasks, but don't block them)
- Task has NO focus tag AND slot is NOT in a focus block: 0.5 (neutral)

**energyScore(task, slot, preferences)**: Score 0.0 to 1.0
- Task tagged "deep-work"/"focus" AND slot in peak_energy_hours: 1.0
- Task tagged "routine"/"admin" AND slot in low_energy_hours: 1.0
- Task tagged for energy AND slot in non-matching zone: 0.2
- Task with no energy tag: 0.5 (neutral — no penalty, no bonus)

**bufferScore(slot, adjacentBlocks, preferences)**: Score 0.0 to 1.0
- No adjacent task block within bufferTimeMinutes before the slot: +0.5
- No adjacent task block within bufferTimeMinutes after the slot: +0.5
- Adjacent blocks exist within buffer zone: 0.0 per side
- Effect: prefers slots that naturally have gaps, without making buffer a hard constraint

### 1.4 Task Splitting — Hybrid Strategy

When a task's remaining duration exceeds the selected slot's duration:

```
splitTask(task, candidateSlots, minimumBlockMinutes):
  remainingMinutes = task.duration
  blocks = []
  blockIndex = 0

  for each slot in candidateSlots (sorted by soft constraint score DESC):
    if slot.durationMinutes < minimumBlockMinutes:
      continue  // skip slots below minimum floor

    blockDuration = min(remainingMinutes, slot.durationMinutes)

    if remainingMinutes - blockDuration > 0 AND remainingMinutes - blockDuration < minimumBlockMinutes:
      // Remaining after this block would be below minimum — adjust
      // Option 1: reduce this block to leave enough for a minimum-sized final block
      blockDuration = remainingMinutes - minimumBlockMinutes
      if blockDuration < minimumBlockMinutes:
        // Can't split — assign all remaining to this block
        blockDuration = remainingMinutes

    blocks.push(TimeBlock {
      taskId: task.id,
      startTime: slot.startTime,
      endTime: slot.startTime + blockDuration,
      date: slot.date,
      blockIndex: blockIndex,
      totalBlocks: TBD (updated after loop)
    })

    remainingMinutes -= blockDuration
    blockIndex++

    if remainingMinutes <= 0:
      break

  // Update totalBlocks on all blocks
  for each block in blocks:
    block.totalBlocks = blocks.length

  if remainingMinutes > 0:
    // Task could not be fully scheduled — mark at_risk
    return { blocks, unscheduledMinutes: remainingMinutes }

  return { blocks, unscheduledMinutes: 0 }
```

### 1.5 Focus Time Fragmentation Prevention

When placing tasks into focus time blocks:

- If a task's duration is less than `focusTime.minimumBlockMinutes`, it is NOT placed in a focus block (unless no other slot exists)
- If placing a task in a focus block would leave a remaining fragment shorter than `minimumBlockMinutes`, expand the task's block to consume the fragment OR skip the focus block
- This prevents focus blocks from being fragmented into unusable slivers

---

## 2. DependencyResolver

### 2.1 Cycle Validation (DFS Reachability)

Called when adding a new dependency edge to validate no cycle is created.

```
validateNoCycles(taskId, dependsOnId, existingDeps):
  // Check: can we reach taskId from dependsOnId via existing edges?
  // If yes → adding taskId→dependsOnId would create a cycle
  
  Build adjacency map from existingDeps: { nodeId → [dependsOnIds] }
  
  visited = Set()
  stack = [dependsOnId]
  path = []
  
  DFS traversal:
    while stack not empty:
      current = stack.pop()
      if current === taskId:
        // Cycle found — current path + taskId forms the cycle
        throw CircularDependencyError([taskId, ...path, current])
      if visited.has(current):
        continue
      visited.add(current)
      path.push(current)
      for each neighbor in adjacency[current]:
        stack.push(neighbor)
  
  return true  // No cycle — safe to add
```

**Complexity**: O(V+E) worst case, but typically O(k) where k is the size of the subgraph reachable from `dependsOnId` (usually 2-5 nodes).

### 2.2 Topological Sort (Kahn's Algorithm)

Called by the Scheduler to order tasks respecting dependencies.

```
topologicalSort(tasks, dependencies):
  Build adjacency map and in-degree count from dependencies
  
  queue = tasks with in-degree 0 (no dependencies)
  result = []
  
  while queue not empty:
    // Among zero-in-degree tasks, dequeue by priority ASC, deadline ASC
    node = queue.dequeueHighestPriority()
    result.push(node)
    
    for each dependent of node:
      decrement in-degree
      if in-degree === 0:
        queue.enqueue(dependent)
  
  if result.length < tasks.length:
    // Remaining nodes form a cycle — should never happen if validation is enforced
    remainingIds = tasks not in result
    throw CircularDependencyError(remainingIds)
  
  return result
```

### 2.3 Blocked Task Identification

```
getBlockedTasks(tasks, dependencies):
  blockedTasks = []
  for each task in tasks:
    deps = dependencies.filter(d => d.taskId === task.id)
    for each dep in deps:
      depTask = tasks.find(t => t.id === dep.dependsOnId)
      if depTask AND depTask.status !== "completed":
        blockedTasks.push(task)
        break  // one incomplete dependency is enough
  return blockedTasks
```

Blocked tasks are excluded from scheduling — they remain in "pending" status until all dependencies are completed.

---

## 3. ConflictDetector

### 3.1 Conflict Detection

Runs as part of schedule generation, after task placement is complete.

```
detectConflicts(tasks, timeBlocks, availability):
  conflicts = []
  
  for each task in tasks:
    if task.status === "completed" OR task.status === "cancelled":
      continue
    
    scheduledBlocks = timeBlocks.filter(b => b.taskId === task.id)
    scheduledMinutes = sum(scheduledBlocks.map(b => durationOf(b)))
    
    // Check 1: Overdue
    if task.deadline AND parseUTC(task.deadline) < now():
      conflicts.push(Conflict {
        taskId: task.id,
        reason: "overdue",
        deadline: task.deadline,
        requiredMinutes: task.duration,
        availableMinutes: scheduledMinutes,
        competingTaskIds: [],
        suggestions: []
      })
      continue
    
    // Check 2: Insufficient time (partially scheduled or unscheduled)
    if scheduledMinutes < task.duration:
      competingTasks = findCompetingTasks(task, timeBlocks, availability)
      suggestions = suggestDeprioritizations(task, competingTasks)
      
      conflicts.push(Conflict {
        taskId: task.id,
        reason: "insufficient_time",
        deadline: task.deadline,
        requiredMinutes: task.duration - scheduledMinutes,
        availableMinutes: computeAvailableBeforeDeadline(task.deadline, availability, timeBlocks),
        competingTaskIds: competingTasks.map(t => t.id),
        suggestions: suggestions
      })
      continue
    
    // Check 3: Dependency chain infeasibility
    if task has dependencies:
      chainDuration = computeDependencyChainDuration(task, tasks, dependencies)
      availableBeforeDeadline = computeAvailableBeforeDeadline(task.deadline, availability, timeBlocks)
      if chainDuration > availableBeforeDeadline:
        conflicts.push(Conflict {
          taskId: task.id,
          reason: "dependency_chain",
          deadline: task.deadline,
          requiredMinutes: chainDuration,
          availableMinutes: availableBeforeDeadline,
          competingTaskIds: getDependencyChainIds(task),
          suggestions: []  // dependency chains can't be resolved by deprioritization
        })
  
  return conflicts
```

### 3.2 Competing Task Identification

```
findCompetingTasks(atRiskTask, timeBlocks, availability):
  // Tasks whose scheduled blocks occupy time before the at-risk task's deadline
  deadline = atRiskTask.deadline
  if !deadline: return []
  
  competingBlocks = timeBlocks.filter(b =>
    b.taskId !== atRiskTask.id AND
    parseUTC(b.endTime) <= parseUTC(deadline)
  )
  
  // Group by taskId, compute total scheduled time per task
  competingTaskIds = unique(competingBlocks.map(b => b.taskId))
  return competingTaskIds with their scheduled durations
```

### 3.3 Deprioritization Suggestions (Greedy by Priority)

```
suggestDeprioritizations(atRiskTask, competingTasks):
  // Filter: never suggest deprioritizing a task with a nearer deadline
  filtered = competingTasks.filter(t =>
    !t.deadline OR !atRiskTask.deadline OR
    parseUTC(t.deadline) > parseUTC(atRiskTask.deadline)
  )
  
  // Sort: lowest priority first (P4 before P3), then furthest deadline first
  sorted = filtered.sort((a, b) =>
    priorityRank(b.priority) - priorityRank(a.priority) ||  // P4=4 > P3=3
    (b.deadline ?? Infinity) - (a.deadline ?? Infinity)      // furthest first
  )
  
  suggestions = []
  freedMinutes = 0
  requiredMinutes = atRiskTask.duration - atRiskTask.scheduledMinutes
  
  for each task in sorted:
    suggestions.push(DeprioritizationSuggestion {
      taskId: task.id,
      currentPriority: task.priority,
      freedMinutes: task.scheduledMinutes
    })
    freedMinutes += task.scheduledMinutes
    if freedMinutes >= requiredMinutes:
      break  // enough time freed
  
  return suggestions
```

---

## 4. ReplanCoordinator

### 4.1 State Machine

```
State:
  dirty: boolean = false
  replanning: boolean = false
  pendingImmediate: NodeJS.Immediate | null = null
  awaitCallbacks: Array<() => void> = []
```

### 4.2 Lifecycle

```
requestReplan():
  dirty = true
  if pendingImmediate === null AND replanning === false:
    pendingImmediate = setImmediate(() => executeReplan())

executeReplan():
  pendingImmediate = null
  if !dirty: 
    return
  dirty = false
  replanning = true
  scheduleRepo.setScheduleStatus("replan_in_progress")
  
  try:
    // Step 1: Expand recurrence horizon
    recurrenceManager.expandHorizon(now + schedulingHorizonWeeks)
    
    // Step 2: Generate schedule
    horizonStart = startOfDay(nowUTC())
    horizonEnd = addWeeks(horizonStart, config.preferences.schedulingHorizonWeeks)
    result = scheduler.generateSchedule(horizonStart, horizonEnd)
    
    // Step 3: Save results
    scheduleRepo.clearSchedule()
    scheduleRepo.saveSchedule(result.timeBlocks)
    
    // Step 4: Update task statuses based on results
    for each atRiskTask in result.atRiskTasks:
      taskRepo.updateStatus(atRiskTask.taskId, "at_risk")
    for each timeBlock in result.timeBlocks:
      task = taskRepo.findById(timeBlock.taskId)
      if task.status === "pending" OR task.status === "at_risk":
        taskRepo.updateStatus(task.id, "scheduled")
  finally:
    replanning = false
    scheduleRepo.setScheduleStatus("up_to_date")
    
    // Resolve any awaitReplan promises
    for each callback in awaitCallbacks:
      callback()
    awaitCallbacks = []
    
    // If dirty again (mutation during replan), schedule another
    if dirty:
      pendingImmediate = setImmediate(() => executeReplan())

isReplanning(): boolean
  return replanning

getScheduleStatus(): ScheduleStatus
  if replanning: return "replan_in_progress"
  return scheduleRepo.getScheduleStatus()

awaitReplan(): Promise<void>
  if !dirty AND !replanning:
    // Nothing to do — schedule is current
    return Promise.resolve()
  
  if !replanning AND dirty:
    // Force immediate execution instead of waiting for setImmediate
    if pendingImmediate:
      clearImmediate(pendingImmediate)
      pendingImmediate = null
    executeReplan()
    return Promise.resolve()
  
  // Replan is in progress — wait for it to complete
  return new Promise(resolve => {
    awaitCallbacks.push(resolve)
  })
```

### 4.3 Debouncing Behavior

- `requestReplan()` called multiple times rapidly → only one `setImmediate` is pending at a time
- If called during an active replan → `dirty` is set, triggering a follow-up replan when the current one finishes
- `awaitReplan()` (explicit replan tool) → bypasses `setImmediate` if no replan is active; otherwise waits for the current cycle to complete

---

## 5. RecurrenceManager

### 5.1 Instance Generation

```
createRecurringTask(taskData, rruleString):
  // Validate RRULE
  parsedRule = rrule.rrulestr(rruleString)  // throws on invalid syntax
  
  // Create template
  template = recurrenceRepo.createTemplate({
    taskData: taskData,
    rrule: rruleString,
    isActive: true
  })
  
  // Generate initial instances within horizon
  instances = generateInstances(template.id, horizonEnd())
  
  return { template, instances }

generateInstances(templateId, horizonEnd):
  template = recurrenceRepo.getTemplate(templateId)
  if !template OR !template.isActive:
    return []
  
  // Get existing instances to avoid duplicates
  existingInstances = recurrenceRepo.getInstances(templateId, now(), horizonEnd)
  existingDates = Set(existingInstances.map(i => i.scheduledDate))
  
  // Parse RRULE and generate dates
  rule = rrule.rrulestr(template.rrule)
  dates = rule.between(now(), horizonEnd, true)
  
  // Get exceptions for this template
  exceptions = recurrenceRepo.getExceptions(templateId)
  skipDates = Set(exceptions.filter(e => e.type === "skip").map(e => e.date))
  
  newInstances = []
  for each date in dates:
    dateStr = formatDate(date)
    if existingDates.has(dateStr):
      continue  // already generated
    if skipDates.has(dateStr):
      continue  // skipped by exception
    
    // Check for modification exception
    modException = exceptions.find(e => e.type === "modify" AND e.date === dateStr)
    taskOverrides = modException?.overrides ?? {}
    
    // Create task instance
    task = taskRepo.create({
      ...template.taskData,
      ...taskOverrides,
      isRecurring: true,
      recurrenceTemplateId: templateId
    })
    
    instance = recurrenceRepo.createInstance({
      templateId: templateId,
      taskId: task.id,
      scheduledDate: dateStr,
      isException: modException !== null
    })
    
    newInstances.push(instance)
  
  return newInstances
```

### 5.2 Horizon Expansion

Called by ReplanCoordinator at the start of every replan cycle.

```
expandHorizon(newHorizonEnd):
  activeTemplates = recurrenceRepo.getActiveTemplates()
  allNewInstances = []
  
  for each template in activeTemplates:
    instances = generateInstances(template.id, newHorizonEnd)
    allNewInstances.push(...instances)
  
  return allNewInstances
```

### 5.3 Exception Handling

```
skipInstance(templateId, date):
  recurrenceRepo.addException(templateId, date, {
    templateId, date, type: "skip", overrides: null
  })
  // If a task instance already exists for this date, cancel it
  instances = recurrenceRepo.getInstances(templateId, date, date)
  for each instance in instances:
    taskRepo.updateStatus(instance.taskId, "cancelled")

modifyInstance(instanceId, updates):
  instance = recurrenceRepo.getInstance(instanceId)
  if !instance:
    throw NotFoundError("recurrence instance", instanceId)
  
  task = taskRepo.findById(instance.taskId)
  if task.status === "completed":
    throw InvalidStateError("cannot modify completed instance")
  
  taskRepo.update(instance.taskId, updates)
  recurrenceRepo.markAsException(instanceId)

deleteTemplate(templateId):
  template = recurrenceRepo.getTemplate(templateId)
  if !template:
    throw NotFoundError("recurrence template", templateId)
  
  // Cancel all future (non-completed) instances
  instances = recurrenceRepo.getInstances(templateId, now(), farFuture)
  for each instance in instances:
    task = taskRepo.findById(instance.taskId)
    if task.status !== "completed":
      taskRepo.updateStatus(instance.taskId, "cancelled")
  
  recurrenceRepo.deleteTemplate(templateId)
```
