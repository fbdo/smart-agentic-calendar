# Business Logic Model — Unit 4: Analytics

## Design Decisions Summary

| Decision | Choice | Source |
|----------|--------|--------|
| Completion rate denominator | Resolved tasks only (completed + overdue + cancelled) | Q1: B |
| Health score formula | Weighted deduction (start 100, deduct for problems) | Q2: A |
| Period boundary definition | Current calendar period | Q3: A |
| Estimation accuracy metric | Deviation-based (100% = perfect, 0-100 bounded) | Q4: B |

---

## 1. Period Resolution

All analytics calculators accept a `period` parameter ("day", "week", "month") and resolve it to a `[start, end)` date range using current calendar boundaries.

```
resolvePeriod(period, referenceDate):
  switch period:
    "day":
      start = referenceDate at 00:00:00Z
      end   = start + 1 day
    "week":
      start = most recent Monday at 00:00:00Z (or referenceDate if Monday)
      end   = start + 7 days
    "month":
      start = 1st of current month at 00:00:00Z
      end   = 1st of next month at 00:00:00Z
  return { start, end }
```

- `referenceDate` defaults to current UTC date
- All boundaries are ISO 8601 UTC strings
- Range is half-open: `start <= t < end`

---

## 2. Productivity Calculator (Story 6.1)

### 2.1 Input Data

```
getProductivityStats(period):
  { start, end } = resolvePeriod(period)
  completedTasks = analyticsRepo.getCompletedTasks(start, end)
  overdueTasks   = analyticsRepo.getOverdueTasks(end)
                   .filter(t => t.deadline >= start)
  cancelledTasks = analyticsRepo.getCancelledTasks(start, end)
```

- `completedTasks`: tasks with status "completed" and `updated_at` within `[start, end)`
- `overdueTasks`: tasks with deadline passed and status not completed/cancelled, filtered to deadlines within the period
- `cancelledTasks`: tasks with status "cancelled" and `updated_at` within `[start, end)`

### 2.2 Metrics Computation

```
tasksCompleted = completedTasks.length
tasksOverdue   = overdueTasks.length
tasksCancelled = cancelledTasks.length

resolvedCount = tasksCompleted + tasksOverdue + tasksCancelled

completionRate:
  if resolvedCount == 0: 0
  else: (tasksCompleted / resolvedCount) * 100

onTimeRate:
  tasksWithDeadline = completedTasks.filter(t => t.deadline != null)
  if tasksWithDeadline.length == 0: 0
  else:
    onTimeCount = completedTasks.filter(t => t.wasOnTime).length
    (onTimeCount / tasksWithDeadline.length) * 100
```

### 2.3 Return Value

Returns `ProductivityStats`:
- `period`: the input period string
- `tasksCompleted`: count
- `tasksOverdue`: count
- `tasksCancelled`: count
- `completionRate`: 0-100 percentage (2 decimal places)
- `onTimeRate`: 0-100 percentage (2 decimal places)

---

## 3. Health Calculator (Story 6.2)

### 3.1 Input Data

```
getScheduleHealth(referenceDate):
  config       = configRepo.getFullConfig()
  weekRange    = resolvePeriod("week", referenceDate)
  timeBlocks   = scheduleRepo.getSchedule(weekRange.start, weekRange.end)
  overdueTasks = analyticsRepo.getOverdueTasks(referenceDate.toISOString())
  atRiskTasks  = taskRepo.findByStatus("at_risk")
  availability = config.availability
```

### 3.2 Utilization Calculation

```
availableMinutesPerDay:
  for each day in current week:
    sum availability windows for that day-of-week
  totalAvailableMinutes = sum across all 7 days

scheduledMinutesPerDay:
  for each day in current week:
    sum timeBlock durations for that day
  totalScheduledMinutes = sum across all 7 days

utilizationPercentage:
  if totalAvailableMinutes == 0: 0
  else: (totalScheduledMinutes / totalAvailableMinutes) * 100
```

### 3.3 Busiest/Lightest Day

```
perDayMinutes = map of dayName -> scheduledMinutes for current week
busiestDay  = day with max scheduledMinutes
lightestDay = day with min scheduledMinutes (considering only days with availability > 0)

If tie: pick the earlier day in the week.
If no availability configured: busiestDay = null, lightestDay = null
```

### 3.4 Free Hours

```
freeHoursThisWeek = (totalAvailableMinutes - totalScheduledMinutes) / 60
Floor at 0 (cannot be negative — if overscheduled, free hours = 0)
```

### 3.5 Health Score (Weighted Deduction)

```
score = 100

Overdue penalty:
  score -= overdueCount * 15
  (each overdue task is a significant problem)

At-risk penalty:
  score -= atRiskCount * 10
  (each at-risk task is an early warning)

Utilization penalty:
  if utilizationPercentage > 90:
    score -= (utilizationPercentage - 90) * 2
    (penalty increases linearly above 90%: 92% = -4, 95% = -10, 100% = -20)
  else if utilizationPercentage < 20:
    score -= (20 - utilizationPercentage) * 1
    (mild penalty for very low utilization: 10% = -10, 0% = -20)

score = clamp(score, 0, 100)
```

**Penalty rationale**:
- Overdue (×15): highest weight — these are missed commitments
- At-risk (×10): urgent but not yet failed
- Over-utilization (×2 per point above 90%): schedule fragility, no buffer for surprises
- Under-utilization (×1 per point below 20%): possible misconfiguration or no tasks

### 3.6 Return Value

