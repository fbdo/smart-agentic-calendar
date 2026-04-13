# Smart Agentic Calendar

A local-first smart calendar MCP server for AI agents. Inspired by [Reclaim.ai](https://reclaim.ai/) and [Motion](https://www.usemotion.com/), it automatically re-plans tasks, recalculates the schedule, and helps AI agents act as personal scheduling assistants.

## Is This For You?

This project was designed with a specific set of trade-offs. Understanding them will help you decide if it fits your needs.

### What it is

- **A personal, single-user scheduling assistant.** One person, one calendar, one local database. Your data never leaves your machine.
- **An MCP server, not an app.** There is no web UI, no CLI dashboard, no REST API. The interface is an AI agent (like Claude) that calls structured tools over stdio. The agent *is* the UI.
- **A deterministic constraint solver, not machine learning.** The scheduler uses hard constraints (availability, deadlines, dependencies, events) and weighted soft constraints (priority, focus time alignment, energy matching, buffer gaps) to place tasks. It produces the same output given the same input — no training data, no model drift, no black box.
- **Optimized for a small task set.** The algorithm targets **< 500ms replan latency with up to ~200 active tasks**. It does a full reschedule of all flexible tasks on every change rather than incremental patching, which keeps the logic simple and deterministic. This works well for a personal workload but would not scale to thousands of tasks.
- **Local-first with SQLite.** All state lives in a single SQLite file using synchronous I/O (better-sqlite3). No network calls, no cloud services, no container infrastructure. Portable and private.
- **Background replanning with instant tool responses.** Mutations (create, update, delete) return immediately and trigger an async replan via `setImmediate`. Multiple rapid changes are debounced into a single replan cycle. Read tools report a `schedule_status` field so the agent knows if the schedule is stale.

### What it is not

- **Not a team or shared calendar.** There is no multi-tenancy, no user accounts, no access control. If you need shared scheduling across a team, this is not the right tool.
- **Not a Google/Outlook integration.** It does not sync with external calendar providers (Google Calendar, Outlook, CalDAV). Events are created directly through the MCP tools. External calendar sync is a potential v2 feature, not a v1 goal.
- **Not a web service.** There is no HTTP/SSE transport, no hosted version, no API gateway. It runs as a local Node.js process communicating over stdio.
- **Not an enterprise scheduler.** The full-reschedule approach and single-process SQLite architecture are deliberately simple. There is no caching layer (SQLite is fast enough locally), no distributed locking, no horizontal scaling. The design favors correctness and simplicity over throughput.
- **Not a learning system.** The scheduler does not learn from your habits or adjust weights over time. Priorities, deadlines, and constraints are explicit inputs — the algorithm is transparent and predictable.

## What It Does

- **Time-blocking scheduler** that assigns specific time slots to tasks based on deadlines, durations, and priorities (P1-P4)
- **Automatic replanning** triggered on any change (create, update, delete, complete) — runs in the background so tool responses are instant
- **Constraint satisfaction** engine that respects hard constraints (deadlines, availability, events, dependencies) and optimizes soft constraints (priority, focus time, buffer time)
- **Focus time protection** for deep work blocks with minimum uninterrupted duration enforcement
- **Task splitting** across multiple time slots when no single slot fits
- **Recurring tasks** with full RRULE support (daily, weekly, monthly, yearly, custom patterns)
- **Task dependencies** with cycle detection
- **Conflict detection** that identifies at-risk tasks and suggests deprioritizations
- **Analytics** — completion rates, schedule health, estimation accuracy, time allocation by category

## Connecting to an MCP-Compatible Agent

This server communicates over **stdio** using the [Model Context Protocol](https://modelcontextprotocol.io/). Any MCP-compatible client can connect to it by spawning the server as a subprocess.

### Configuration

The server accepts the following environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `CALENDAR_DB_PATH` | `./calendar.db` | Path to the SQLite database file |
| `LOG_LEVEL` | `warning` | Minimum severity for stderr output (see [Logging](#logging)) |

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "smart-agentic-calendar": {
      "command": "npx",
      "args": ["-y", "@fbdo/smart-agentic-calendar@latest"],
      "env": {
        "CALENDAR_DB_PATH": "/absolute/path/to/calendar.db"
      }
    }
  }
}
```

### Claude Code (CLI)

Add to your project's `.mcp.json` or global `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "smart-agentic-calendar": {
      "command": "npx",
      "args": ["-y", "@fbdo/smart-agentic-calendar@latest"],
      "env": {
        "CALENDAR_DB_PATH": "/absolute/path/to/calendar.db"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "smart-agentic-calendar": {
      "command": "npx",
      "args": ["-y", "@fbdo/smart-agentic-calendar@latest"],
      "env": {
        "CALENDAR_DB_PATH": "/absolute/path/to/calendar.db"
      }
    }
  }
}
```

### Any MCP Client (Generic)

Spawn the server as a child process with stdio transport:

```bash
npx -y @fbdo/smart-agentic-calendar@latest
```

Or with a custom database path:

```bash
CALENDAR_DB_PATH=/path/to/calendar.db npx -y @fbdo/smart-agentic-calendar@latest
```

The server reads JSON-RPC messages from stdin and writes responses to stdout. Diagnostic messages go to stderr.

## Usage Examples

The examples below show natural-language prompts you would give to an AI agent (like Claude) connected to this MCP server, along with the tool calls the agent makes and the responses it receives. The agent interprets these responses and presents them conversationally — you never see raw JSON yourself.

### 1. Configure Your Work Schedule

> **You:** Set my work hours to Monday through Friday, 9 AM to 5 PM.

The agent calls `set_availability`:

```json
{
  "windows": [
    { "day": 1, "start_time": "09:00", "end_time": "17:00" },
    { "day": 2, "start_time": "09:00", "end_time": "17:00" },
    { "day": 3, "start_time": "09:00", "end_time": "17:00" },
    { "day": 4, "start_time": "09:00", "end_time": "17:00" },
    { "day": 5, "start_time": "09:00", "end_time": "17:00" }
  ]
}
```

Response:

```json
{
  "windows": [
    { "day": 1, "start_time": "09:00", "end_time": "17:00" },
    { "day": 2, "start_time": "09:00", "end_time": "17:00" },
    { "day": 3, "start_time": "09:00", "end_time": "17:00" },
    { "day": 4, "start_time": "09:00", "end_time": "17:00" },
    { "day": 5, "start_time": "09:00", "end_time": "17:00" }
  ],
  "message": "Availability updated successfully"
}
```

### 2. Protect Deep Work Time

> **You:** I want focus time on Monday, Wednesday, and Friday mornings from 9 to 11 AM. Minimum 60-minute blocks.

The agent calls `set_focus_time`:

```json
{
  "blocks": [
    { "day": 1, "start_time": "09:00", "end_time": "11:00" },
    { "day": 3, "start_time": "09:00", "end_time": "11:00" },
    { "day": 5, "start_time": "09:00", "end_time": "11:00" }
  ],
  "minimum_block_minutes": 60
}
```

Response:

```json
{
  "blocks": [
    { "day": 1, "start_time": "09:00", "end_time": "11:00" },
    { "day": 3, "start_time": "09:00", "end_time": "11:00" },
    { "day": 5, "start_time": "09:00", "end_time": "11:00" }
  ],
  "minimum_block_minutes": 60,
  "message": "Focus time updated successfully"
}
```

### 3. Set Scheduling Preferences

> **You:** I'd like 15-minute buffers between tasks, a 2-week scheduling horizon, and minimum 25-minute blocks.

The agent calls `set_preferences`:

```json
{
  "buffer_time_minutes": 15,
  "default_priority": "P3",
  "default_duration": 30,
  "scheduling_horizon_weeks": 2,
  "minimum_block_minutes": 25
}
```

Response:

```json
{
  "buffer_time_minutes": 15,
  "default_priority": "P3",
  "default_duration": 30,
  "scheduling_horizon_weeks": 2,
  "minimum_block_minutes": 25
}
```

### 4. Review Your Full Configuration

> **You:** Show me my current calendar settings.

The agent calls `get_preferences` (no parameters):

```json
{
  "availability": [
    { "day": 1, "start_time": "09:00", "end_time": "17:00" },
    { "day": 2, "start_time": "09:00", "end_time": "17:00" },
    { "day": 3, "start_time": "09:00", "end_time": "17:00" },
    { "day": 4, "start_time": "09:00", "end_time": "17:00" },
    { "day": 5, "start_time": "09:00", "end_time": "17:00" }
  ],
  "focus_time": {
    "blocks": [
      { "day": 1, "start_time": "09:00", "end_time": "11:00" },
      { "day": 3, "start_time": "09:00", "end_time": "11:00" },
      { "day": 5, "start_time": "09:00", "end_time": "11:00" }
    ],
    "minimum_block_minutes": 60
  },
  "preferences": {
    "buffer_time_minutes": 15,
    "default_priority": "P3",
    "default_duration": 30,
    "scheduling_horizon_weeks": 2,
    "minimum_block_minutes": 25
  }
}
```

### 5. Create Tasks

> **You:** I need to write the Q2 project proposal — it'll take about 2 hours, due Friday at 5 PM. High priority. Also, I need to prepare slides for the sprint demo by Thursday at 2 PM, about an hour of work.

The agent calls `create_task` twice. First call:

```json
{
  "title": "Write Q2 project proposal",
  "description": "Draft the project proposal for the Q2 planning review",
  "estimated_duration": 120,
  "deadline": "2026-04-18T17:00:00Z",
  "priority": "P1",
  "category": "work",
  "tags": ["planning", "writing"]
}
```

Response:

```json
{
  "task": {
    "id": "a115d241-e8f8-4078-8ee5-7182ff04fa48",
    "title": "Write Q2 project proposal",
    "description": "Draft the project proposal for the Q2 planning review",
    "estimated_duration": 120,
    "deadline": "2026-04-18T17:00:00Z",
    "priority": "P1",
    "status": "pending",
    "category": "work",
    "tags": ["planning", "writing"],
    "is_recurring": false,
    "recurrence_template_id": null,
    "actual_duration": null,
    "created_at": "2026-04-13T08:36:22.887Z",
    "updated_at": "2026-04-13T08:36:22.887Z"
  }
}
```

Second call:

```json
{
  "title": "Prepare sprint demo",
  "estimated_duration": 60,
  "deadline": "2026-04-17T14:00:00Z",
  "priority": "P2",
  "category": "work",
  "tags": ["presentation"]
}
```

Response:

```json
{
  "task": {
    "id": "2f293125-8280-43d5-b183-f5be9e90e119",
    "title": "Prepare sprint demo",
    "estimated_duration": 60,
    "deadline": "2026-04-17T14:00:00Z",
    "priority": "P2",
    "status": "pending",
    "category": "work",
    "tags": ["presentation"],
    "is_recurring": false,
    "recurrence_template_id": null,
    "actual_duration": null,
    "created_at": "2026-04-13T08:36:22.908Z",
    "updated_at": "2026-04-13T08:36:22.908Z"
  }
}
```

Each `create_task` triggers a background replan — the scheduler automatically finds time slots for the new tasks.

### 6. Create Events

> **You:** Add a team standup on Monday at 2 PM for 30 minutes, and a sprint demo meeting on Thursday at 3 PM for an hour.

The agent calls `create_event` twice. First call:

```json
{
  "title": "Team standup",
  "start_time": "2026-04-14T14:00:00Z",
  "end_time": "2026-04-14T14:30:00Z"
}
```

Response:

```json
{
  "event": {
    "id": "e76cbe94-2f7e-4f7a-9a09-29370370fdad",
    "title": "Team standup",
    "start_time": "2026-04-14T14:00:00Z",
    "end_time": "2026-04-14T14:30:00Z",
    "is_all_day": false,
    "date": null,
    "created_at": "2026-04-13T08:36:22.932Z",
    "updated_at": "2026-04-13T08:36:22.932Z"
  }
}
```

Events block time on the calendar — the scheduler works around them when placing tasks.

### 7. View Your Schedule

> **You:** What does my week look like?

The agent calls `get_schedule`:

```json
{
  "start_date": "2026-04-14",
  "end_date": "2026-04-18"
}
```

Response:

```json
{
  "schedule": [
    {
      "id": "12c6493f-7e4d-4c4a-8084-85fcc36eeea3",
      "task_id": "a115d241-e8f8-4078-8ee5-7182ff04fa48",
      "start_time": "2026-04-14T09:00:00.000Z",
      "end_time": "2026-04-14T11:00:00.000Z",
      "date": "2026-04-14",
      "block_index": 0,
      "total_blocks": 1,
      "task_title": "Write Q2 project proposal",
      "task_priority": "P1",
      "task_category": "work",
      "task_status": "scheduled"
    },
    {
      "id": "0391fd94-6693-4139-812c-437b31988c12",
      "task_id": "2f293125-8280-43d5-b183-f5be9e90e119",
      "start_time": "2026-04-16T09:00:00.000Z",
      "end_time": "2026-04-16T10:00:00.000Z",
      "date": "2026-04-16",
      "block_index": 0,
      "total_blocks": 1,
      "task_title": "Prepare sprint demo",
      "task_priority": "P2",
      "task_category": "work",
      "task_status": "scheduled"
    }
  ],
  "schedule_status": "up_to_date"
}
```

The P1 proposal was placed in Monday's focus time block (9–11 AM), and the sprint demo prep was scheduled for Wednesday morning — both before their deadlines. The `schedule_status` field tells the agent whether the schedule reflects the latest changes.

### 8. Complete a Task

> **You:** I finished reviewing the pull requests. Took me about 35 minutes instead of the 45 I estimated.

The agent calls `complete_task`:

```json
{
  "task_id": "4acb7a3d-cc43-42cb-9aee-974b797d95ee",
  "actual_duration_minutes": 35
}
```

Response:

```json
{
  "task": {
    "id": "4acb7a3d-cc43-42cb-9aee-974b797d95ee",
    "title": "Review pull requests",
    "estimated_duration": 45,
    "deadline": "2026-04-15T17:00:00Z",
    "priority": "P2",
    "status": "completed",
    "category": "work",
    "tags": ["code-review"],
    "actual_duration": 35,
    "created_at": "2026-04-13T08:36:22.899Z",
    "updated_at": "2026-04-13T08:36:31.378Z"
  }
}
```

Recording actual duration feeds into estimation accuracy analytics. The scheduler replans in the background to reclaim the freed time.

### 9. Check Schedule Health

> **You:** How healthy is my schedule right now?

The agent calls `get_schedule_health` (no parameters):

```json
{
  "health_score": 90,
  "utilization_percentage": 10,
  "overdue_count": 0,
  "at_risk_count": 0,
  "free_hours_this_week": 36,
  "busiest_day": "Tuesday",
  "lightest_day": "Monday"
}
```

The health score (0–100) is a composite of utilization, overdue tasks, and at-risk tasks. A score of 90 with zero at-risk items means the schedule is in good shape.

### 10. View Productivity Stats

> **You:** How productive have I been this week?

The agent calls `get_productivity_stats`:

```json
{
  "period": "week"
}
```

Response:

```json
{
  "period": "week",
  "tasks_completed": 1,
  "tasks_overdue": 2,
  "tasks_cancelled": 0,
  "completion_rate": 33.33,
  "on_time_rate": 100
}
```

### 11. Check Time Allocation

> **You:** Where am I spending my time this week?

The agent calls `get_time_allocation`:

```json
{
  "period": "week"
}
```

Response:

```json
{
  "period": "week",
  "categories": [
    { "category": "work", "hours": 0.58, "percentage": 100 }
  ]
}
```

Time allocation breaks down scheduled hours by category, so you can see if your time distribution matches your priorities.

### 12. Review Estimation Accuracy

> **You:** How accurate are my time estimates?

The agent calls `get_estimation_accuracy`:

```json
{
  "period": "week"
}
```

Response:

```json
{
  "average_accuracy_percentage": 77.78,
  "overestimate_count": 1,
  "underestimate_count": 0,
  "average_overestimate_minutes": 10,
  "average_underestimate_minutes": null,
  "accuracy_by_category": {
    "work": 77.78
  }
}
```

This compares estimated vs. actual durations from completed tasks. In this case, the 45-minute estimate for PR review vs. 35 minutes actual shows a tendency to overestimate — useful feedback for calibrating future estimates.

### 13. Check for Conflicts

> **You:** Are there any scheduling conflicts I should worry about?

The agent calls `get_conflicts` (no parameters):

```json
{
  "conflicts": [],
  "schedule_status": "up_to_date"
}
```

An empty conflicts array means all tasks fit within available time before their deadlines. When conflicts exist, the response includes details about which tasks are at risk, why (insufficient time, dependency chains, or overdue), and suggestions for which lower-priority tasks to deprioritize to free up time.

## Logging

The server has two independent logging channels, each with its own level filtering:

### stderr (for operators and developers)

Controlled by the `LOG_LEVEL` environment variable. Set it to any [RFC 5424 syslog level](https://datatracker.ietf.org/doc/html/rfc5424#section-6.2.1):

| Level | Severity | What you'll see |
|-------|----------|----------------|
| `debug` | 0 | Everything — slot scoring, task ordering, DB operations |
| `info` | 1 | Significant operations — replan completed, server started, migrations applied |
| `notice` | 2 | Noteworthy but normal — graceful degradation after replan failure |
| `warning` | 3 | Potential issues — at-risk tasks, unknown tool invocations **(default)** |
| `error` | 4 | Handled failures — unexpected errors in tool execution |
| `critical` | 5 | Severe failures |
| `alert` | 6 | Immediate action required |
| `emergency` | 7 | System unusable — fatal startup errors |

**Examples:**

```bash
# Full diagnostics (all log output to stderr)
LOG_LEVEL=debug npx -y @fbdo/smart-agentic-calendar@latest

# Only errors and above
LOG_LEVEL=error npx -y @fbdo/smart-agentic-calendar@latest

# Default (warning and above) — quiet operation
npx -y @fbdo/smart-agentic-calendar@latest
```

In your MCP client config, add `LOG_LEVEL` to the `env` block:

```json
{
  "mcpServers": {
    "smart-agentic-calendar": {
      "command": "npx",
      "args": ["-y", "@fbdo/smart-agentic-calendar@latest"],
      "env": {
        "CALENDAR_DB_PATH": "/path/to/calendar.db",
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

### MCP protocol (for AI agents and MCP hosts)

The server advertises the MCP `logging` capability. MCP clients can control which log messages they receive by sending a `logging/setLevel` request — the SDK filters automatically. Log messages are sent as `notifications/message` with structured data:

```json
{
  "level": "info",
  "logger": "replan",
  "data": { "event": "replan_complete", "blocksCount": 12 }
}
```

The `logger` field identifies the component: `database`, `scheduler`, `replan`, `conflicts`, `dependencies`, `recurrence`, `tools`, `mcp`.

The two channels are independent — the MCP client can request `debug` while stderr stays at `warning`, or vice versa.

## MCP Tools

### Task Management
- `create_task` — create a task with title, duration, deadline, priority, category, tags
- `get_task` — retrieve a task by ID
- `update_task` — update any task field (triggers background replan)
- `delete_task` — soft-delete a task (triggers background replan)
- `complete_task` — mark a task done, optionally record actual duration
- `list_tasks` — query tasks with filters (status, priority, deadline range, category)

### Event Management
- `create_event` — create a fixed calendar event that blocks time
- `update_event` — modify an event
- `delete_event` — remove an event
- `list_events` — query events by date range

### Schedule & Conflicts
- `get_schedule` — view scheduled time blocks for a date range (returns `schedule_status`: "up_to_date" or "replan_in_progress")
- `replan` — force a synchronous replan (the only blocking replan path)
- `get_conflicts` — view at-risk tasks and deadline conflicts

### Analytics
- `get_productivity_stats` — completion rates, on-time rates by period
- `get_schedule_health` — composite health score, utilization, overdue/at-risk counts
- `get_time_allocation` — hours breakdown by category
- `get_estimation_accuracy` — estimated vs. actual duration analysis

### Configuration
- `set_availability` — define work hours per day of week
- `set_focus_time` — define focus/deep-work blocks
- `set_preferences` — buffer time, default priority, scheduling horizon, minimum block size
- `get_preferences` — retrieve current configuration

## Architecture

```
src/
  models/       Domain types (Task, Event, TimeBlock, Config, etc.)
  common/       Shared utilities (ID generation, time functions, constants)
  storage/      SQLite database layer (better-sqlite3)
  engine/       Scheduling engine, replanning, conflict detection, recurrence
  analytics/    Productivity stats, schedule health, estimation accuracy
  mcp/          MCP server and tool handlers
  index.ts      Composition root and entry point
```

Single-user, single-process, local-first. All data stored in a local SQLite database with no external service dependencies.

## Tech Stack

| Component | Choice |
|-----------|--------|
| Language | TypeScript (strict mode) |
| Runtime | Node.js >= 20 |
| Storage | SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| MCP Transport | stdio |
| Test Runner | [Vitest](https://vitest.dev/) |
| Scheduling | Constraint satisfaction algorithm |

## Development

This project follows **test-driven development** (red-green-refactor) with a healthy test pyramid and dependency injection for testability. Property-based tests are used for pure scheduling functions and serialization round-trips.

### Prerequisites

- Node.js >= 20

### Install and Build

```bash
npm install
npm run build
```

This compiles TypeScript to `dist/` and produces the runnable server at `dist/index.js`.

### Test

```bash
npm test              # run all tests (578 tests)
npm run test:watch    # watch mode
npm run test:coverage # with coverage
```

### Quality Checks

```bash
npm run lint          # eslint
npm run format:check  # prettier
npm run quality       # all checks (lint, format, duplication, unused code, dependency rules, security)
```

## License

MIT
