# Requirements: Smart Agentic Calendar MCP Server

## Intent Analysis

- **User Request**: Create a local-first smart calendar MCP server for AI agents, inspired by Reclaim.ai and Motion. It should automatically re-plan tasks, recalculate the schedule, and help the agent become a personal assistant by planning tasks based on deadlines, durations, and priorities.
- **Request Type**: New Project (greenfield)
- **Scope**: System-wide — scheduling engine, storage layer, MCP server, analytics
- **Complexity**: Complex — constraint-satisfaction scheduling, auto-replanning, recurrence, focus time protection

---

## 1. Functional Requirements

### FR-1: Task Management
- **FR-1.1**: Create tasks with: title, description, estimated duration, deadline, priority (P1-P4), and optional category/tags
- **FR-1.2**: Update any task field; changes trigger automatic schedule replanning
- **FR-1.3**: Delete tasks; schedule automatically replans to fill freed time
- **FR-1.4**: Mark tasks as completed; schedule automatically replans remaining tasks
- **FR-1.5**: Query tasks with filters (by status, priority, deadline range, category)
- **FR-1.6**: Tasks have statuses: `pending`, `scheduled`, `in_progress`, `completed`, `cancelled`, `at_risk`

### FR-2: Task Dependencies
- **FR-2.1**: Support simple blocking dependencies — task B cannot be scheduled until task A is completed
- **FR-2.2**: Validate dependency graphs for cycles (reject circular dependencies)
- **FR-2.3**: When a blocking task completes, automatically unblock and schedule dependent tasks

### FR-3: Recurring Tasks
- **FR-3.1**: Support full RRULE recurrence patterns (daily, weekly, monthly, yearly, custom)
- **FR-3.2**: Generate task instances from recurrence rules within the scheduling horizon
- **FR-3.3**: Allow modification of individual recurrence instances (exception handling)
- **FR-3.4**: Support recurrence end conditions: count-based, date-based, or indefinite

### FR-4: Event Management
- **FR-4.1**: Create fixed events (meetings, appointments) that block time slots
- **FR-4.2**: Events are immovable — the scheduler works around them
- **FR-4.3**: Events have: title, start time, end time, optional recurrence
- **FR-4.4**: Support all-day events that block entire days

### FR-5: Scheduling Engine (Constraint Satisfaction)
- **FR-5.1**: Assign specific time slots to tasks (time-blocking model)
- **FR-5.2**: Respect hard constraints: deadlines, availability windows, event conflicts, task dependencies
- **FR-5.3**: Respect soft constraints: user time preferences, energy levels, buffer time between tasks, focus time blocks
- **FR-5.4**: Priority-aware scheduling: P1 tasks get best available slots, P4 tasks fill remaining gaps
- **FR-5.5**: Schedule within user-defined availability windows (e.g., work hours Mon-Fri 9:00-17:00)
- **FR-5.6**: Insert configurable buffer time between scheduled tasks (default: 15 minutes)
- **FR-5.7**: Split long tasks across multiple time slots/days when necessary

### FR-6: Focus Time Protection
- **FR-6.1**: User defines focus time blocks (e.g., "deep work" 9:00-11:00 Mon-Fri)
- **FR-6.2**: Scheduler prioritizes placing high-concentration tasks in focus time blocks
- **FR-6.3**: Focus blocks are protected from fragmentation — minimum uninterrupted duration enforced
- **FR-6.4**: Focus time configuration: days of week, start/end times, minimum block duration

### FR-7: Automatic Replanning
- **FR-7.1**: Trigger replan on any mutation: task created, updated, deleted, completed, or missed
- **FR-7.2**: Replanning preserves schedule stability — minimize unnecessary changes to already-scheduled tasks
- **FR-7.3**: Detect tasks whose deadlines have become infeasible after replanning
- **FR-7.4**: For infeasible deadlines: alert with the conflicting tasks and a deprioritization suggestion (v1); data model supports future upgrade to detailed conflict analysis with resolution options (v2)

