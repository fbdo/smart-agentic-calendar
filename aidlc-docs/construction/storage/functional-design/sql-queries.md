# SQL Query Catalog — Unit 2: Storage

All queries use parameterized placeholders (`?`). No string interpolation of values.

---

## TaskRepository

### create

```sql
INSERT INTO tasks (id, title, description, duration, deadline, priority, status, category, tags, is_recurring, recurrence_template_id, actual_duration, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, NULL, ?, ?)
```

### findById

```sql
SELECT * FROM tasks WHERE id = ?
```

### findAll (dynamic WHERE)

Base query:
```sql
SELECT * FROM tasks
```

Dynamic WHERE clauses (appended with `AND`):
```sql
-- if filters.status provided:
status = ?

-- if filters.priority provided:
priority = ?

-- if filters.deadlineBefore provided:
deadline IS NOT NULL AND deadline < ?

-- if filters.deadlineAfter provided:
deadline IS NOT NULL AND deadline > ?

-- if filters.category provided:
category = ?
```

ORDER BY (always appended):
```sql
ORDER BY
  CASE priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 WHEN 'P4' THEN 4 END ASC,
  CASE WHEN deadline IS NULL THEN 1 ELSE 0 END ASC,
  deadline ASC,
  created_at ASC
```

### update

Built dynamically — only SET clauses for provided fields:
```sql
UPDATE tasks SET
  title = ?,          -- if provided
  description = ?,    -- if provided
  duration = ?,       -- if provided
  deadline = ?,       -- if provided
  priority = ?,       -- if provided
  category = ?,       -- if provided
  tags = ?,           -- if provided
  updated_at = ?      -- always
WHERE id = ?
```

**Note**: Uses same dynamic builder approach as findAll. Only columns with provided values appear in SET.

### updateStatus

Step 1 — SELECT for state validation:
```sql
SELECT status FROM tasks WHERE id = ?
```

Step 2 — UPDATE:
```sql
UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?
```

### delete (soft-delete)

Step 1 — SELECT for state validation:
```sql
SELECT status FROM tasks WHERE id = ?
```

Step 2 — wrapped in transaction:
```sql
UPDATE tasks SET status = 'cancelled', updated_at = ? WHERE id = ?
```
```sql
DELETE FROM dependencies WHERE task_id = ? OR depends_on_id = ?
```

### addDependency

Step 1 — verify both tasks exist:
```sql
SELECT id FROM tasks WHERE id IN (?, ?)
```

Step 2 — insert:
```sql
INSERT INTO dependencies (task_id, depends_on_id) VALUES (?, ?)
```

### removeDependency

```sql
DELETE FROM dependencies WHERE task_id = ? AND depends_on_id = ?
```

### getDependencies

```sql
SELECT t.* FROM tasks t
  INNER JOIN dependencies d ON t.id = d.depends_on_id
  WHERE d.task_id = ?
```

### getDependents

```sql
SELECT t.* FROM tasks t
  INNER JOIN dependencies d ON t.id = d.task_id
  WHERE d.depends_on_id = ?
```

### recordActualDuration

```sql
UPDATE tasks SET actual_duration = ?, updated_at = ? WHERE id = ?
```

---

## EventRepository

### create

```sql
INSERT INTO events (id, title, start_time, end_time, is_all_day, date, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
```

### findById

```sql
SELECT * FROM events WHERE id = ?
```

### findInRange

```sql
SELECT * FROM events
WHERE
  (is_all_day = 0 AND start_time < ? AND end_time > ?)
  OR
  (is_all_day = 1 AND date >= ? AND date <= ?)
ORDER BY
  CASE WHEN is_all_day = 1 THEN date ELSE start_time END ASC
```

Parameters: `[rangeEnd, rangeStart, rangeStartDate, rangeEndDate]`

Where `rangeStartDate` and `rangeEndDate` are the YYYY-MM-DD portions of the range boundaries.

### update

Built dynamically — only SET clauses for provided fields:
```sql
UPDATE events SET
  title = ?,       -- if provided
  start_time = ?,  -- if provided
  end_time = ?,    -- if provided
  is_all_day = ?,  -- if provided
  date = ?,        -- if provided
  updated_at = ?   -- always
WHERE id = ?
```

### delete

```sql
DELETE FROM events WHERE id = ?
```

---

## ConfigRepository

### getAvailability

```sql
SELECT day, start_time, end_time FROM config_availability
ORDER BY day ASC, start_time ASC
```

### setAvailability (transaction)

```sql
DELETE FROM config_availability
```
```sql
INSERT INTO config_availability (day, start_time, end_time) VALUES (?, ?, ?)
```
(repeated for each window)

### getFocusTime

