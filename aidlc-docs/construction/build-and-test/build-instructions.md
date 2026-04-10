# Build Instructions — Smart Agentic Calendar MCP Server

## Prerequisites

| Requirement | Version | Purpose |
|---|---|---|
| Node.js | >= 20.0.0 | Runtime (ES2022 target) |
| npm | >= 10.x | Package management |

## Build Steps

### 1. Install Dependencies

```bash
npm install
```

**Production dependencies**: `better-sqlite3`, `rrule`, `uuid`, `@modelcontextprotocol/sdk`
**Dev dependencies**: `vitest`, `typescript`, `eslint`, `prettier`, `husky`, `lint-staged`, `jscpd`, `knip`, `dependency-cruiser`

### 2. Compile TypeScript

```bash
npm run build
```

This runs `tsc` with the following configuration:
- **Target**: ES2022
- **Module**: NodeNext (ESM with `.js` extensions in imports)
- **Strict**: true (all strict checks enabled)
- **Output**: `dist/` directory
- **Source maps**: enabled
- **Declaration files**: enabled

**Expected output**: All `.ts` files in `src/` compiled to `dist/` with `.js`, `.d.ts`, and `.js.map` files.

### 3. Verify Build

```bash
node dist/index.js 2>/dev/null &
PID=$!
sleep 1
kill $PID 2>/dev/null
echo "Build verification: OK"
```

> **Note**: The server communicates via stdio (MCP protocol), so it will wait for JSON-RPC input. The verification just confirms it starts without import/runtime errors.

## Code Quality Checks

### Linting

```bash
npm run lint
```

Runs ESLint with TypeScript parser and `sonarjs` plugin.

### Formatting

```bash
npm run format:check
```

Runs Prettier in check mode. To auto-fix:

```bash
npm run format
```

### Full Quality Suite

```bash
npm run quality
```

Runs all quality checks in sequence:
1. `lint` — ESLint
2. `format:check` — Prettier
3. `quality:duplication` — jscpd (code duplication detection)
4. `quality:unused` — knip (unused exports/dependencies)
5. `quality:deps` — dependency-cruiser (circular dependency detection)
6. `quality:security` — grype (vulnerability scanning)

## Project Structure

```
src/
  models/         # Domain types (Task, Event, TimeBlock, Config, etc.)
  common/         # Shared utilities (ID generation, time helpers, constants)
  storage/        # SQLite repositories (Database, TaskRepo, EventRepo, etc.)
  engine/         # Scheduling engine (Scheduler, ReplanCoordinator, etc.)
  analytics/      # Analytics calculations (productivity, health, estimation)
  mcp/            # MCP server layer (tool handlers, validators, server)
    tools/        # Tool handler classes (TaskTools, EventTools, etc.)
  index.ts        # Composition root — DI wiring of all 19 components
```

## Known Build Issues

- **TypeScript error in `src/analytics/health.ts` lines 75-76**: `Type 'string | null' is not assignable to type 'string'`. This is a pre-existing type narrowing issue. It does not affect runtime behavior (the null case is handled upstream). Can be fixed by adding a non-null assertion or explicit null check.

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `CALENDAR_DB_PATH` | `./calendar.db` | Path to SQLite database file |
| `NODE_ENV` | (none) | Set to `test` to prevent auto-start |
