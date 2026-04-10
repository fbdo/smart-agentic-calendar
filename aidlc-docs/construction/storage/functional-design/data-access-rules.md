# Data Access Rules — Unit 2: Storage

## Row Mapping Rules

### Type Conversions (SQLite ↔ TypeScript)

| SQLite Type | TypeScript Type | Read Conversion | Write Conversion |
|---|---|---|---|
| INTEGER (0/1) | boolean | `!!row.column` | `value ? 1 : 0` |
| TEXT (JSON) | string[] | `JSON.parse(row.column)` | `JSON.stringify(value)` |
| TEXT (JSON) | object | `JSON.parse(row.column)` | `JSON.stringify(value)` |
| TEXT | string | direct | direct |
| TEXT \| NULL | string \| null | direct (SQLite returns null) | direct (pass null) |
| INTEGER | number | direct | direct |
| INTEGER \| NULL | number \| null | direct | direct |

### Column Name Mapping (snake_case ↔ camelCase)

| SQLite Column | TypeScript Field | Repositories Using |
|---|---|---|
| start_time | startTime | Event, TimeBlock, Config (Availability, FocusTime) |
| end_time | endTime | Event, TimeBlock, Config (Availability, FocusTime) |
| is_all_day | isAllDay | Event |
| is_recurring | isRecurring | Task |
| recurrence_template_id | recurrenceTemplateId | Task |
| actual_duration | actualDuration | Task |
| created_at | createdAt | Task, Event, RecurrenceTemplate |
| updated_at | updatedAt | Task, Event |
| block_index | blockIndex | TimeBlock |
| total_blocks | totalBlocks | TimeBlock |
| task_id | taskId | TimeBlock, RecurrenceInstance, DependencyEdge |
| depends_on_id | dependsOnId | DependencyEdge |
| is_active | isActive | RecurrenceTemplate |
| task_data | taskData | RecurrenceTemplate |
| template_id | templateId | RecurrenceInstance, RecurrenceException |
| scheduled_date | scheduledDate | RecurrenceInstance |
| is_exception | isException | RecurrenceInstance |

### Special Mapping Cases

**Task.tags**: Stored as JSON text `'["tag1","tag2"]'` in SQLite. Parsed to `string[]` on read, stringified on write. Empty array stored as `'[]'`.

**RecurrenceTemplate.taskData**: Stored as JSON text containing task field subset. Parsed to `Omit<Task, ...>` on read, stringified on write.

**RecurrenceException.overrides**: Stored as JSON text or NULL. NULL for skip-type exceptions, JSON partial task object for modify-type. Parsed to `Partial<Task> | null` on read.

**ConfigPreferences values**: All stored as JSON-encoded text in the `value` column. Numbers stored as `'15'`, strings stored as `'"P3"'` (with JSON quotes). Parsed with `JSON.parse()` on read.

**AnalyticsRepository.getCompletedTasks.wasOnTime**: Computed in SQL as `CASE WHEN deadline IS NOT NULL AND updated_at <= deadline THEN 1 ELSE 0 END`. Mapped to boolean on read.

---

## Transaction Boundaries

### Single-Statement Operations (no explicit transaction needed)

better-sqlite3 auto-wraps each statement in an implicit transaction. These methods need no explicit `db.transaction()`:

- `TaskRepository`: findById, findAll, updateStatus (step 2 only), addDependency (step 2 only), removeDependency, getDependencies, getDependents, recordActualDuration
- `EventRepository`: create, findById, findInRange, delete
- `ScheduleRepository`: getSchedule, getScheduleStatus, setScheduleStatus, clearSchedule
- `AnalyticsRepository`: all methods (read-only)
- `RecurrenceRepository`: createTemplate, getTemplate, getActiveTemplates, deleteTemplate, createInstance, getInstances, addException, getExceptions

### Multi-Statement Operations (explicit transaction required)

These methods use `db.transaction(() => { ... })()` to ensure atomicity:

| Repository | Method | Statements in Transaction |
|---|---|---|
| TaskRepository | create | INSERT task (single, but wrapped for consistency with ID generation + return) |
| TaskRepository | update | SELECT (state check) + UPDATE |
| TaskRepository | delete | SELECT (state check) + UPDATE status + DELETE dependencies |
| TaskRepository | addDependency | SELECT (verify both exist) + INSERT |
| EventRepository | update | Dynamic UPDATE + SELECT (return updated row) |
| ConfigRepository | setAvailability | DELETE all + INSERT per window |
| ConfigRepository | setFocusTime | DELETE all blocks + INSERT per block + UPDATE preference |
| ConfigRepository | setPreferences | INSERT OR REPLACE per key |
| ScheduleRepository | saveSchedule | DELETE all + INSERT per block |

