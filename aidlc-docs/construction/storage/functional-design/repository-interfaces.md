# Repository Interfaces — Unit 2: Storage

## Design Decisions Applied

| Decision | Choice |
|---|---|
| Transaction strategy | Per-method transactions (engine layer wraps for cross-repo atomicity) |
| Row-to-model mapping | Inline mapping (private `rowToX()` / `xToRow()` per repository) |
| Filter query strategy | Dynamic SQL builder with parameterized queries (TaskRepository only) |
| Not found handling | Act-then-check (`changes === 0` → NotFoundError); SELECT-first only for state-dependent operations |

---

## TaskRepository

```typescript
class TaskRepository {
  constructor(db: Database)

  /**
   * Creates a new task. Generates ID, sets createdAt/updatedAt, applies defaults.
   * Wraps INSERT in a transaction.
   * @throws ValidationError if title is empty or duration <= 0
   */
  create(input: Omit<Task, "id" | "createdAt" | "updatedAt" | "status" | "actualDuration">): Task

  /**
   * Finds a task by ID.
   * @returns Task or undefined if not found
   */
  findById(id: string): Task | undefined

  /**
   * Finds tasks matching optional filters. Builds WHERE clause dynamically.
   * All filter fields are optional — no filters returns all tasks.
   * Results ordered by: priority ASC (P1 first), deadline ASC NULLS LAST, createdAt ASC.
   */
  findAll(filters?: TaskFilters): Task[]

  /**
   * Updates task fields. Only provided fields are updated; updatedAt always refreshed.
   * @throws NotFoundError if task doesn't exist (changes === 0)
   * @throws InvalidStateError if task is completed or cancelled
   */
  update(id: string, updates: Partial<Pick<Task, "title" | "description" | "duration" | "deadline" | "priority" | "category" | "tags">>): Task

  /**
   * Updates task status with transition validation.
   * SELECT-first to validate transition is legal per business rules.
   * @throws NotFoundError if task doesn't exist
   * @throws InvalidStateError if transition is invalid
   */
  updateStatus(id: string, status: TaskStatus): Task

  /**
   * Soft-deletes a task by setting status to "cancelled".
   * Also removes associated dependencies (both directions).
   * Wrapped in a transaction (multi-statement).
   * @throws NotFoundError if task doesn't exist (changes === 0)
   * @throws InvalidStateError if task is already completed or cancelled
   */
  delete(id: string): void

  /**
   * Adds a dependency: taskId depends on dependsOnId.
   * @throws NotFoundError if either task doesn't exist
   * @throws CircularDependencyError if adding would create a cycle (validated by caller — DependencyResolver)
   */
  addDependency(taskId: string, dependsOnId: string): void

  /**
   * Removes a dependency.
   * @throws NotFoundError if the dependency doesn't exist (changes === 0)
   */
  removeDependency(taskId: string, dependsOnId: string): void

  /**
   * Returns tasks that this task depends on (blocking tasks).
   */
  getDependencies(taskId: string): Task[]

  /**
   * Returns tasks that depend on this task (downstream tasks).
   */
  getDependents(taskId: string): Task[]

  /**
   * Records actual duration on a completed task.
   * @throws NotFoundError if task doesn't exist
   */
  recordActualDuration(id: string, actualMinutes: number): void

  // --- Private helpers ---
  private rowToTask(row: TaskRow): Task
  private taskToRow(task: Omit<Task, "id" | "createdAt" | "updatedAt">): TaskRow
}

interface TaskFilters {
  status?: TaskStatus
  priority?: TaskPriority
  deadlineBefore?: string    // ISO 8601 — tasks with deadline before this date
  deadlineAfter?: string     // ISO 8601 — tasks with deadline after this date
  category?: string
}
```

---

## EventRepository

