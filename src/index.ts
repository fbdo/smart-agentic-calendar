#!/usr/bin/env node
import { Database } from "./storage/database.js";
import { TaskRepository } from "./storage/task-repository.js";
import { EventRepository } from "./storage/event-repository.js";
import { ConfigRepository } from "./storage/config-repository.js";
import { ScheduleRepository } from "./storage/schedule-repository.js";
import { AnalyticsRepository } from "./storage/analytics-repository.js";
import { RecurrenceRepository } from "./storage/recurrence-repository.js";
import { DependencyResolver } from "./engine/dependency-resolver.js";
import { ConflictDetector } from "./engine/conflict-detector.js";
import { Scheduler } from "./engine/scheduler.js";
import { RecurrenceManager } from "./engine/recurrence-manager.js";
import { ReplanCoordinator } from "./engine/replan-coordinator.js";
import { AnalyticsEngine } from "./analytics/analytics-engine.js";
import { TaskTools } from "./mcp/tools/task-tools.js";
import { EventTools } from "./mcp/tools/event-tools.js";
import { ScheduleTools } from "./mcp/tools/schedule-tools.js";
import { AnalyticsTools } from "./mcp/tools/analytics-tools.js";
import { ConfigTools } from "./mcp/tools/config-tools.js";
import { McpServer } from "./mcp/server.js";
import {
  AppLogger,
  createStderrTransport,
  createNoOpLogger,
  type Logger,
  type LoggingLevel,
} from "./common/logger.js";

export { createNoOpLogger } from "./common/logger.js";

export function getDbPath(): string {
  return process.env.CALENDAR_DB_PATH ?? "./calendar.db";
}

export function createApp(dbPath: string, logger?: Logger) {
  // 0. Logger (defaults to no-op if not provided)
  const log = logger ?? createNoOpLogger();

  // 1. Database
  const database = new Database(dbPath, log);

  // 2. Repositories
  const taskRepo = new TaskRepository(database, log);
  const eventRepo = new EventRepository(database, log);
  const configRepo = new ConfigRepository(database, log);
  const scheduleRepo = new ScheduleRepository(database, log);
  const analyticsRepo = new AnalyticsRepository(database, log);
  const recurrenceRepo = new RecurrenceRepository(database, log);

  // 3. Engine components
  const dependencyResolver = new DependencyResolver(log);
  const conflictDetector = new ConflictDetector(log);
  const scheduler = new Scheduler(
    taskRepo,
    eventRepo,
    configRepo,
    conflictDetector,
    dependencyResolver,
    scheduleRepo,
    log,
  );
  const recurrenceManager = new RecurrenceManager(recurrenceRepo, taskRepo, log);
  const replanCoordinator = new ReplanCoordinator(
    scheduler,
    scheduleRepo,
    taskRepo,
    configRepo,
    recurrenceManager,
    log,
  );

  // 4. Analytics
  const analyticsEngine = new AnalyticsEngine(
    analyticsRepo,
    taskRepo,
    scheduleRepo,
    configRepo,
    log,
  );

  // 5. MCP Tool handlers
  const taskTools = new TaskTools(
    taskRepo,
    recurrenceManager,
    dependencyResolver,
    replanCoordinator,
    log,
  );
  const eventTools = new EventTools(eventRepo, replanCoordinator, log);
  const scheduleTools = new ScheduleTools(
    scheduleRepo,
    taskRepo,
    configRepo,
    replanCoordinator,
    conflictDetector,
    log,
  );
  const analyticsTools = new AnalyticsTools(analyticsEngine, log);
  const configTools = new ConfigTools(configRepo, replanCoordinator, log);

  // 6. MCP Server
  const server = new McpServer(
    taskTools,
    eventTools,
    scheduleTools,
    analyticsTools,
    configTools,
    log,
  );

  return {
    server,
    database,
    taskTools,
    eventTools,
    scheduleTools,
    analyticsTools,
    configTools,
  };
}

// Entry point — start the server when run directly (not imported by tests)
if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  const dbPath = getDbPath();
  const logLevel = (process.env.LOG_LEVEL as LoggingLevel) ?? "warning";
  const appLogger = new AppLogger([createStderrTransport(logLevel)]);

  const { server } = createApp(dbPath, appLogger);
  server.start(appLogger).catch((error) => {
    appLogger.emergency("mcp", `Fatal: ${error}`);
    process.exit(1);
  });
}
