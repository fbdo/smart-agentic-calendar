# Code Summary — Unit 5: MCP Server

## Source Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `src/mcp/validators.ts` | 572 | Input validation + snake_case↔camelCase mapping functions |
| `src/mcp/tools/task-tools.ts` | 220 | TaskTools — create, update, complete, delete, list tasks |
| `src/mcp/tools/event-tools.ts` | 71 | EventTools — create, update, delete, list events |
| `src/mcp/tools/schedule-tools.ts` | 161 | ScheduleTools — get_schedule, replan, get_conflicts + enrichment |
| `src/mcp/tools/analytics-tools.ts` | 39 | AnalyticsTools — productivity, health, estimation, allocation |
| `src/mcp/tools/config-tools.ts` | 73 | ConfigTools — set/get availability, focus time, preferences |
| `src/mcp/server.ts` | 489 | McpServer — tool registration, error wrapper, MCP SDK integration |
| `src/mcp/index.ts` | 6 | Barrel export for MCP module |
| `src/index.ts` | 87 | Composition root — DI wiring of all 19 components |

**Total source**: 9 files, 1,718 lines

## Test Files Created

| File | Lines | Tests | Purpose |
|------|-------|-------|---------|
| `tests/unit/mcp/validators.test.ts` | 756 | 62 | Input/output mapping + validation rules |
| `tests/unit/mcp/task-tools.test.ts` | 310 | 20 | TaskTools with mocked repos/engine |
| `tests/unit/mcp/event-tools.test.ts` | 139 | 8 | EventTools with mocked repos |
| `tests/unit/mcp/schedule-tools.test.ts` | 226 | 11 | ScheduleTools including enrichment + batch lookup |
| `tests/unit/mcp/analytics-tools.test.ts` | 110 | 8 | AnalyticsTools delegation and validation |
| `tests/unit/mcp/config-tools.test.ts` | 98 | 4 | ConfigTools set/get operations |
| `tests/unit/mcp/server.test.ts` | 145 | 6 | McpServer tool registration + error wrapping |
| `tests/unit/mcp/index.test.ts` | 42 | 4 | Composition root DI wiring verification |

**Total tests**: 8 files, 1,826 lines, **123 tests**

## Test Suite Summary

| Scope | Test Files | Tests |
|-------|-----------|-------|
| Unit 1: Foundation | 12 | 74 |
| Unit 2: Storage | 6 | 125 |
| Unit 3: Scheduling Engine | 8 | 145 |
| Unit 4: Analytics | 6 | 62 |
| **Unit 5: MCP Server** | **8** | **123** |
| **Total** | **40** | **536** |

## External Dependencies Added

- `@modelcontextprotocol/sdk` — MCP protocol SDK for tool registration and stdio transport

## Story Coverage

| Stories | Component |
|---------|-----------|
| 1.1, 1.2, 1.3, 1.4, 1.5, 4.1, 4.2 | TaskTools |
| 2.1 | EventTools |
| 3.1, 5.1 | ScheduleTools |
| 6.1, 6.2, 6.3, 6.4 | AnalyticsTools |
| 7.1, 7.2, 7.3 | ConfigTools |
| FR-9.1, FR-9.7, FR-9.8, NFR-5.1 | McpServer + error handling |

**17 of 18 stories implemented** (Story 3.3 is covered indirectly via ReplanCoordinator from Unit 3).

## Architecture Notes

- All tool handlers are thin orchestration wrappers — business logic lives in Units 2-4
- snake_case ↔ camelCase mapping is centralized in `validators.ts`
- Error handling via `wrapToolHandler` maps AppError subtypes to MCP `isError: true` responses
- Background replan pattern: mutations call `requestReplan()` and return immediately
- Schedule enrichment uses batch task lookups for performance
- Composition root creates all 19 components in strict dependency order
