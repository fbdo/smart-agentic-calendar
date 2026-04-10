# Business Rules — Unit 4: Analytics

## Design Decisions Applied

| Decision | Choice |
|----------|--------|
| Completion rate denominator | Resolved tasks only (Q1: B) |
| Health score formula | Weighted deduction (Q2: A) |
| Period boundaries | Current calendar period (Q3: A) |
| Estimation accuracy | Deviation-based, 0-100 (Q4: B) |

---

## 1. Validation Rules

### VR-1: Period Parameter Validation
- **Rule**: Period must be one of: "day", "week", "month"
- **Applies to**: `getProductivityStats`, `getEstimationAccuracy`, `getTimeAllocation`
- **Error**: `ValidationError("invalid period: must be day, week, or month")`
- **Does NOT apply to**: `getScheduleHealth` (no period parameter — always uses current week)

### VR-2: Reference Date
- **Rule**: All period resolution uses UTC dates
- **Default**: Current system time in UTC
- **Rationale**: Consistent boundaries regardless of timezone configuration

---

## 2. Computation Rules

### CR-1: Completion Rate Denominator
- **Rule**: Denominator = completed + overdue + cancelled (resolved tasks only)
- **Excludes**: Pending, scheduled, in_progress, at_risk tasks
- **Rationale**: Measures outcomes, not work-in-progress. Meaningful at any point in the period.

### CR-2: On-Time Rate Denominator
- **Rule**: Denominator = completed tasks that had a deadline set
- **Excludes**: Completed tasks without a deadline (cannot be "on time" or "late" without a deadline)
- **Rationale**: Only measures deadline adherence for tasks where a deadline existed

### CR-3: Health Score Deduction Weights
- **Rule**: `score = clamp(100 - overdueCount×15 - atRiskCount×10 - utilizationPenalty, 0, 100)`
- **Overdue weight (15)**: Highest — missed commitments are the most urgent signal
- **At-risk weight (10)**: Early warnings, not yet failed
- **Utilization penalty**: Linear above 90% (×2 per point), mild below 20% (×1 per point)
- **Neutral zone**: 20-90% utilization incurs no penalty

### CR-4: Estimation Accuracy Formula
- **Rule**: `perTaskAccuracy = max(0, 100 - |actual - estimated| / estimated × 100)`
- **Range**: 0-100 where 100% = perfect
- **Symmetric**: Equal magnitude errors in either direction produce the same score
- **Floor**: Clamped at 0 when deviation exceeds 100% of the estimate

### CR-5: Overestimate vs Underestimate Classification
- **Rule**: `actual < estimated` = overestimate, `actual > estimated` = underestimate, `actual == estimated` = neither (exact)
- **Average error**: Expressed as positive minutes (magnitude only)

### CR-6: Category Null Handling
- **Rule**: Tasks with null/empty category are grouped as "uncategorized"
- **Applies to**: Time allocation and per-category estimation accuracy
- **Handled by**: Repository layer (already implemented in `AnalyticsRepository.getTasksByCategory`)

### CR-7: Utilization Calculation Scope
- **Rule**: Utilization is always calculated for the current week (Mon-Sun)
- **Numerator**: Sum of scheduled time block durations
- **Denominator**: Sum of availability window durations across the week
- **Range**: 0-100+ (can exceed 100% if overscheduled beyond availability)

### CR-8: Busiest/Lightest Day Selection
- **Rule**: Determined by total scheduled minutes per day
- **Tie-breaking**: Earlier day in the week wins
- **Only considers**: Days with availability > 0 (for lightest day)
- **Null case**: Both null if no availability is configured

---

## 3. Edge Case Rules

### EC-1: Zero Resolved Tasks in Period
- **Rule**: `completionRate = 0`, `onTimeRate = 0`
- **All counts**: Return 0
- **Rationale**: Empty period returns zeroed metrics, never an error (Story 6.1 acceptance criteria)

### EC-2: No Completed Tasks with Duration Data
- **Rule**: `averageAccuracyPercentage = null`, `accuracyByCategory = null`
- **Counts**: `overestimateCount = 0`, `underestimateCount = 0`
- **Average errors**: `averageOverestimateMinutes = null`, `averageUnderestimateMinutes = null`
- **Rationale**: "Insufficient data" — null signals absence of data, not zero accuracy (Story 6.3 acceptance criteria)

### EC-3: Zero Available Minutes (Health)
- **Rule**: `utilizationPercentage = 0`, `freeHoursThisWeek = 0`
- **Health score**: No utilization penalty applied (neutral)
- **Rationale**: If no availability is configured, utilization metrics are meaningless

### EC-4: No Time Blocks Scheduled (Health)
- **Rule**: `utilizationPercentage = 0`, `freeHoursThisWeek = totalAvailableMinutes / 60`
- **Busiest/lightest**: Both null (no scheduled activity to compare)
- **Health score**: May receive mild under-utilization penalty if availability exists

### EC-5: Zero Total Minutes (Allocation)
- **Rule**: All categories get `percentage = 0`, `hours = 0`
- **Categories array**: Empty array (not an error)
- **Rationale**: No completed work in period — valid empty result

### EC-6: Estimated Duration is Zero
- **Rule**: `perTaskAccuracy = 0`
- **Rationale**: Division by zero guard — a zero-minute estimate is inherently inaccurate

### EC-7: Overscheduled Week
- **Rule**: `utilizationPercentage` can exceed 100%
- **freeHoursThisWeek**: Clamped to 0 (not negative)
- **Health score**: Receives maximum utilization penalty (utilization > 90%)

---

## 4. Data Flow Rules

### DF-1: Read-Only Pattern
- **Rule**: All analytics operations are read-only — no mutations to tasks, events, or schedule
- **No replan triggers**: Analytics never causes a background replan
- **Rationale**: Analytics observes state, does not change it

### DF-2: Repository Dependency Map

| Calculator | Repositories Used |
|------------|-------------------|
| ProductivityCalculator | AnalyticsRepository |
| HealthCalculator | AnalyticsRepository, TaskRepository, ScheduleRepository, ConfigRepository |
| EstimationCalculator | AnalyticsRepository |
| AllocationCalculator | AnalyticsRepository |

### DF-3: Period Resolution is Shared
- **Rule**: All period-aware calculators use the same `resolvePeriod` function
- **Location**: Shared utility, not duplicated per calculator
- **Ensures**: Consistent date ranges across all analytics methods

---

## 5. Precision Rules

### PR-1: Percentage Fields
- **Rule**: All percentage values rounded to 2 decimal places
- **Applies to**: `completionRate`, `onTimeRate`, `utilizationPercentage`, `percentage` (allocation), `averageAccuracyPercentage`, category accuracy values

### PR-2: Hours Fields
- **Rule**: Hours rounded to 1 decimal place for health, 2 decimal places for allocation
- **Applies to**: `freeHoursThisWeek` (1dp), `hours` in CategoryAllocation (2dp)

### PR-3: Minutes Fields
- **Rule**: Minutes rounded to 1 decimal place
- **Applies to**: `averageOverestimateMinutes`, `averageUnderestimateMinutes`

### PR-4: Health Score
- **Rule**: Integer (no decimal places)
- **Applies to**: `healthScore` — rounded to nearest integer after clamping
