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
import { createNoOpLogger } from "./common/logger.js";

export function getDbPath(): string {
  return process.env.CALENDAR_DB_PATH ?? "./calendar.db";
}

export function createApp(dbPath: string) {
  // 0. Logger (temporary no-op until Task 6 wires real logger)
  const logger = createNoOpLogger();

  // 1. Database
  const database = new Database(dbPath, logger);

  // 2. Repositories
  const taskRepo = new TaskRepository(database, logger);
  const eventRepo = new EventRepository(database, logger);
  const configRepo = new ConfigRepository(database, logger);
  const scheduleRepo = new ScheduleRepository(database, logger);
  const analyticsRepo = new AnalyticsRepository(database, logger);
  const recurrenceRepo = new RecurrenceRepository(database, logger);

  // 3. Engine components
  const dependencyResolver = new DependencyResolver(logger);
  const conflictDetector = new ConflictDetector(logger);
  const scheduler = new Scheduler(
    taskRepo,
    eventRepo,
    configRepo,
    conflictDetector,
    dependencyResolver,
    scheduleRepo,
    logger,
  );
  const recurrenceManager = new RecurrenceManager(recurrenceRepo, taskRepo, logger);
  const replanCoordinator = new ReplanCoordinator(
    scheduler,
    scheduleRepo,
    taskRepo,
    configRepo,
    recurrenceManager,
    logger,
  );

  // 4. Analytics
  const analyticsEngine = new AnalyticsEngine(
    analyticsRepo,
    taskRepo,
    scheduleRepo,
    configRepo,
    logger,
  );

  // 5. MCP Tool handlers
  const taskTools = new TaskTools(
    taskRepo,
    recurrenceManager,
    dependencyResolver,
    replanCoordinator,
    logger,
  );
  const eventTools = new EventTools(eventRepo, replanCoordinator, logger);
  const scheduleTools = new ScheduleTools(
    scheduleRepo,
    taskRepo,
    configRepo,
    replanCoordinator,
    conflictDetector,
    logger,
  );
  const analyticsTools = new AnalyticsTools(analyticsEngine, logger);
  const configTools = new ConfigTools(configRepo, replanCoordinator, logger);

  // 6. MCP Server
  const server = new McpServer(
    taskTools,
    eventTools,
    scheduleTools,
    analyticsTools,
    configTools,
    logger,
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
  const { server } = createApp(dbPath);
  server.start().catch((error) => {
    process.stderr.write(`Fatal: ${error}\n`);
    process.exit(1);
  });
}
