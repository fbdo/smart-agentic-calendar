# Business Logic Model — Unit 1: Foundation

## Overview
Unit 1 defines the data foundation for the entire system. It contains no business *behavior* (that lives in Units 2-5), but it defines the structures, schemas, utilities, and error types that all behavior depends on.

---

## Database Schema

### Table: tasks

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  duration INTEGER NOT NULL,          -- minutes
  deadline TEXT,                       -- ISO 8601 UTC
  priority TEXT NOT NULL DEFAULT 'P3', -- P1, P2, P3, P4
  status TEXT NOT NULL DEFAULT 'pending',
  category TEXT,
  tags TEXT NOT NULL DEFAULT '[]',     -- JSON array of strings
  is_recurring INTEGER NOT NULL DEFAULT 0,  -- boolean
  recurrence_template_id TEXT,
  actual_duration INTEGER,            -- minutes, set on completion
  created_at TEXT NOT NULL,           -- ISO 8601 UTC
  updated_at TEXT NOT NULL,           -- ISO 8601 UTC
  FOREIGN KEY (recurrence_template_id) REFERENCES recurrence_templates(id)
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_deadline ON tasks(deadline);
CREATE INDEX idx_tasks_category ON tasks(category);
CREATE INDEX idx_tasks_recurrence_template ON tasks(recurrence_template_id);
```

### Table: events

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  start_time TEXT,                    -- ISO 8601 UTC (null for all-day)
  end_time TEXT,                      -- ISO 8601 UTC (null for all-day)
  is_all_day INTEGER NOT NULL DEFAULT 0,  -- boolean
  date TEXT,                          -- YYYY-MM-DD (for all-day events)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_events_start ON events(start_time);
CREATE INDEX idx_events_date ON events(date);
```

### Table: time_blocks

```sql
CREATE TABLE time_blocks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  start_time TEXT NOT NULL,           -- ISO 8601 UTC
  end_time TEXT NOT NULL,             -- ISO 8601 UTC
  date TEXT NOT NULL,                 -- YYYY-MM-DD
  block_index INTEGER NOT NULL DEFAULT 0,
  total_blocks INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE INDEX idx_time_blocks_task ON time_blocks(task_id);
CREATE INDEX idx_time_blocks_date ON time_blocks(date);
CREATE INDEX idx_time_blocks_start ON time_blocks(start_time);
```

### Table: dependencies

```sql
CREATE TABLE dependencies (
  task_id TEXT NOT NULL,
  depends_on_id TEXT NOT NULL,
  PRIMARY KEY (task_id, depends_on_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (depends_on_id) REFERENCES tasks(id)
);
```

### Table: schedule_status

```sql
CREATE TABLE schedule_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton row
  status TEXT NOT NULL DEFAULT 'up_to_date',  -- up_to_date | replan_in_progress
  last_replan_at TEXT                     -- ISO 8601 UTC
);
```

### Table: config_availability

```sql
CREATE TABLE config_availability (
  day INTEGER NOT NULL,               -- 0=Sunday through 6=Saturday
  start_time TEXT NOT NULL,           -- HH:MM
  end_time TEXT NOT NULL,             -- HH:MM
  PRIMARY KEY (day, start_time)
);
```

### Table: config_focus_time

```sql
CREATE TABLE config_focus_time (
  day INTEGER NOT NULL,
  start_time TEXT NOT NULL,           -- HH:MM
  end_time TEXT NOT NULL,             -- HH:MM
  PRIMARY KEY (day, start_time)
);
```

### Table: config_preferences

```sql
CREATE TABLE config_preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL                  -- JSON-encoded value
);
```

Default rows:
```sql
INSERT INTO config_preferences (key, value) VALUES
  ('buffer_time_minutes', '15'),
  ('default_priority', '"P3"'),
  ('default_duration', '60'),
  ('scheduling_horizon_weeks', '4'),
  ('minimum_block_minutes', '30'),
  ('focus_time_minimum_block_minutes', '60');
```

### Table: recurrence_templates

```sql
CREATE TABLE recurrence_templates (
  id TEXT PRIMARY KEY,
  task_data TEXT NOT NULL,            -- JSON: task fields for instance generation
  rrule TEXT NOT NULL,                -- RFC 5545 RRULE string
  is_active INTEGER NOT NULL DEFAULT 1,  -- boolean
  created_at TEXT NOT NULL
);
```

### Table: recurrence_instances

