# Smart Agentic Calendar

A local-first smart calendar MCP server for AI agents. Inspired by [Reclaim.ai](https://reclaim.ai/) and [Motion](https://www.usemotion.com/), it automatically re-plans tasks, recalculates the schedule, and helps AI agents act as personal scheduling assistants.

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

## Getting Started

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

## Connecting to an MCP-Compatible Agent

This server communicates over **stdio** using the [Model Context Protocol](https://modelcontextprotocol.io/). Any MCP-compatible client can connect to it by spawning the server as a subprocess.

### Configuration

The server accepts one environment variable:

| Variable | Default | Description |
|----------|---------|-------------|
| `CALENDAR_DB_PATH` | `./calendar.db` | Path to the SQLite database file |

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "smart-agentic-calendar": {
      "command": "npx",
      "args": ["-y", "smart-agentic-calendar"],
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
      "args": ["-y", "smart-agentic-calendar"],
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
      "args": ["-y", "smart-agentic-calendar"],
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
npx -y smart-agentic-calendar
```

Or with a custom database path:

```bash
CALENDAR_DB_PATH=/path/to/calendar.db npx -y smart-agentic-calendar
```

The server reads JSON-RPC messages from stdin and writes responses to stdout. Diagnostic messages go to stderr.

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

## Development

This project follows **test-driven development** (red-green-refactor) with a healthy test pyramid and dependency injection for testability. Property-based tests are used for pure scheduling functions and serialization round-trips.

## License

MIT
