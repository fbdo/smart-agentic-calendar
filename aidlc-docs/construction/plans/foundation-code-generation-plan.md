# Code Generation Plan — Unit 1: Foundation

## Unit Context

**Unit**: Foundation (models, common utilities, database)
**Stories**: None directly — Foundation provides types and infrastructure for all other units
**Dependencies**: None (leaf unit)
**Code location**: `/Users/fabiool/Workspace/SmartAgenticCalendar/src/`
**Test location**: `/Users/fabiool/Workspace/SmartAgenticCalendar/tests/`
**Project type**: Greenfield, single monolith

## Design References

- Domain entities: `aidlc-docs/construction/foundation/functional-design/domain-entities.md`
- Business rules: `aidlc-docs/construction/foundation/functional-design/business-rules.md`
- Business logic model: `aidlc-docs/construction/foundation/functional-design/business-logic-model.md`
- Component methods: `aidlc-docs/inception/application-design/component-methods.md`

## TDD Approach

All production code follows red-green-refactor:
1. Write a failing test (red)
2. Write minimal code to pass (green)
3. Refactor for simplicity

---

## Generation Steps

### Step 1: Project Structure Setup
- [x] Initialize package.json with project metadata and scripts
- [x] Create tsconfig.json with strict mode
- [x] Install dependencies: better-sqlite3, @types/better-sqlite3, uuid (or use crypto.randomUUID)
- [x] Install dev dependencies: vitest, typescript, @types/node
- [x] Create directory structure: src/models/, src/common/, src/storage/, tests/unit/models/, tests/unit/common/, tests/unit/storage/

### Step 2: Models — Error Types (TDD)
- [x] Write tests for error types (ValidationError, NotFoundError, CircularDependencyError, InvalidStateError)
- [x] Implement `src/models/errors.ts`
- [x] Verify tests pass

### Step 3: Models — Task Types
- [x] Write tests for Task type validation helpers and TaskPriority/TaskStatus enums
- [x] Implement `src/models/task.ts` — Task interface, TaskPriority, TaskStatus types
- [x] Verify tests pass

### Step 4: Models — Event Types
- [x] Write tests for Event type validation helpers
- [x] Implement `src/models/event.ts` — Event interface
- [x] Verify tests pass

### Step 5: Models — Schedule Types
- [x] Write tests for TimeBlock, ScheduleResult, ScheduleStatus types
- [x] Implement `src/models/schedule.ts`
- [x] Verify tests pass

### Step 6: Models — Config Types
- [x] Write tests for Availability, FocusTime, Preferences, UserConfig types
- [x] Implement `src/models/config.ts`
- [x] Verify tests pass

### Step 7: Models — Conflict Types
- [x] Write tests for Conflict, AtRiskTask, DeprioritizationSuggestion, ConflictReason types
- [x] Implement `src/models/conflict.ts`
- [x] Verify tests pass

### Step 8: Models — Analytics Types
- [x] Write tests for ProductivityStats, ScheduleHealth, EstimationAccuracy, TimeAllocation and related types
- [x] Implement `src/models/analytics.ts`
- [x] Verify tests pass

### Step 9: Models — Recurrence Types
- [x] Write tests for RecurrenceTemplate, RecurrenceInstance, RecurrenceException types
- [x] Implement `src/models/recurrence.ts`
- [x] Verify tests pass

### Step 10: Models — Barrel Export
- [x] Create `src/models/index.ts` re-exporting all model types
- [x] Verify imports work

### Step 11: Common — ID Generation (TDD)
- [x] Write tests for generateId() — returns valid UUID v4, uniqueness
- [x] Implement `src/common/id.ts`
- [x] Verify tests pass

### Step 12: Common — Time Utilities (TDD)
- [x] Write tests for all time utility functions: toUTC, parseUTC, isValidISO8601, isValidTimeHHMM, isValidDateYYYYMMDD, nowUTC, startOfDay, endOfDay, addMinutes, diffMinutes
- [x] Implement `src/common/time.ts`
- [x] Verify tests pass

### Step 13: Common — Constants
- [x] Implement `src/common/constants.ts` — all default values and valid value arrays
- [x] Write tests verifying constant values match design spec

### Step 14: Common — Barrel Export
- [x] Create `src/common/index.ts` re-exporting all common utilities
- [x] Verify imports work

### Step 15: Storage — Database (TDD)
- [x] Write tests for Database class: initialization, schema creation, migrations, connection, close
- [x] Implement `src/storage/database.ts` — SQLite connection, PRAGMA settings, full schema creation
- [x] Verify tests pass — all 11 tables created with correct columns and indexes
- [x] Test uses in-memory SQLite (`:memory:`) for speed

### Step 16: Code Generation Summary
- [x] Create `aidlc-docs/construction/foundation/code/code-summary.md` — list of all generated files with descriptions
