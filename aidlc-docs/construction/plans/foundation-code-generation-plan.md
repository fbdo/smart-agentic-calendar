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
- [ ] Initialize package.json with project metadata and scripts
- [ ] Create tsconfig.json with strict mode
- [ ] Install dependencies: better-sqlite3, @types/better-sqlite3, uuid (or use crypto.randomUUID)
- [ ] Install dev dependencies: vitest, typescript, @types/node
- [ ] Create directory structure: src/models/, src/common/, src/storage/, tests/unit/models/, tests/unit/common/, tests/unit/storage/

### Step 2: Models — Error Types (TDD)
- [ ] Write tests for error types (ValidationError, NotFoundError, CircularDependencyError, InvalidStateError)
- [ ] Implement `src/models/errors.ts`
- [ ] Verify tests pass

### Step 3: Models — Task Types
- [ ] Write tests for Task type validation helpers and TaskPriority/TaskStatus enums
- [ ] Implement `src/models/task.ts` — Task interface, TaskPriority, TaskStatus types
- [ ] Verify tests pass

### Step 4: Models — Event Types
- [ ] Write tests for Event type validation helpers
- [ ] Implement `src/models/event.ts` — Event interface
- [ ] Verify tests pass

### Step 5: Models — Schedule Types
- [ ] Write tests for TimeBlock, ScheduleResult, ScheduleStatus types
- [ ] Implement `src/models/schedule.ts`
- [ ] Verify tests pass

### Step 6: Models — Config Types
- [ ] Write tests for Availability, FocusTime, Preferences, UserConfig types
- [ ] Implement `src/models/config.ts`
- [ ] Verify tests pass

### Step 7: Models — Conflict Types
- [ ] Write tests for Conflict, AtRiskTask, DeprioritizationSuggestion, ConflictReason types
- [ ] Implement `src/models/conflict.ts`
- [ ] Verify tests pass

### Step 8: Models — Analytics Types
- [ ] Write tests for ProductivityStats, ScheduleHealth, EstimationAccuracy, TimeAllocation and related types
- [ ] Implement `src/models/analytics.ts`
- [ ] Verify tests pass

### Step 9: Models — Recurrence Types
- [ ] Write tests for RecurrenceTemplate, RecurrenceInstance, RecurrenceException types
- [ ] Implement `src/models/recurrence.ts`
- [ ] Verify tests pass

### Step 10: Models — Barrel Export
- [ ] Create `src/models/index.ts` re-exporting all model types
- [ ] Verify imports work

### Step 11: Common — ID Generation (TDD)
- [ ] Write tests for generateId() — returns valid UUID v4, uniqueness
- [ ] Implement `src/common/id.ts`
- [ ] Verify tests pass

### Step 12: Common — Time Utilities (TDD)
- [ ] Write tests for all time utility functions: toUTC, parseUTC, isValidISO8601, isValidTimeHHMM, isValidDateYYYYMMDD, nowUTC, startOfDay, endOfDay, addMinutes, diffMinutes
- [ ] Implement `src/common/time.ts`
- [ ] Verify tests pass

### Step 13: Common — Constants
- [ ] Implement `src/common/constants.ts` — all default values and valid value arrays
- [ ] Write tests verifying constant values match design spec

### Step 14: Common — Barrel Export
- [ ] Create `src/common/index.ts` re-exporting all common utilities
- [ ] Verify imports work

### Step 15: Storage — Database (TDD)
- [ ] Write tests for Database class: initialization, schema creation, migrations, connection, close
- [ ] Implement `src/storage/database.ts` — SQLite connection, PRAGMA settings, full schema creation
- [ ] Verify tests pass — all 11 tables created with correct columns and indexes
- [ ] Test uses in-memory SQLite (`:memory:`) for speed

### Step 16: Code Generation Summary
- [ ] Create `aidlc-docs/construction/foundation/code/code-summary.md` — list of all generated files with descriptions
