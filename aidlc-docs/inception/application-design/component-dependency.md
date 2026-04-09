# Component Dependencies — Smart Agentic Calendar MCP Server

## Dependency Matrix

| Component | Depends On |
|---|---|
| **Models** | (none — leaf layer) |
| **Database** | Models |
| **TaskRepository** | Database, Models |
| **EventRepository** | Database, Models |
| **ConfigRepository** | Database, Models |
| **ScheduleRepository** | Database, Models |
| **AnalyticsRepository** | Database, Models |
| **RecurrenceRepository** | Database, Models |
| **DependencyResolver** | Models |
| **ConflictDetector** | Models |
| **Scheduler** | TaskRepo, EventRepo, ConfigRepo, ConflictDetector, DependencyResolver, ScheduleRepo |
| **ReplanCoordinator** | Scheduler, ScheduleRepo |
| **RecurrenceManager** | RecurrenceRepo, TaskRepo |
| **AnalyticsEngine** | AnalyticsRepo, TaskRepo, ScheduleRepo, ConfigRepo |
| **TaskTools** | TaskRepo, RecurrenceManager, DependencyResolver, ReplanCoordinator |
| **EventTools** | EventRepo, ReplanCoordinator |
| **ScheduleTools** | ScheduleRepo, ReplanCoordinator, ConflictDetector |
| **AnalyticsTools** | AnalyticsEngine |
| **ConfigTools** | ConfigRepo, ReplanCoordinator |
| **McpServer** | TaskTools, EventTools, ScheduleTools, AnalyticsTools, ConfigTools |

## Layer Dependency Rules

```
LAYER RULES (enforced by convention, can be linted):

  mcp/        → engine/, storage/, models/, common/
  analytics/  → storage/, models/, common/
  engine/     → storage/, models/, common/
  storage/    → models/, common/
  models/     → common/
  common/     → (nothing)

FORBIDDEN:
  storage/  ✗→ engine/, mcp/, analytics/
  engine/   ✗→ mcp/
  models/   ✗→ storage/, engine/, mcp/, analytics/
```

## Data Flow Diagrams

### Mutation Flow (e.g., create_task)

```
+----------+     +----------+     +-----------+     +----------+
| AI Agent |---->| TaskTools |---->| TaskRepo  |---->| Database |
+----------+     +----------+     +-----------+     +----------+
                      |
                      |  requestReplan()
                      v
                +------------------+
                | ReplanCoordinator|
                +------------------+
                      |  (setImmediate, background)
                      v
                +------------------+     +----------+     +----------+
                |    Scheduler     |---->| TaskRepo |---->| Database |
                |                  |---->| EventRepo|     +----------+
                |                  |---->| ConfigRepo|
                +------------------+     +----------+
                      |
                      v
                +--------------+     +----------+
                | ConflictDet. |     |ScheduleRepo|
                +--------------+     +----------+
                      |                    ^
                      +--------------------+
                         saves schedule
```

### Read Flow (e.g., get_schedule)

```
+----------+     +--------------+     +--------------+     +----------+
| AI Agent |---->| ScheduleTools|---->| ScheduleRepo |---->| Database |
+----------+     +--------------+     +--------------+     +----------+
                      |
                      |  getScheduleStatus()
                      v
                +------------------+
                | ReplanCoordinator|
                +------------------+
                      |
                      v
              Returns schedule_status
              ("up_to_date" or "replan_in_progress")
```

### Analytics Flow

```
+----------+     +----------------+     +-----------------+     +----------+
| AI Agent |---->| AnalyticsTools |---->| AnalyticsEngine |---->|AnalyticsRepo|
+----------+     +----------------+     +-----------------+     +----------+
                                              |
                                              +---->| TaskRepo   |
                                              +---->| ScheduleRepo|
                                              +---->| ConfigRepo |
```

## Communication Patterns

| Pattern | Used By | Description |
|---|---|---|
| Synchronous method call | All components | Default communication — direct method invocation via DI |
| Background async (setImmediate) | ReplanCoordinator | Only async pattern in the system — debounced replan |
| Promise-based await | `replan` tool only | `awaitReplan()` wraps the background replan in a promise |

## Dependency Injection Instantiation Order

```
1.  Database
2.  TaskRepository(db)
3.  EventRepository(db)
4.  ConfigRepository(db)
5.  ScheduleRepository(db)
6.  AnalyticsRepository(db)
7.  RecurrenceRepository(db)
8.  DependencyResolver()
9.  ConflictDetector()
10. Scheduler(taskRepo, eventRepo, configRepo, conflictDetector, dependencyResolver, scheduleRepo)
11. ReplanCoordinator(scheduler, scheduleRepo)
12. RecurrenceManager(recurrenceRepo, taskRepo)
13. AnalyticsEngine(analyticsRepo, taskRepo, scheduleRepo, configRepo)
14. TaskTools(taskRepo, recurrenceManager, dependencyResolver, replanCoordinator)
15. EventTools(eventRepo, replanCoordinator)
16. ScheduleTools(scheduleRepo, replanCoordinator, conflictDetector)
17. AnalyticsTools(analyticsEngine)
18. ConfigTools(configRepo, replanCoordinator)
19. McpServer(taskTools, eventTools, scheduleTools, analyticsTools, configTools)
```

No circular dependencies. Each component created after all its dependencies.