```typescript
class EventRepository {
  constructor(db: Database)

  /**
   * Creates a new event. Generates ID, sets createdAt/updatedAt.
   * @throws ValidationError if title is empty, or timed event missing start/end,
   *         or all-day event missing date, or endTime <= startTime
   */
  create(input: Omit<Event, "id" | "createdAt" | "updatedAt">): Event

  /**
   * Finds an event by ID.
   * @returns Event or undefined if not found
   */
  findById(id: string): Event | undefined

  /**
   * Finds events overlapping a date range.
   * Includes timed events where (start_time < rangeEnd AND end_time > rangeStart)
   * and all-day events where (date >= rangeStartDate AND date <= rangeEndDate).
   */
  findInRange(start: string, end: string): Event[]

  /**
   * Updates event fields. Only provided fields are updated; updatedAt always refreshed.
   * @throws NotFoundError if event doesn't exist (changes === 0)
   */
  update(id: string, updates: Partial<Pick<Event, "title" | "startTime" | "endTime" | "isAllDay" | "date">>): Event

  /**
   * Permanently deletes an event.
   * @throws NotFoundError if event doesn't exist (changes === 0)
   */
  delete(id: string): void

  // --- Private helpers ---
  private rowToEvent(row: EventRow): Event
}
```

---

## ConfigRepository

```typescript
class ConfigRepository {
  constructor(db: Database)

  /**
   * Returns current availability windows.
   * If no windows configured, returns empty windows array.
   */
  getAvailability(): Availability

  /**
   * Replaces all availability windows.
   * Wrapped in a transaction: DELETE all, then INSERT new rows.
   * @throws ValidationError if any window has invalid day, time format, or endTime <= startTime
   */
  setAvailability(availability: Availability): void

  /**
   * Returns current focus time configuration.
   * If no blocks configured, returns empty blocks array with default minimumBlockMinutes.
   */
  getFocusTime(): FocusTime

  /**
   * Replaces all focus time blocks and minimum block setting.
   * Wrapped in a transaction: DELETE all blocks, INSERT new blocks, UPDATE preference.
   * @throws ValidationError if any block has invalid day or time format
   */
  setFocusTime(focusTime: FocusTime): void

  /**
   * Returns current preferences. Reads from config_preferences key-value table.
   * Returns defaults for any missing keys.
   */
  getPreferences(): Preferences

  /**
   * Updates preferences. Only provided fields are updated (partial merge).
   * Uses INSERT OR REPLACE for each provided key.
   * @throws ValidationError if any value is out of range (see business-rules.md)
   */
  setPreferences(preferences: Partial<Preferences>): void

  /**
   * Returns complete user configuration (availability + focus time + preferences).
   * Convenience method that calls the three getters.
   */
  getFullConfig(): UserConfig

  // --- Private helpers ---
  private rowToAvailabilityWindow(row: AvailabilityRow): DayAvailability
  private rowToFocusBlock(row: FocusBlockRow): FocusBlock
  private preferencesFromRows(rows: PreferenceRow[]): Preferences
}
```

---

## ScheduleRepository

```typescript
class ScheduleRepository {
  constructor(db: Database)

  /**
   * Replaces the entire schedule with new time blocks.
   * Wrapped in a transaction: DELETE all existing blocks, then INSERT new ones.
   */
  saveSchedule(timeBlocks: TimeBlock[]): void

  /**
   * Returns time blocks within a date range.
   * Filters by: start_time < rangeEnd AND end_time > rangeStart.
   * Ordered by start_time ASC.
   */
  getSchedule(start: string, end: string): TimeBlock[]

  /**
   * Returns current schedule status from the singleton row.
   */
  getScheduleStatus(): ScheduleStatus

  /**
   * Updates the schedule status singleton row.
   * Also updates last_replan_at when setting to "up_to_date".
   */
  setScheduleStatus(status: ScheduleStatus): void

  /**
   * Deletes all time blocks. Used before full replan.
   */
  clearSchedule(): void

  // --- Private helpers ---
  private rowToTimeBlock(row: TimeBlockRow): TimeBlock
}
```

