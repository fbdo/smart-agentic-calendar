# Domain Entities — Unit 1: Foundation

## Design Decisions Applied

| Decision | Choice |
|---|---|
| ID generation | UUID v4 (crypto.randomUUID()) |
| Date/time format | UTC ISO 8601 strings (TEXT in SQLite) |
| Energy model | None — focus time is the only energy proxy |
| Task splitting | Configurable minimum block (default 30 min) |

---

## Core Entities

### Task

```typescript
interface Task {
  id: string                    // UUID v4
  title: string                 // Required, non-empty
  description: string | null    // Optional
  duration: number              // Estimated duration in minutes, positive integer
  deadline: string | null       // ISO 8601 UTC, optional
  priority: TaskPriority        // P1-P4, default P3
  status: TaskStatus
  category: string | null       // Optional free-text category
  tags: string[]                // Optional tags (e.g., "deep-work")
  isRecurring: boolean          // True if this task is a recurrence instance
  recurrenceTemplateId: string | null  // Links instance to template
  actualDuration: number | null // Recorded on completion, in minutes
  createdAt: string             // ISO 8601 UTC
  updatedAt: string             // ISO 8601 UTC
}

type TaskPriority = "P1" | "P2" | "P3" | "P4"

type TaskStatus =
  | "pending"      // Created, not yet scheduled
  | "scheduled"    // Has assigned time block(s)
  | "completed"    // Marked done
  | "cancelled"    // Soft-deleted
  | "at_risk"      // Deadline infeasible given current constraints
```

### Event

```typescript
interface Event {
  id: string                    // UUID v4
  title: string                 // Required, non-empty
  startTime: string             // ISO 8601 UTC (for timed events)
  endTime: string               // ISO 8601 UTC (for timed events)
  isAllDay: boolean             // If true, blocks entire day
  date: string | null           // ISO 8601 date only (YYYY-MM-DD), for all-day events
  createdAt: string             // ISO 8601 UTC
  updatedAt: string             // ISO 8601 UTC
}
```

### TimeBlock

```typescript
interface TimeBlock {
  id: string                    // UUID v4
  taskId: string                // References Task.id
  startTime: string             // ISO 8601 UTC
  endTime: string               // ISO 8601 UTC
  date: string                  // ISO 8601 date (YYYY-MM-DD)
  blockIndex: number            // 0-based index when task is split (0 if not split)
  totalBlocks: number           // Total blocks for this task (1 if not split)
}
```

### ScheduleResult

```typescript
interface ScheduleResult {
  timeBlocks: TimeBlock[]       // All scheduled blocks
  conflicts: Conflict[]         // Detected conflicts
  atRiskTasks: AtRiskTask[]     // Tasks that couldn't be fully scheduled
}

type ScheduleStatus = "up_to_date" | "replan_in_progress"
```

### Conflict

```typescript
interface Conflict {
  taskId: string                // The at-risk task
  reason: ConflictReason
  deadline: string | null       // Task's deadline (ISO 8601)
  requiredMinutes: number       // Duration needed
  availableMinutes: number      // Time available before deadline
  competingTaskIds: string[]    // Tasks competing for the same time
  suggestions: DeprioritizationSuggestion[]
}

type ConflictReason =
  | "insufficient_time"         // Not enough time before deadline
  | "dependency_chain"          // Dependency chain exceeds available time
  | "overdue"                   // Deadline already passed

interface AtRiskTask {
  taskId: string
  reason: string                // Human-readable explanation
}

interface DeprioritizationSuggestion {
  taskId: string                // Task that could be deprioritized
  currentPriority: TaskPriority
  freedMinutes: number          // Minutes freed if this task is removed/postponed
}
```

### Availability

```typescript
interface Availability {
  windows: DayAvailability[]
}

interface DayAvailability {
  day: DayOfWeek                // 0=Sunday through 6=Saturday
  startTime: string             // HH:MM format (local time, e.g., "09:00")
  endTime: string               // HH:MM format (local time, e.g., "17:00")
}

type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6
```

### FocusTime

```typescript
interface FocusTime {
  blocks: FocusBlock[]
  minimumBlockMinutes: number   // Minimum focus block duration (default 60)
}

interface FocusBlock {
  day: DayOfWeek
  startTime: string             // HH:MM format
  endTime: string               // HH:MM format
}
```

### Preferences

```typescript
interface Preferences {
  bufferTimeMinutes: number     // Minutes between consecutive tasks (default 15)
  defaultPriority: TaskPriority // Default for new tasks (default P3)
  defaultDuration: number       // Default duration in minutes (default 60)
  schedulingHorizonWeeks: number // How far ahead to schedule (default 4)
  minimumBlockMinutes: number   // Minimum task split block size (default 30)
}

interface UserConfig {
  availability: Availability
  focusTime: FocusTime
  preferences: Preferences
}
```

### Recurrence

```typescript
interface RecurrenceTemplate {
  id: string                    // UUID v4
  taskData: Omit<Task, "id" | "createdAt" | "updatedAt" | "status" | "actualDuration" | "isRecurring" | "recurrenceTemplateId">
  rrule: string                 // RFC 5545 RRULE string
  isActive: boolean             // False when template is deleted
  createdAt: string             // ISO 8601 UTC
}

interface RecurrenceInstance {
  id: string                    // UUID v4
  templateId: string            // References RecurrenceTemplate.id
  taskId: string                // References the generated Task.id
  scheduledDate: string         // ISO 8601 date (YYYY-MM-DD)
  isException: boolean          // True if modified from template
}

interface RecurrenceException {
  templateId: string
  date: string                  // ISO 8601 date (YYYY-MM-DD)
  type: "skip" | "modify"
  overrides: Partial<Task> | null  // null for skip, partial task data for modify
}
```

### Dependency

```typescript
interface DependencyEdge {
  taskId: string                // The blocked task
  dependsOnId: string           // The blocking task
}
```

### Analytics Types

```typescript
interface ProductivityStats {
  period: "day" | "week" | "month"
  tasksCompleted: number
  tasksOverdue: number
  tasksCancelled: number
  completionRate: number        // Percentage (0-100)
  onTimeRate: number            // Percentage (0-100)
}

interface ScheduleHealth {
  healthScore: number           // 0-100
  utilizationPercentage: number // 0-100
  overdueCount: number
  atRiskCount: number
  freeHoursThisWeek: number
  busiestDay: string            // Day name or date
  lightestDay: string           // Day name or date
}

interface EstimationAccuracy {
  averageAccuracyPercentage: number | null
  overestimateCount: number
  underestimateCount: number
  averageOverestimateMinutes: number | null
  averageUnderestimateMinutes: number | null
  accuracyByCategory: Record<string, number> | null
}

interface TimeAllocation {
  period: "day" | "week" | "month"
  categories: CategoryAllocation[]
}

interface CategoryAllocation {
  category: string
  hours: number
  percentage: number            // 0-100
}

interface CompletedTaskRecord {
  taskId: string
  title: string
  category: string | null
  estimatedDuration: number
  actualDuration: number | null
  completedAt: string           // ISO 8601 UTC
  wasOnTime: boolean
}

interface DurationRecord {
  taskId: string
  category: string | null
  estimatedMinutes: number
  actualMinutes: number
}

interface CategorySummary {
  category: string
  totalMinutes: number
  taskCount: number
}
```