### FR-8: Analytics
- **FR-8.1**: Track task completion rates (completed on time, late, missed)
- **FR-8.2**: Track schedule utilization (scheduled hours vs. available hours)
- **FR-8.3**: Track estimation accuracy (estimated duration vs. actual duration)
- **FR-8.4**: Provide schedule health score (composite metric: overdue tasks, at-risk tasks, utilization balance)
- **FR-8.5**: Provide time allocation breakdown by category/tag
- **FR-8.6**: Track historical data for trends (weekly/monthly summaries)

### FR-9: MCP Server Interface
- **FR-9.1**: Expose tools via MCP protocol over stdio transport
- **FR-9.2**: Core tools: `create_task`, `get_task`, `update_task`, `delete_task`, `list_tasks`, `complete_task`
- **FR-9.3**: Event tools: `create_event`, `update_event`, `delete_event`, `list_events`
- **FR-9.4**: Schedule tools: `get_schedule` (by date range), `replan`, `get_conflicts`
- **FR-9.5**: Analytics tools: `get_productivity_stats`, `get_schedule_health`, `get_time_allocation`, `get_estimation_accuracy`
- **FR-9.6**: Configuration tools: `set_availability`, `set_focus_time`, `set_preferences`
- **FR-9.7**: All tools return structured JSON responses with consistent error formats
- **FR-9.8**: Background replan pattern — mutation tools (create/update/delete/complete, configuration changes) return immediately and trigger replan asynchronously; read tools (get_schedule, get_conflicts) return immediately with a `schedule_status` field ("up_to_date" or "replan_in_progress") and the last known schedule; the explicit `replan` tool is the only synchronous replan path
- **FR-9.9**: Replan debouncing — rapid sequential mutations coalesce into a single replan rather than running multiple concurrent replans

---

## 2. Non-Functional Requirements

### NFR-1: Performance
- **NFR-1.1**: Replan latency < 500ms for up to 200 active tasks
- **NFR-1.2**: Tool response time < 100ms for CRUD operations
- **NFR-1.3**: Database queries optimized with appropriate indexes

### NFR-2: Reliability
- **NFR-2.1**: All data mutations are transactional (SQLite ACID guarantees)
- **NFR-2.2**: Scheduler always produces a valid schedule (no overlapping tasks, respects all hard constraints)
- **NFR-2.3**: Graceful degradation: if constraint satisfaction fails, fall back to greedy scheduling with warning

### NFR-3: Data Integrity
- **NFR-3.1**: Local-first: all data stored in local SQLite database
- **NFR-3.2**: No external service dependencies for core functionality
- **NFR-3.3**: Database schema supports future migration to conflict analysis (FR-7.4 v2)

### NFR-4: Maintainability
- **NFR-4.1**: TypeScript with strict type checking
- **NFR-4.2**: Clear separation: storage layer, scheduling engine, MCP server layer
- **NFR-4.3**: Property-based tests for pure scheduling functions and serialization round-trips

### NFR-5: Usability (MCP Interface)
- **NFR-5.1**: Tool descriptions are clear enough for AI agents to use without documentation
- **NFR-5.2**: Consistent parameter naming and response formats across all tools
- **NFR-5.3**: Helpful error messages that guide the agent to correct usage

---

## 3. Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Language | TypeScript (Node.js) | Most common MCP server language, rich ecosystem |
| Storage | SQLite (better-sqlite3 or similar) | Embedded, ACID, great for structured scheduling data |
| MCP Transport | stdio | Simplest, works with Claude Desktop and most clients |
| Scheduling Algorithm | Constraint satisfaction | Balances intelligence with implementation complexity |
| External Calendar Integration | None (standalone) | Focused scope for v1 |
| User Model | Single user | Personal assistant, no multi-tenancy complexity |
| Conflict Handling | Alert + suggest (v1), detailed analysis (v2) | Fast v1, extensible data model |

---

## 4. Out of Scope (v1)

- External calendar integration (Google, Outlook, CalDAV)
- Multi-user / shared calendars
- Web dashboard or CLI interface
- HTTP/SSE transport
- Machine learning / pattern learning
- Rich dependencies (soft deps, milestones, parallel grouping)
- Security hardening (acceptable for local-first personal tool)

---

## 5. Extension Configuration

| Extension | Enabled | Decision |
|---|---|---|
| Security Baseline | No | Local-first personal tool, not production-grade |
| Property-Based Testing | Partial | PBT for pure scheduling functions and serialization round-trips only |