---

## AnalyticsRepository

```typescript
class AnalyticsRepository {
  constructor(db: Database)

  /**
   * Returns completed tasks within a date range.
   * Joins tasks table, filters by status = 'completed' and updated_at within range.
   * (updated_at is the completion timestamp for completed tasks.)
   */
  getCompletedTasks(start: string, end: string): CompletedTaskRecord[]

  /**
   * Returns overdue tasks: deadline in the past, status not completed/cancelled.
   * Uses the provided reference time (typically nowUTC()) for comparison.
   */
  getOverdueTasks(referenceTime: string): Task[]

  /**
   * Returns cancelled tasks within a date range.
   * Filters by status = 'cancelled' and updated_at within range.
   */
  getCancelledTasks(start: string, end: string): Task[]

  /**
   * Returns task counts and total duration grouped by category within a date range.
   * Groups completed tasks by category.
   */
  getTasksByCategory(start: string, end: string): CategorySummary[]

  /**
   * Returns duration comparison records (estimated vs actual) within a date range.
   * Only includes tasks where both duration and actual_duration are set.
   */
  getDurationRecords(start: string, end: string): DurationRecord[]

  // --- Private helpers ---
  private rowToCompletedTaskRecord(row: CompletedTaskRow): CompletedTaskRecord
  private rowToDurationRecord(row: DurationRow): DurationRecord
  private rowToCategorySummary(row: CategoryRow): CategorySummary
}
```

---

## RecurrenceRepository

```typescript
class RecurrenceRepository {
  constructor(db: Database)

  /**
   * Creates a recurrence template. Generates ID, sets createdAt, isActive = true.
   * task_data stored as JSON string.
   */
  createTemplate(input: Omit<RecurrenceTemplate, "id" | "createdAt" | "isActive">): RecurrenceTemplate

  /**
   * Finds a template by ID.
   * @returns RecurrenceTemplate or undefined if not found
   */
  getTemplate(id: string): RecurrenceTemplate | undefined

  /**
   * Returns all active (non-deleted) recurrence templates.
   */
  getActiveTemplates(): RecurrenceTemplate[]

  /**
   * Soft-deletes a template by setting is_active = 0.
   * @throws NotFoundError if template doesn't exist (changes === 0)
   */
  deleteTemplate(id: string): void

  /**
   * Creates a recurrence instance linking a template to a generated task.
   * Generates ID.
   */
  createInstance(input: Omit<RecurrenceInstance, "id">): RecurrenceInstance

  /**
   * Returns instances for a template within a date range.
   * Ordered by scheduled_date ASC.
   */
  getInstances(templateId: string, start: string, end: string): RecurrenceInstance[]

  /**
   * Adds a recurrence exception (skip or modify) for a specific date.
   * Uses INSERT OR REPLACE — overwrites any existing exception for the same template+date.
   * overrides stored as JSON string (null for skip type).
   */
  addException(templateId: string, date: string, exception: Omit<RecurrenceException, "templateId" | "date">): void

  /**
   * Returns all exceptions for a template.
   */
  getExceptions(templateId: string): RecurrenceException[]

  // --- Private helpers ---
  private rowToTemplate(row: TemplateRow): RecurrenceTemplate
  private rowToInstance(row: InstanceRow): RecurrenceInstance
  private rowToException(row: ExceptionRow): RecurrenceException
}
```

---

## Cross-References

- **Model types consumed**: All interfaces from `src/models/` (Unit 1)
- **Database dependency**: `Database` class from `src/storage/database.ts` (Unit 1)
- **Error types used**: `NotFoundError`, `InvalidStateError`, `ValidationError` from `src/models/errors.ts`
- **Method signatures source**: `component-methods.md` (Application Design)
- **Consumers**: Unit 3 (Engine), Unit 4 (Analytics), Unit 5 (MCP Server)