### Cross-Repository Transaction Support

Repositories do NOT accept transaction parameters. When the engine layer needs cross-repository atomicity, it wraps calls using the shared `Database` instance:

```typescript
// Engine layer example (Unit 3):
db.transaction(() => {
  taskRepo.updateStatus(taskId, "completed");
  taskRepo.recordActualDuration(taskId, actualMinutes);
})();
```

This works because better-sqlite3 supports nested transactions via savepoints. Each repository method's internal transaction becomes a savepoint within the outer transaction.

---

## Error Handling

### Error Types by Repository

#### TaskRepository

| Method | Error | Condition |
|---|---|---|
| create | ValidationError | Empty title, duration <= 0, invalid priority, invalid deadline format |
| update | NotFoundError | `changes === 0` after UPDATE |
| update | InvalidStateError | SELECT returns status = "completed" or "cancelled" |
| updateStatus | NotFoundError | SELECT returns no row |
| updateStatus | InvalidStateError | Transition not in valid transitions table |
| delete | NotFoundError | SELECT returns no row |
| delete | InvalidStateError | SELECT returns status = "completed" or "cancelled" |
| addDependency | NotFoundError | SELECT returns fewer than 2 rows (one or both tasks missing) |
| removeDependency | NotFoundError | `changes === 0` after DELETE |
| recordActualDuration | NotFoundError | `changes === 0` after UPDATE |

#### EventRepository

| Method | Error | Condition |
|---|---|---|
| create | ValidationError | Empty title, missing start/end for timed, missing date for all-day, endTime <= startTime |
| update | NotFoundError | `changes === 0` after UPDATE |
| delete | NotFoundError | `changes === 0` after DELETE |

#### ConfigRepository

| Method | Error | Condition |
|---|---|---|
| setAvailability | ValidationError | Invalid day (not 0-6), invalid HH:MM format, endTime <= startTime |
| setFocusTime | ValidationError | Invalid day, invalid HH:MM format, minimumBlockMinutes <= 0 |
| setPreferences | ValidationError | bufferTimeMinutes < 0, invalid priority, defaultDuration <= 0, schedulingHorizonWeeks not 1-12, minimumBlockMinutes not 15-120 |

#### ScheduleRepository

No errors thrown — all operations are internal (called by engine layer with validated data).

#### AnalyticsRepository

No errors thrown — all operations are read-only queries. Empty results return empty arrays.

#### RecurrenceRepository

| Method | Error | Condition |
|---|---|---|
| deleteTemplate | NotFoundError | `changes === 0` after UPDATE |

### Validation Responsibility

Repositories validate at the **data boundary** only:
- Field presence and type (non-empty title, positive duration)
- Format correctness (ISO 8601, HH:MM, valid enum values)
- Referential integrity (tasks exist before adding dependency)

Repositories do NOT validate:
- Business logic (cycle detection — handled by DependencyResolver in Unit 3)
- Cross-entity rules (focus time within availability — handled by engine layer)
- Scheduling constraints (deadlines, availability — handled by Scheduler in Unit 3)

---

## Return Value Conventions

### Create Methods

All `create()` methods return the fully hydrated entity, including generated `id`, `createdAt`, and `updatedAt`. This is achieved by either:
- Building the complete object before INSERT and returning it, or
- Performing a SELECT after INSERT within the same transaction

**Preferred approach**: Build the complete object in memory (generate ID, set timestamps), INSERT it, return the in-memory object. No need for a post-INSERT SELECT since we control all field values.

### Update Methods

All `update()` methods return the updated entity. After the UPDATE, perform a `findById()` to return the current state. This ensures the returned object reflects any default handling or computed fields.

### Delete Methods

All `delete()` methods return `void`. The caller already has the ID; no data needs to be returned.

### Query Methods

- Single-entity lookups (`findById`, `getTemplate`) return `T | undefined` — never throw on absence
- Collection queries (`findAll`, `findInRange`, `getInstances`) return `T[]` — empty array if no matches
- Config getters (`getAvailability`, `getPreferences`) return populated objects with defaults — never undefined

---

## Cross-References

- **Schema definitions**: `business-logic-model.md` (Unit 1 Foundation)
- **Entity types**: `domain-entities.md` (Unit 1 Foundation)
- **Validation rules**: `business-rules.md` (Unit 1 Foundation)
- **Method signatures source**: `component-methods.md` (Application Design)
- **Status transitions**: `business-rules.md` — Task Status Transitions table
