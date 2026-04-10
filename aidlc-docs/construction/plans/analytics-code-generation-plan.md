# Code Generation Plan — Unit 4: Analytics

## Unit Context

**Unit**: Analytics (4 calculators + 1 orchestrator: AnalyticsEngine, ProductivityCalculator, HealthCalculator, EstimationCalculator, AllocationCalculator)
**Stories**: 6.1, 6.2, 6.3, 6.4
**Dependencies**: Unit 1 (models, common), Unit 2 (analytics-repo, task-repo, schedule-repo, config-repo)
**Code location**: `src/analytics/`
**Test location**: `tests/unit/analytics/`
**Project type**: Greenfield, single monolith

## Design References

- Business logic model: `aidlc-docs/construction/analytics/functional-design/business-logic-model.md`
- Business rules: `aidlc-docs/construction/analytics/functional-design/business-rules.md`
- Domain entities: `aidlc-docs/construction/analytics/functional-design/domain-entities.md`
- Component methods: `aidlc-docs/inception/application-design/component-methods.md`

## TDD Approach

All production code follows red-green-refactor:
1. Write a failing test (red)
2. Write minimal code to pass (green)
3. Refactor for simplicity

Analytics calculators are pure computation — tests use mocked/stubbed repositories (injected via constructor). No PBT for this unit (analytics is straightforward arithmetic; PBT value captured in Unit 3's scheduling algorithms).

## External Dependencies

None — Unit 4 uses only internal models and repositories from Units 1-2.

---

## Generation Steps

### Step 1: Period resolution utility + barrel export
- [x] Create `src/analytics/period.ts` with:
  - `Period` type alias: `"day" | "week" | "month"`
  - `DateRange` interface: `{ start: string; end: string }`
  - `resolvePeriod(period: Period, referenceDate?: Date): DateRange` — current calendar period resolution
  - `validatePeriod(period: string): asserts period is Period` — throws ValidationError for invalid values
- [x] Write tests in `tests/unit/analytics/period.test.ts`:
  - resolvePeriod "day": returns today 00:00Z to tomorrow 00:00Z
  - resolvePeriod "week": returns current Monday 00:00Z to next Monday 00:00Z
  - resolvePeriod "month": returns 1st of month 00:00Z to 1st of next month 00:00Z
  - resolvePeriod with custom referenceDate
  - resolvePeriod "week" when referenceDate is Monday (start = same day)
  - resolvePeriod "month" for December (end = January next year)
  - validatePeriod valid values pass
  - validatePeriod invalid value throws ValidationError
- [x] Create `src/analytics/index.ts` barrel export
- [x] Verify all tests pass — 13 tests

### Step 2: ProductivityCalculator (TDD) — Story 6.1 ✅ (7 tests)
- [x] Write tests in `tests/unit/analytics/productivity.test.ts`:
  - Happy path: 5 completed, 2 overdue, 1 cancelled → completionRate = 62.5%, counts correct
  - On-time rate: 3 completed with deadline (2 on time, 1 late), 2 completed without deadline → onTimeRate = 66.67%
  - Zero resolved tasks: all metrics return 0 (EC-1)
  - All tasks on time: onTimeRate = 100%
  - No tasks with deadline: onTimeRate = 0 (no deadline-bearing completed tasks)
  - Period parameter passed correctly to repository
  - Overdue tasks filtered to period range (deadline within [start, end))
- [x] Implement `src/analytics/productivity.ts`:
  - `ProductivityCalculator` class with constructor(analyticsRepo: AnalyticsRepository)
  - `compute(period: Period): ProductivityStats` method
  - Uses resolvePeriod, delegates to analyticsRepo.getCompletedTasks, getOverdueTasks, getCancelledTasks
  - Completion rate: resolved tasks denominator (CR-1)
  - On-time rate: deadline-bearing completed tasks denominator (CR-2)
  - Percentages rounded to 2 decimal places (PR-1)
- [x] Update barrel export
- [x] Verify all tests pass

### Step 3: HealthCalculator (TDD) — Story 6.2 ✅ (16 tests)
- [x] Write tests in `tests/unit/analytics/health.test.ts`:
  - Healthy schedule: 60% utilization, 0 overdue, 0 at-risk → healthScore 80+ (acceptance criteria)
  - Overloaded schedule: 95% utilization, 3 at-risk → healthScore <50 (acceptance criteria)
  - Utilization: scheduled 240min / available 480min = 50%
  - Free hours: (480 - 240) / 60 = 4.0
  - Busiest/lightest day: day with max/min scheduled minutes
  - Busiest/lightest tie-breaking: earlier day wins
  - Overdue penalty: 2 overdue → score deducted by 30
  - At-risk penalty: 1 at-risk → score deducted by 10
  - Utilization penalty above 90%: 95% → deduct (95-90)×2 = 10
  - Utilization penalty below 20%: 10% → deduct (20-10)×1 = 10
  - Neutral zone (20-90%): no utilization penalty
  - Score floor: many penalties → clamped at 0 (not negative)
  - Zero available minutes: utilization = 0, freeHours = 0, no utilization penalty (EC-3)
  - No time blocks: utilization = 0, busiest/lightest = null (EC-4)
  - Overscheduled: utilization > 100%, freeHours clamped to 0 (EC-7)
  - Only days with availability > 0 considered for lightest day (CR-8)
- [x] Implement `src/analytics/health.ts`:
  - `HealthCalculator` class with constructor(analyticsRepo, taskRepo, scheduleRepo, configRepo)
  - `compute(): ScheduleHealth` method
  - Always uses current week (resolvePeriod("week"))
  - Computes per-day scheduled minutes and available minutes
  - Weighted deduction formula (CR-3): 100 - overdue×15 - atRisk×10 - utilizationPenalty
  - Health score as integer (PR-4), utilization 2dp (PR-1), freeHours 1dp (PR-2)
- [x] Update barrel export
- [x] Verify all tests pass

### Step 4: EstimationCalculator (TDD) — Story 6.3 ✅ (12 tests)
- [x] Write tests in `tests/unit/analytics/estimation.test.ts`:
  - Perfect estimates: all actual == estimated → averageAccuracy = 100%
  - Mixed: estimated 60/actual 90 → perTask = max(0, 100-50) = 50%, estimated 60/actual 60 → 100% → average 75%
  - All overestimates: actual < estimated → overestimateCount correct, averageOverestimateMinutes correct
  - All underestimates: actual > estimated → underestimateCount correct, averageUnderestimateMinutes correct
  - Mixed over/under: correct classification and separate averages
  - Extreme deviation: estimated 10, actual 120 → perTask = max(0, 100 - 1100) = 0% (floor clamp)
  - Zero estimated duration: perTaskAccuracy = 0 (EC-6)
  - No records: averageAccuracyPercentage = null, counts = 0, averages = null, accuracyByCategory = null (EC-2)
  - Per-category accuracy: two categories, each with different accuracy
  - Null category grouped as "uncategorized" (CR-6)
  - Percentages rounded to 2dp (PR-1), minutes to 1dp (PR-3)
- [x] Implement `src/analytics/estimation.ts`:
  - `EstimationCalculator` class with constructor(analyticsRepo: AnalyticsRepository)
  - `compute(period: Period): EstimationAccuracy` method
  - Deviation-based formula: max(0, 100 - |actual-estimated|/estimated × 100) (CR-4)
  - Over/underestimate classification (CR-5)
  - Per-category grouping with accuracy averages
- [x] Update barrel export
- [x] Verify all tests pass

### Step 5: AllocationCalculator (TDD) — Story 6.4 ✅ (6 tests)
- [x] Write tests in `tests/unit/analytics/allocation.test.ts`:
  - Three categories: work 120min, personal 60min, admin 30min → hours and percentages correct, sorted by hours desc
  - Single category: 100% allocation
  - No categories (all uncategorized): single "uncategorized" entry
  - Zero total minutes: empty categories array (EC-5)
  - Period parameter passed correctly
  - Hours rounded to 2dp, percentages to 2dp (PR-1, PR-2)
- [x] Implement `src/analytics/allocation.ts`:
  - `AllocationCalculator` class with constructor(analyticsRepo: AnalyticsRepository)
  - `compute(period: Period): TimeAllocation` method
  - Delegates to analyticsRepo.getTasksByCategory
  - Computes hours and percentage per category
  - Sorts by hours descending
- [x] Update barrel export
- [x] Verify all tests pass

### Step 6: AnalyticsEngine orchestrator (TDD) — Stories 6.1-6.4 ✅ (8 tests)
- [x] Write tests in `tests/unit/analytics/analytics-engine.test.ts`:
  - getProductivityStats delegates to ProductivityCalculator.compute with correct period
  - getScheduleHealth delegates to HealthCalculator.compute (no period param)
  - getEstimationAccuracy delegates to EstimationCalculator.compute with correct period
  - getTimeAllocation delegates to AllocationCalculator.compute with correct period
  - Invalid period throws ValidationError for getProductivityStats, getEstimationAccuracy, getTimeAllocation
  - getScheduleHealth does not validate period (no period param)
- [x] Implement `src/analytics/analytics-engine.ts`:
  - `AnalyticsEngine` class with constructor(analyticsRepo, taskRepo, scheduleRepo, configRepo)
  - Creates calculator instances in constructor (stored, not inline)
  - Four public methods delegating to calculators
  - Period validation before delegation (VR-1)
- [x] Update barrel export with AnalyticsEngine as primary export
- [x] Verify all tests pass — 62 tests total across 6 files, 413 full suite

### Step 7: Code summary documentation
- [x] Create `aidlc-docs/construction/analytics/code/code-summary.md`:
  - List all source files created with paths and line counts
  - List all test files created with paths and test counts
  - Story coverage mapping (6.1→productivity, 6.2→health, 6.3→estimation, 6.4→allocation)
  - Total test count summary

---

## Story Traceability

| Step | Stories | Components |
|------|---------|------------|
| Step 1 | (shared utility) | period.ts |
| Step 2 | 6.1 | ProductivityCalculator |
| Step 3 | 6.2 | HealthCalculator |
| Step 4 | 6.3 | EstimationCalculator |
| Step 5 | 6.4 | AllocationCalculator |
| Step 6 | 6.1-6.4 | AnalyticsEngine |
| Step 7 | (documentation) | code-summary.md |

## Estimated Scope

- **Source files**: 6 (period.ts, productivity.ts, health.ts, estimation.ts, allocation.ts, analytics-engine.ts) + 1 barrel export (index.ts)
- **Test files**: 6 (period, productivity, health, estimation, allocation, analytics-engine)
- **Total steps**: 7
