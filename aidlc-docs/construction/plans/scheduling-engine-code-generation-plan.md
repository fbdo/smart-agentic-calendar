# Code Generation Plan — Unit 3: Scheduling Engine

## Unit Context

**Unit**: Scheduling Engine (5 engine components: Scheduler, DependencyResolver, ConflictDetector, ReplanCoordinator, RecurrenceManager)
**Stories**: 3.1, 3.2, 3.3, 4.1, 4.2, 5.1, 1.4
**Dependencies**: Unit 1 (models, common), Unit 2 (task-repo, event-repo, config-repo, schedule-repo, recurrence-repo)
**Code location**: `src/engine/`
**Test location**: `tests/unit/engine/`, `tests/pbt/`
**Project type**: Greenfield, single monolith

## Design References

- Business logic model: `aidlc-docs/construction/scheduling-engine/functional-design/business-logic-model.md`
- Business rules: `aidlc-docs/construction/scheduling-engine/functional-design/business-rules.md`
- Domain entities: `aidlc-docs/construction/scheduling-engine/functional-design/domain-entities.md`
- Component methods: `aidlc-docs/inception/application-design/component-methods.md`
- Services & orchestration: `aidlc-docs/inception/application-design/services.md`

## TDD Approach

All production code follows red-green-refactor:
1. Write a failing test (red)
2. Write minimal code to pass (green)
3. Refactor for simplicity

Engine tests use mocked/stubbed repositories (dependency injection makes this trivial). Pure algorithm tests (DependencyResolver, ConflictDetector scoring) use direct unit tests with no mocks. PBT tests cover scheduling invariants and dependency graph properties.

## External Dependencies

- **rrule** (`rrule` npm package): Required for RecurrenceManager RRULE parsing and instance date generation. Must be installed before Step 7.

---

## Generation Steps

### Step 1: Install rrule dependency + create engine barrel export
- [x] Install `rrule` package and `@types/rrule` (if separate) via npm
- [x] Create `src/engine/index.ts` barrel export (empty initially, populated as components are built)
- [x] Verify TypeScript compilation passes

### Step 2: DependencyResolver (TDD)
- [x] Write tests for `validateNoCycles`: valid dependency (no cycle), direct cycle (A→B→A), indirect cycle (A→B→C→A), self-dependency, empty graph, single-node graph
- [x] Write tests for `topologicalSort`: linear chain, diamond graph, multiple independent chains, empty input, single task with no deps, tie-breaking by priority then deadline then duration
- [x] Write tests for `getBlockedTasks`: all deps completed (not blocked), some deps incomplete (blocked), no deps (not blocked), mixed statuses
- [x] Implement `src/engine/dependency-resolver.ts` — DFS reachability for validation, Kahn's algorithm for topological sort, blocked task identification
- [x] Write PBT test: for any valid topological ordering, every dependency edge (A→B) has A appearing before B in the result
- [x] Update barrel export
- [x] Verify all tests pass — 22 unit + 27 PBT = 49 tests

### Step 3: ConflictDetector (TDD)
- [x] Write tests for `detectConflicts`: overdue task detection, insufficient time detection, dependency chain infeasibility, no conflicts (all schedulable), mixed conflict types, tasks with no deadline
- [x] Write tests for `suggestDeprioritizations`: greedy accumulation stops when enough time freed, filters out nearer-deadline tasks, sorts by priority DESC then deadline DESC, partial relief when insufficient candidates, empty competing tasks
- [x] Write internal helper tests: `findCompetingTasks` (correct task identification within deadline window), `computeAvailableBeforeDeadline`
- [x] Implement `src/engine/conflict-detector.ts` — detectConflicts, suggestDeprioritizations, findCompetingTasks, helper functions
- [x] Update barrel export
- [x] Verify all tests pass — 14 tests

### Step 4: Scheduler — Availability Map & Slot Scoring (TDD)
- [x] Write tests for `buildAvailabilityMap`: single day with availability, multiple days, events blocking slots, all-day events, pinned blocks subtracted, no availability (empty result), overlapping events splitting slots
- [x] Write tests for slot scoring functions: `deadlineProximityScore` (imminent deadline, no deadline, far deadline), `priorityScore` (P1-P4 mapping), `focusTimeScore` (focus task in/out of focus block, non-focus task in/out of focus block), `energyScore` (tagged task in/out of zone, untagged task, no energy config), `bufferScore` (adjacent blocks within/outside buffer zone)
- [x] Write test for `scoreSlot` composite: verifies weighted sum matches individual scores × weights
- [x] Implement scoring functions and availability map builder in `src/engine/scheduler.ts` (partial — scheduling pipeline comes in Step 5)
- [x] PBT test deferred to Step 5 (combined with scheduling invariants)
- [x] Verify all tests pass — 30 tests

