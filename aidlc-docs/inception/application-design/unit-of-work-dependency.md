# Unit of Work Dependencies — Smart Agentic Calendar MCP Server

## Unit Dependency Matrix

| Unit | Depends On | Depended On By |
|---|---|---|
| **Unit 1: Foundation** | (none) | Unit 2, Unit 3, Unit 4, Unit 5 |
| **Unit 2: Storage** | Unit 1 | Unit 3, Unit 4, Unit 5 |
| **Unit 3: Scheduling Engine** | Unit 1, Unit 2 | Unit 5 |
| **Unit 4: Analytics** | Unit 1, Unit 2 | Unit 5 |
| **Unit 5: MCP Server** | Unit 1, Unit 2, Unit 3, Unit 4 | (none — top of stack) |

## Dependency Diagram

```
+---------------------+
|  Unit 5: MCP Server |
+---------------------+
    |    |    |    |
    |    |    |    +---------------------------+
    |    |    +----------------+               |
    |    v                     v               v
    |  +------------------------+   +-------------------+
    |  | Unit 3: Sched. Engine  |   | Unit 4: Analytics |
    |  +------------------------+   +-------------------+
    |    |         |                    |         |
    |    v         v                    v         v
    |  +---------------------+       +---------------------+
    +->|   Unit 2: Storage   |<------+   Unit 2: Storage   |
       +---------------------+       +---------------------+
                |                              |
                v                              v
       +---------------------+       +---------------------+
       |  Unit 1: Foundation |<------+  Unit 1: Foundation |
       +---------------------+       +---------------------+
```

Simplified (deduplicated):

```
Unit 5: MCP Server
  |
  +---> Unit 3: Scheduling Engine --+
  |                                 |
  +---> Unit 4: Analytics ----------+
  |                                 |
  +---> Unit 2: Storage <-----------+
  |       |
  +---> Unit 1: Foundation <--- (all units)
```

## Key Observations

1. **No circular dependencies** — strict bottom-up DAG
2. **Unit 3 and Unit 4 are independent** — they can theoretically be built in parallel (both depend on Units 1+2 only), but sequential bottom-up order (3 before 4) is chosen for simplicity
3. **Unit 5 is the integration point** — it depends on all other units and wires them together via DI
4. **Unit 1 is universal** — every unit imports from Foundation (models, common, database)

## Interface Contracts Between Units

### Unit 1 → Unit 2 (Foundation → Storage)
- Unit 2 repositories use model types from Unit 1 as parameters and return types
- Unit 2 repositories receive Database instance from Unit 1 via constructor injection

### Unit 2 → Unit 3 (Storage → Scheduling Engine)
- Scheduler reads tasks, events, config via repository interfaces
- Scheduler writes schedule blocks via ScheduleRepository
- ReplanCoordinator reads/writes schedule status via ScheduleRepository
- RecurrenceManager reads/writes via RecurrenceRepository and TaskRepository

### Unit 2 → Unit 4 (Storage → Analytics)
- AnalyticsEngine reads from AnalyticsRepository, TaskRepository, ScheduleRepository, ConfigRepository
- All reads are synchronous (better-sqlite3), no async coordination needed

### Units 3+4 → Unit 5 (Engine + Analytics → MCP Server)
- MCP tools call engine and analytics methods directly
- Mutation tools call `replanCoordinator.requestReplan()` after persisting changes
- Read tools call `replanCoordinator.getScheduleStatus()` to include status in responses
- Analytics tools call AnalyticsEngine methods for computation

## Build/Test Order

| Order | Unit | Test Strategy |
|---|---|---|
| 1 | Foundation | Unit tests for models, utilities, database schema creation |
| 2 | Storage | Unit tests with in-memory SQLite for all repository CRUD |
| 3 | Scheduling Engine | Unit tests + PBT for scheduler constraints, dependency cycle detection, conflict detection |
| 4 | Analytics | Unit tests with seeded data for all calculators |
| 5 | MCP Server | Integration tests: full tool → repository → database flow |
