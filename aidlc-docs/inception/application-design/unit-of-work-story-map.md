# Unit of Work Story Map — Smart Agentic Calendar MCP Server

## Story-to-Unit Mapping

| Story | Title | Unit | Rationale |
|---|---|---|---|
| **1.1** | Create and Configure Tasks | Unit 5 (MCP) + Unit 2 (Storage) | Tool handler + task persistence |
| **1.2** | Update and Manage Task Status | Unit 5 (MCP) + Unit 2 (Storage) | Tool handler + task persistence |
| **1.3** | Query and Filter Tasks | Unit 5 (MCP) + Unit 2 (Storage) | Tool handler + query logic |
| **1.4** | Manage Task Dependencies | Unit 5 (MCP) + Unit 3 (Engine) + Unit 2 (Storage) | Tool handler + dependency resolver + persistence |
| **1.5** | Delete Tasks | Unit 5 (MCP) + Unit 2 (Storage) | Tool handler + task persistence |
| **2.1** | Create and Manage Fixed Events | Unit 5 (MCP) + Unit 2 (Storage) | Tool handler + event persistence |
| **3.1** | Generate Optimized Schedule | Unit 3 (Engine) + Unit 5 (MCP) | Scheduler algorithm + schedule tool |
| **3.2** | Automatic Replanning on Changes | Unit 3 (Engine) | ReplanCoordinator + Scheduler |
| **3.3** | Focus Time Protection | Unit 3 (Engine) | Scheduler soft constraint |
| **4.1** | Create and Manage Recurring Tasks | Unit 3 (Engine) + Unit 5 (MCP) + Unit 2 (Storage) | RecurrenceManager + tool handler + persistence |
| **4.2** | Modify Individual Recurrence Instances | Unit 3 (Engine) + Unit 5 (MCP) + Unit 2 (Storage) | RecurrenceManager + tool handler + persistence |
| **5.1** | Detect and Report Infeasible Deadlines | Unit 3 (Engine) + Unit 5 (MCP) | ConflictDetector + schedule tool |
| **6.1** | Track Completion and Productivity | Unit 4 (Analytics) + Unit 5 (MCP) | Productivity calculator + analytics tool |
| **6.2** | Monitor Schedule Health | Unit 4 (Analytics) + Unit 5 (MCP) | Health calculator + analytics tool |
| **6.3** | Analyze Estimation Accuracy | Unit 4 (Analytics) + Unit 5 (MCP) | Estimation calculator + analytics tool |
| **6.4** | Get Time Allocation Breakdown | Unit 4 (Analytics) + Unit 5 (MCP) | Allocation calculator + analytics tool |
| **7.1** | Configure Availability Windows | Unit 5 (MCP) + Unit 2 (Storage) | Tool handler + config persistence |
| **7.2** | Configure Focus Time | Unit 5 (MCP) + Unit 2 (Storage) | Tool handler + config persistence |
| **7.3** | Configure Scheduling Preferences | Unit 5 (MCP) + Unit 2 (Storage) | Tool handler + config persistence |

## Unit-to-Story Mapping

### Unit 1: Foundation
**Direct stories**: None — Foundation provides types and infrastructure used by all other units.
**Indirect support**: All 18 stories depend on model types and database schema from this unit.

### Unit 2: Storage
**Stories**: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 4.1, 4.2, 7.1, 7.2, 7.3
**Coverage**: 11 of 18 stories require repository data access from this unit.

### Unit 3: Scheduling Engine
**Stories**: 3.1, 3.2, 3.3, 4.1, 4.2, 5.1, 1.4
**Coverage**: 7 stories — all scheduling, recurrence, conflict, and dependency stories.

### Unit 4: Analytics
**Stories**: 6.1, 6.2, 6.3, 6.4
**Coverage**: 4 stories — all analytics stories.

### Unit 5: MCP Server
**Stories**: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 3.1, 4.1, 4.2, 5.1, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3
**Coverage**: 17 of 18 stories — all tool handlers live here. Only Story 3.2 (automatic replanning) is purely internal to Unit 3.

## Coverage Validation

| Epic | Stories | Units Covering | Fully Covered? |
|---|---|---|---|
| 1. Task Management | 1.1-1.5 | Units 2, 3, 5 | Yes |
| 2. Event Management | 2.1 | Units 2, 5 | Yes |
| 3. Scheduling Engine | 3.1-3.3 | Units 3, 5 | Yes |
| 4. Recurring Tasks | 4.1-4.2 | Units 2, 3, 5 | Yes |
| 5. Conflict Detection | 5.1 | Units 3, 5 | Yes |
| 6. Analytics | 6.1-6.4 | Units 2, 4, 5 | Yes |
| 7. Configuration | 7.1-7.3 | Units 2, 5 | Yes |

**Result**: All 18 stories across 7 epics are fully covered. No orphan stories.

## Implementation Order with Story Activation

```
Unit 1: Foundation
  |  No stories directly — enables all subsequent units
  v
Unit 2: Storage
  |  Enables data persistence for Stories: 1.1-1.5, 2.1, 4.1-4.2, 7.1-7.3
  v
Unit 3: Scheduling Engine
  |  Activates Stories: 3.1, 3.2, 3.3, 5.1 (+ supports 1.4, 4.1, 4.2)
  v
Unit 4: Analytics
  |  Activates Stories: 6.1, 6.2, 6.3, 6.4
  v
Unit 5: MCP Server
  |  Completes ALL stories — exposes everything via MCP tools
  v
  DONE
```

## Notes

- **Story 3.2 (Automatic Replanning)** is the only story implemented entirely within one non-MCP unit (Unit 3). All other stories span Unit 5 (tool handler) plus one or more backend units.
- **Unit 1 (Foundation)** has no direct stories but is a prerequisite for everything. Its testing focuses on model validation, utility correctness, and schema integrity.
- **MoSCoW priority alignment**: All "Must Have" stories (Epics 1-5, 7) are in Units 1-3 and 5. "Should Have" stories (Epic 6) are in Unit 4. This means a working "Must Have" system is deliverable after Units 1-3 + 5 (without analytics).