### Step 5: Scheduler — Task Placement & Schedule Generation (TDD)
- [x] Write tests for `placeTask`: task fits in single slot (no split), task split across 2 slots, slot below minimum skipped, trailing block adjustment, task partially schedulable (remaining minutes > 0), blockIndex and totalBlocks correct, empty slots
- [x] Implement placeTask with hybrid splitting strategy, focus fragmentation prevention, generateSchedule orchestration pipeline
- [x] Write PBT tests: (1) no two time blocks overlap (10 seeds), (2) all blocks within availability windows, (3) scoreSlot returns bounded values (10 seeds)
- [x] Verify all tests pass — 7 unit + 21 PBT = 28 tests

### Step 6: ReplanCoordinator (TDD)
- [x] Write tests for `requestReplan`: sets dirty flag, schedules setTimeout(0), multiple calls coalesce, replan executes and clears dirty flag
- [x] Write tests for `isReplanning` and `getScheduleStatus`: returns correct status during/after replan
- [x] Write tests for `awaitReplan`: resolves immediately when not dirty, triggers synchronous replan when dirty but not replanning
- [x] Write tests for debouncing: rapid mutations produce single replan
- [x] Write tests for error handling: replan failure preserves previous schedule, status returns to up_to_date
- [x] Write test for replan pipeline order: expandHorizon called before generateSchedule
- [x] Implement `src/engine/replan-coordinator.ts` — dirty flag state machine, setTimeout(0) scheduling, awaitReplan promise management, error handling
- [x] Update barrel export
- [x] Verify all tests pass — 10 tests

### Step 7: RecurrenceManager (TDD)
- [x] Write tests for `createRecurringTask`: daily recurrence generates correct instances, weekly recurrence, monthly with UNTIL, count-limited recurrence, invalid RRULE throws ValidationError
- [x] Write tests for `generateInstances`: respects horizon boundary, skips existing instances (no duplicates), skips "skip" exceptions, applies "modify" exception overrides, no matching dates in horizon returns empty
- [x] Write tests for `expandHorizon`: generates new instances for newly entered horizon dates, no-op when horizon hasn't moved
- [x] Write tests for `skipInstance`: cancels existing task instance, creates skip exception
- [x] Write tests for `modifyInstance`: updates task fields, marks as exception, rejects completed instance modification
- [x] Write tests for `deleteTemplate`: cancels future instances, preserves completed instances, deactivates template
- [x] Implement `src/engine/recurrence-manager.ts` — RRULE parsing via rrule.js, instance generation, horizon expansion, exception handling
- [x] Update barrel export
- [x] Verify all tests pass — 14 tests

### Step 8: Integration Verification & Engine Barrel Export
- [x] Finalize `src/engine/index.ts` barrel export with all 5 components
- [x] Run full test suite (Units 1 + 2 + 3) to verify zero regressions — 349 tests passing
- [x] Run TypeScript compilation to verify all types resolve
- [x] Run lint + format checks

### Step 9: Code Generation Summary
- [x] Create `aidlc-docs/construction/scheduling-engine/code/code-summary.md` — list of all generated files with descriptions
- [x] Record final test counts: Unit 3 tests, total suite tests, PBT test count
- [x] Verify all stories (3.1, 3.2, 3.3, 4.1, 4.2, 5.1, 1.4) have test coverage

---

## Story Traceability

| Step | Stories Covered |
|------|----------------|
| Step 2: DependencyResolver | 1.4 (dependencies, cycle detection) |
| Step 3: ConflictDetector | 5.1 (infeasible deadlines, deprioritization) |
| Steps 4-5: Scheduler | 3.1 (schedule generation), 3.3 (focus time) |
| Step 6: ReplanCoordinator | 3.2 (automatic replanning, debouncing) |
| Step 7: RecurrenceManager | 4.1 (recurring tasks), 4.2 (instance modification) |

## Estimated Scope

- **Source files**: 5 (one per engine component) + 1 barrel export = 6
- **Test files**: 5 unit test files + 1-2 PBT test files = 6-7
- **Total new tests**: ~120-160 (estimated based on test scenarios listed)