Blocks:
```sql
SELECT day, start_time, end_time FROM config_focus_time
ORDER BY day ASC, start_time ASC
```

Minimum block minutes:
```sql
SELECT value FROM config_preferences WHERE key = 'focus_time_minimum_block_minutes'
```

### setFocusTime (transaction)

```sql
DELETE FROM config_focus_time
```
```sql
INSERT INTO config_focus_time (day, start_time, end_time) VALUES (?, ?, ?)
```
(repeated for each block)
```sql
INSERT OR REPLACE INTO config_preferences (key, value) VALUES ('focus_time_minimum_block_minutes', ?)
```

### getPreferences

```sql
SELECT key, value FROM config_preferences
WHERE key IN ('buffer_time_minutes', 'default_priority', 'default_duration', 'scheduling_horizon_weeks', 'minimum_block_minutes')
```

### setPreferences

For each provided key:
```sql
INSERT OR REPLACE INTO config_preferences (key, value) VALUES (?, ?)
```

---

## ScheduleRepository

### saveSchedule (transaction)

```sql
DELETE FROM time_blocks
```
```sql
INSERT INTO time_blocks (id, task_id, start_time, end_time, date, block_index, total_blocks)
VALUES (?, ?, ?, ?, ?, ?, ?)
```
(repeated for each time block)

### getSchedule

```sql
SELECT * FROM time_blocks
WHERE start_time < ? AND end_time > ?
ORDER BY start_time ASC
```

Parameters: `[rangeEnd, rangeStart]`

### getScheduleStatus

```sql
SELECT status FROM schedule_status WHERE id = 1
```

### setScheduleStatus

When setting to `"up_to_date"`:
```sql
UPDATE schedule_status SET status = 'up_to_date', last_replan_at = ? WHERE id = 1
```

When setting to `"replan_in_progress"`:
```sql
UPDATE schedule_status SET status = 'replan_in_progress' WHERE id = 1
```

### clearSchedule

```sql
DELETE FROM time_blocks
```

---

## AnalyticsRepository

### getCompletedTasks

```sql
SELECT id AS task_id, title, category, duration AS estimated_duration, actual_duration, updated_at AS completed_at,
  CASE WHEN deadline IS NOT NULL AND updated_at <= deadline THEN 1 ELSE 0 END AS was_on_time
FROM tasks
WHERE status = 'completed' AND updated_at >= ? AND updated_at < ?
ORDER BY updated_at ASC
```

### getOverdueTasks

```sql
SELECT * FROM tasks
WHERE deadline IS NOT NULL AND deadline < ? AND status NOT IN ('completed', 'cancelled')
ORDER BY deadline ASC
```

### getCancelledTasks

```sql
SELECT * FROM tasks
WHERE status = 'cancelled' AND updated_at >= ? AND updated_at < ?
ORDER BY updated_at ASC
```

### getTasksByCategory

```sql
SELECT
  COALESCE(category, 'uncategorized') AS category,
  SUM(COALESCE(actual_duration, duration)) AS total_minutes,
  COUNT(*) AS task_count
FROM tasks
WHERE status = 'completed' AND updated_at >= ? AND updated_at < ?
GROUP BY COALESCE(category, 'uncategorized')
ORDER BY total_minutes DESC
```

### getDurationRecords

```sql
SELECT id AS task_id, category, duration AS estimated_minutes, actual_duration AS actual_minutes
FROM tasks
WHERE status = 'completed' AND actual_duration IS NOT NULL AND updated_at >= ? AND updated_at < ?
ORDER BY updated_at ASC
```

---

## RecurrenceRepository

### createTemplate

```sql
INSERT INTO recurrence_templates (id, task_data, rrule, is_active, created_at)
VALUES (?, ?, ?, 1, ?)
```

### getTemplate

```sql
SELECT * FROM recurrence_templates WHERE id = ?
```

### getActiveTemplates

```sql
SELECT * FROM recurrence_templates WHERE is_active = 1
ORDER BY created_at ASC
```

### deleteTemplate

```sql
UPDATE recurrence_templates SET is_active = 0 WHERE id = ?
```

### createInstance

```sql
INSERT INTO recurrence_instances (id, template_id, task_id, scheduled_date, is_exception)
VALUES (?, ?, ?, ?, ?)
```

### getInstances

```sql
SELECT * FROM recurrence_instances
WHERE template_id = ? AND scheduled_date >= ? AND scheduled_date <= ?
ORDER BY scheduled_date ASC
```

### addException

```sql
INSERT OR REPLACE INTO recurrence_exceptions (template_id, date, type, overrides)
VALUES (?, ?, ?, ?)
```

### getExceptions

```sql
SELECT * FROM recurrence_exceptions WHERE template_id = ?
ORDER BY date ASC
```
