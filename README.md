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
      "args": ["-y", "@fbdo/smart-agentic-calendar"],
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
      "args": ["-y", "@fbdo/smart-agentic-calendar"],
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
      "args": ["-y", "@fbdo/smart-agentic-calendar"],
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
npx -y @fbdo/smart-agentic-calendar
```

Or with a custom database path:

```bash
CALENDAR_DB_PATH=/path/to/calendar.db npx -y @fbdo/smart-agentic-calendar
```

The server reads JSON-RPC messages from stdin and writes responses to stdout. Diagnostic messages go to stderr.

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
LOG_LEVEL=debug npx -y @fbdo/smart-agentic-calendar

# Only errors and above
LOG_LEVEL=error npx -y @fbdo/smart-agentic-calendar

# Default (warning and above) — quiet operation
npx -y @fbdo/smart-agentic-calendar
```

In your MCP client config, add `LOG_LEVEL` to the `env` block:

```json
{
  "mcpServers": {
    "smart-agentic-calendar": {
      "command": "npx",
      "args": ["-y", "@fbdo/smart-agentic-calendar"],
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
