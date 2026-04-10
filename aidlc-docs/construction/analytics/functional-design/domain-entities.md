# Domain Entities — Unit 4: Analytics

## Overview

Unit 4 is a **pure computation layer** — it does not define new persistent entities. It consumes data from existing repositories (Units 1-2) and returns computed result types (already defined in `src/models/analytics.ts`).

This document catalogs the types consumed, the types returned, and any internal helper types needed by the calculators.

---

## 1. Existing Types Consumed (from Unit 1: Models)

### From `src/models/analytics.ts` (return types)

| Type | Purpose | Used By |
|------|---------|---------|
| `ProductivityStats` | Completion/on-time rates by period | ProductivityCalculator |
| `ScheduleHealth` | Health score, utilization, busiest/lightest day | HealthCalculator |
| `EstimationAccuracy` | Accuracy %, over/underestimate counts | EstimationCalculator |
| `TimeAllocation` | Per-category hours and percentages | AllocationCalculator |
| `CategoryAllocation` | Single category entry in allocation | AllocationCalculator |
| `CompletedTaskRecord` | Task completion data from repository | ProductivityCalculator |
| `DurationRecord` | Estimated vs actual minutes | EstimationCalculator |
| `CategorySummary` | Category aggregate from repository | AllocationCalculator |

### From `src/models/task.ts`

| Type | Purpose | Used By |
|------|---------|---------|
| `Task` | Full task entity (for overdue/at-risk queries) | HealthCalculator |

### From `src/models/schedule.ts`

| Type | Purpose | Used By |
|------|---------|---------|
| `TimeBlock` | Scheduled time blocks for utilization | HealthCalculator |

### From `src/models/config.ts`

| Type | Purpose | Used By |
|------|---------|---------|
| `UserConfig` | Full config (availability, focus time, preferences) | HealthCalculator |
| `Availability` | Weekly availability windows | HealthCalculator |
| `DayAvailability` | Per-day availability window | HealthCalculator |

### From `src/models/errors.ts`

| Type | Purpose | Used By |
|------|---------|---------|
| `ValidationError` | Invalid period parameter | AnalyticsEngine |

---

## 2. Internal Helper Types (new, not persisted)

### DateRange

```typescript
interface DateRange {
  start: string;  // ISO 8601 UTC
  end: string;    // ISO 8601 UTC (exclusive)
}
```

- Used by: `resolvePeriod()` return type
- Purpose: Encapsulate the half-open `[start, end)` range for period queries
- Location: Defined locally in the analytics module (not exported to models)

### Period (type alias)

```typescript
type Period = "day" | "week" | "month";
```

- Already used in `ProductivityStats` and `TimeAllocation` model types
- Can be extracted as a shared type alias for reuse across calculators
- Location: Can live alongside `DateRange` or re-exported from models

---

## 3. Component Structure

```
src/analytics/
  analytics-engine.ts       # Orchestrator — public API
  productivity.ts           # ProductivityCalculator
  health.ts                 # HealthCalculator
  estimation.ts             # EstimationCalculator
  allocation.ts             # AllocationCalculator
```

### Component Dependency Graph

```
AnalyticsEngine
  |
  +-- ProductivityCalculator --> AnalyticsRepository
  |
  +-- HealthCalculator -------> AnalyticsRepository
  |                              TaskRepository
  |                              ScheduleRepository
  |                              ConfigRepository
  |
  +-- EstimationCalculator ---> AnalyticsRepository
  |
  +-- AllocationCalculator ---> AnalyticsRepository
```

### Constructor Signatures

```
ProductivityCalculator(analyticsRepo: AnalyticsRepository)

HealthCalculator(
  analyticsRepo: AnalyticsRepository,
  taskRepo: TaskRepository,
  scheduleRepo: ScheduleRepository,
  configRepo: ConfigRepository
)

EstimationCalculator(analyticsRepo: AnalyticsRepository)

AllocationCalculator(analyticsRepo: AnalyticsRepository)

AnalyticsEngine(
  analyticsRepo: AnalyticsRepository,
  taskRepo: TaskRepository,
  scheduleRepo: ScheduleRepository,
  configRepo: ConfigRepository
)
```

---

## 4. Method Signatures

### AnalyticsEngine (public API)

```
getProductivityStats(period: Period): ProductivityStats
getScheduleHealth(): ScheduleHealth
getEstimationAccuracy(period: Period): EstimationAccuracy
getTimeAllocation(period: Period): TimeAllocation
```

### Individual Calculators (internal)

```
ProductivityCalculator.compute(period: Period): ProductivityStats
HealthCalculator.compute(): ScheduleHealth
EstimationCalculator.compute(period: Period): EstimationAccuracy
AllocationCalculator.compute(period: Period): TimeAllocation
```

---

## 5. No New Persistent Entities

Unit 4 introduces **zero new database tables or stored entities**. All data is:
- **Read** from existing tables via Unit 2 repositories
- **Computed** in memory by the calculators
- **Returned** as the model types defined in Unit 1

This aligns with the read-only, no-side-effect design pattern for analytics (Business Rule DF-1).