```sql
CREATE TABLE recurrence_instances (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,       -- YYYY-MM-DD
  is_exception INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (template_id) REFERENCES recurrence_templates(id),
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE INDEX idx_recurrence_instances_template ON recurrence_instances(template_id);
CREATE INDEX idx_recurrence_instances_date ON recurrence_instances(scheduled_date);
```

### Table: recurrence_exceptions

```sql
CREATE TABLE recurrence_exceptions (
  template_id TEXT NOT NULL,
  date TEXT NOT NULL,                 -- YYYY-MM-DD
  type TEXT NOT NULL,                 -- 'skip' | 'modify'
  overrides TEXT,                     -- JSON: partial task data (null for skip)
  PRIMARY KEY (template_id, date),
  FOREIGN KEY (template_id) REFERENCES recurrence_templates(id)
);
```

---

## Migration Strategy

- **v1**: Single migration creates all tables and indexes above
- Schema versioning via `PRAGMA user_version`
- Database initialized in `Database.runMigrations()` — creates tables if not exist
- All tables created upfront (including analytics/recurrence) to avoid future ALTER TABLE complexity
- Foreign keys enabled via `PRAGMA foreign_keys = ON`
- WAL mode enabled for concurrent read/write: `PRAGMA journal_mode = WAL`

---

## Shared Utilities

### ID Generation (`src/common/id.ts`)

```typescript
function generateId(): string
// Returns crypto.randomUUID()
```

### Time Utilities (`src/common/time.ts`)

```typescript
function toUTC(date: Date): string
// Returns ISO 8601 UTC string with Z suffix

function parseUTC(isoString: string): Date
// Parses ISO 8601 string, throws if invalid

function isValidISO8601(str: string): boolean
// Returns true if string is valid ISO 8601

function isValidTimeHHMM(str: string): boolean
// Returns true if string matches HH:MM format (00:00-23:59)

function isValidDateYYYYMMDD(str: string): boolean
// Returns true if string matches YYYY-MM-DD format

function nowUTC(): string
// Returns current time as ISO 8601 UTC string

function startOfDay(isoString: string): string
// Returns ISO 8601 for start of the given day (00:00:00Z)

function endOfDay(isoString: string): string
// Returns ISO 8601 for end of the given day (23:59:59.999Z)

function addMinutes(isoString: string, minutes: number): string
// Returns new ISO 8601 string with minutes added

function diffMinutes(start: string, end: string): number
// Returns difference in minutes between two ISO 8601 strings
```

### Constants (`src/common/constants.ts`)

```typescript
const DEFAULT_BUFFER_TIME_MINUTES = 15
const DEFAULT_PRIORITY: TaskPriority = "P3"
const DEFAULT_DURATION_MINUTES = 60
const DEFAULT_SCHEDULING_HORIZON_WEEKS = 4
const DEFAULT_MINIMUM_BLOCK_MINUTES = 30
const DEFAULT_FOCUS_TIME_MINIMUM_BLOCK_MINUTES = 60
const VALID_PRIORITIES: TaskPriority[] = ["P1", "P2", "P3", "P4"]
const VALID_STATUSES: TaskStatus[] = ["pending", "scheduled", "completed", "cancelled", "at_risk"]
const VALID_PERIODS = ["day", "week", "month"] as const
const MAX_SCHEDULING_HORIZON_WEEKS = 12
const MIN_MINIMUM_BLOCK_MINUTES = 15
const MAX_MINIMUM_BLOCK_MINUTES = 120
```

---

## Error Types (`src/models/errors.ts`)

```typescript
class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string
  )
}

type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CIRCULAR_DEPENDENCY"
  | "INVALID_STATE"

class ValidationError extends AppError {
  constructor(message: string)
  // Sets code = "VALIDATION_ERROR"
}

class NotFoundError extends AppError {
  constructor(entity: string, id: string)
  // Sets code = "NOT_FOUND", message = "{entity} not found"
}

class CircularDependencyError extends AppError {
  constructor(cyclePath: string[])
  // Sets code = "CIRCULAR_DEPENDENCY", message includes cycle path
}

class InvalidStateError extends AppError {
  constructor(message: string)
  // Sets code = "INVALID_STATE"
}
```

---

## Cross-References

- **Entity field sources**: Stories (stories.md), Component methods (component-methods.md)
- **Validation rules**: Business rules (business-rules.md)
- **Schema consumers**: All repositories in Unit 2
- **Type consumers**: All units (2-5) import from models layer