Returns `ScheduleHealth`:
- `healthScore`: 0-100 integer
- `utilizationPercentage`: 0-100 percentage (2 decimal places)
- `overdueCount`: count
- `atRiskCount`: count
- `freeHoursThisWeek`: number (1 decimal place)
- `busiestDay`: day name string or null
- `lightestDay`: day name string or null

---

## 4. Estimation Calculator (Story 6.3)

### 4.1 Input Data

```
getEstimationAccuracy(period):
  { start, end } = resolvePeriod(period)
  records = analyticsRepo.getDurationRecords(start, end)
```

- `records`: completed tasks with non-null `actual_duration` within the period
- Each record has `estimatedMinutes`, `actualMinutes`, `category`

### 4.2 Accuracy Computation (Deviation-Based)

```
perTaskAccuracy(estimated, actual):
  if estimated == 0: return 0
  deviation = |actual - estimated| / estimated * 100
  return max(0, 100 - deviation)
```

- 100% = perfect estimate
- 0% = actual was 2x or more off from estimate (in either direction)
- Symmetric: overestimate and underestimate of same magnitude yield same score

```
averageAccuracyPercentage:
  if records.length == 0: null
  else: average of perTaskAccuracy for all records (2 decimal places)
```

### 4.3 Over/Under Estimate Classification

```
overestimates  = records.filter(r => r.actualMinutes < r.estimatedMinutes)
underestimates = records.filter(r => r.actualMinutes > r.estimatedMinutes)

overestimateCount  = overestimates.length
underestimateCount = underestimates.length

averageOverestimateMinutes:
  if overestimateCount == 0: null
  else: average of (estimated - actual) for overestimates (1 decimal place)

averageUnderestimateMinutes:
  if underestimateCount == 0: null
  else: average of (actual - estimated) for underestimates (1 decimal place)
```

Both average values are expressed as positive minutes (magnitude of error, not direction).

### 4.4 Per-Category Accuracy

```
accuracyByCategory:
  if records.length == 0: null
  else:
    group records by category (null → "uncategorized")
    for each group: compute average perTaskAccuracy
    return Record<string, number> (category → accuracy percentage)
```

### 4.5 Return Value

Returns `EstimationAccuracy`:
- `averageAccuracyPercentage`: number | null (2 decimal places)
- `overestimateCount`: count
- `underestimateCount`: count
- `averageOverestimateMinutes`: number | null (1 decimal place)
- `averageUnderestimateMinutes`: number | null (1 decimal place)
- `accuracyByCategory`: Record<string, number> | null

---

## 5. Allocation Calculator (Story 6.4)

### 5.1 Input Data

```
getTimeAllocation(period):
  { start, end } = resolvePeriod(period)
  categorySummaries = analyticsRepo.getTasksByCategory(start, end)
```

- `categorySummaries`: grouped by category with `totalMinutes` and `taskCount`
- Null categories are already mapped to "uncategorized" by the repository

### 5.2 Computation

```
totalMinutesAllCategories = sum of categorySummary.totalMinutes

categories = categorySummaries.map(cs => {
  category: cs.category,
  hours: cs.totalMinutes / 60  (2 decimal places),
  percentage: if totalMinutesAllCategories == 0: 0
              else: (cs.totalMinutes / totalMinutesAllCategories) * 100  (2 decimal places)
})

Sort by hours descending.
```

### 5.3 Return Value

Returns `TimeAllocation`:
- `period`: the input period string
- `categories`: array of `CategoryAllocation`:
  - `category`: string
  - `hours`: number (2 decimal places)
  - `percentage`: number (2 decimal places)

---

## 6. AnalyticsEngine Orchestrator

### 6.1 Constructor Dependencies

```
AnalyticsEngine(
  analyticsRepo: AnalyticsRepository,
  taskRepo: TaskRepository,
  scheduleRepo: ScheduleRepository,
  configRepo: ConfigRepository
)
```

All repositories are injected via constructor (DI pattern per NFR-4.6).

### 6.2 Internal Delegation

The AnalyticsEngine creates specialized calculator instances internally and delegates:

```
analyticsEngine.getProductivityStats(period)  → productivityCalculator.compute(period)
analyticsEngine.getScheduleHealth()           → healthCalculator.compute()
analyticsEngine.getEstimationAccuracy(period) → estimationCalculator.compute(period)
analyticsEngine.getTimeAllocation(period)     → allocationCalculator.compute(period)
```

### 6.3 Calculator Instantiation

Calculators are stateless — they receive repository references and compute on demand. Two options:

- **Inline**: AnalyticsEngine holds repo references and creates calculators in each method call
- **Stored**: AnalyticsEngine creates calculator instances once in the constructor

**Choice**: Stored — calculators are created once in the constructor with their required repositories. This avoids repeated object creation and keeps the delegation pattern clean.

```
constructor(analyticsRepo, taskRepo, scheduleRepo, configRepo):
  this.productivity = new ProductivityCalculator(analyticsRepo)
  this.health       = new HealthCalculator(analyticsRepo, taskRepo, scheduleRepo, configRepo)
  this.estimation   = new EstimationCalculator(analyticsRepo)
  this.allocation   = new AllocationCalculator(analyticsRepo)
```

### 6.4 Period Validation

```
validatePeriod(period):
  if period not in ["day", "week", "month"]:
    throw ValidationError("invalid period: must be day, week, or month")
```

Called at the start of `getProductivityStats`, `getEstimationAccuracy`, and `getTimeAllocation`. Not needed for `getScheduleHealth` (always uses current week).
