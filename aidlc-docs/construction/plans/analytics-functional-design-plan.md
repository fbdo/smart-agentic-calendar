# Functional Design Plan — Unit 4: Analytics

## Unit Context
**Unit**: Analytics (4 calculators + 1 orchestrator: AnalyticsEngine, productivity, health, estimation, allocation)
**Stories**: 6.1, 6.2, 6.3, 6.4
**Dependencies**: Unit 1 (models), Unit 2 (analytics-repo, task-repo, schedule-repo, config-repo)
**Code location**: `src/analytics/`
**Pattern**: Pure computation, synchronous, read-only — no replan triggers

## Design Steps

- [x] Step 1: Define business logic for **productivity calculator** (Story 6.1)
  - Period-to-date-range mapping (day/week/month → start/end ISO strings)
  - Completion rate formula: resolved tasks only (Q1: B)
  - On-time rate formula: tasks completed before deadline / tasks with deadlines completed
  - Edge case: zero tasks in period

- [x] Step 2: Define business logic for **schedule health scorer** (Story 6.2)
  - Health score: weighted deduction model (Q2: A)
  - Utilization percentage: scheduled hours / available hours for current week
  - Busiest/lightest day: by scheduled minutes per day
  - Free hours: available hours minus scheduled hours

- [x] Step 3: Define business logic for **estimation accuracy analyzer** (Story 6.3)
  - Accuracy: deviation-based, 0-100 bounded (Q4: B)
  - Over/under estimate classification: actual < estimated = overestimate, actual > estimated = underestimate
  - Per-category accuracy breakdown
  - Edge case: no completed tasks with actual duration → null

- [x] Step 4: Define business logic for **time allocation calculator** (Story 6.4)
  - Category grouping from completed tasks
  - Hours and percentage calculation
  - Sorting by hours descending
  - Null category → "uncategorized"

- [x] Step 5: Define **AnalyticsEngine orchestrator** interface
  - Constructor dependencies (4 repositories)
  - Delegation to stored calculator instances
  - Period validation for invalid periods

- [x] Step 6: Define **domain entities** and internal types
  - DateRange helper type
  - Period resolution logic (current calendar period, Q3: A)

- [x] Step 7: Define **business rules** catalog
  - Validation rules (VR-1, VR-2), computation rules (CR-1 through CR-8), edge case rules (EC-1 through EC-7), data flow rules (DF-1 through DF-3), precision rules (PR-1 through PR-4)

## Clarification Questions

### Q1: Completion rate denominator
What should the denominator be for completion rate?

- **A) All tasks in period** (completed + overdue + cancelled + pending) — gives a broader view including tasks still in progress
- **B) Resolved tasks only** (completed + overdue + cancelled) — ignores tasks still pending, focuses on outcomes
- **C) All tasks that existed during the period** — includes tasks created before the period but still active

[Answer]: B

### Q2: Health score formula weighting
How should the health score (0-100) be composed?

- **A) Weighted components**: utilization penalty + overdue penalty + at-risk penalty (e.g., start at 100, deduct for problems)
- **B) Balanced scorecard**: equal weight across utilization, overdue count, at-risk count, free time balance
- **C) Simple threshold**: healthy=80+, warning=50-79, unhealthy=<50, based on primary indicator (overdue count)

[Answer]: A

### Q3: Period boundary definition
How should "day", "week", and "month" periods resolve to date ranges?

- **A) Current period**: "day" = today, "week" = current Mon-Sun, "month" = current calendar month
- **B) Rolling window**: "day" = last 24 hours, "week" = last 7 days, "month" = last 30 days
- **C) Configurable**: support both current-period and rolling-window via parameter

[Answer]: A

### Q4: Estimation accuracy — what counts as "accurate"?
When calculating average accuracy percentage, should it be bounded?

- **A) Raw ratio**: `(actual / estimated) * 100` — can exceed 100% (took longer) or be below 100% (faster)
- **B) Deviation-based**: `100 - |actual - estimated| / estimated * 100` — 100% = perfect, lower = worse
- **C) Capped ratio**: Same as A but note that values over 100% indicate underestimation

[Answer]: B

