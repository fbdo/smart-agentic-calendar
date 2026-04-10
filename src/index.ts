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

export function getDbPath(): string {
  return process.env.CALENDAR_DB_PATH ?? "./calendar.db";
}

export function createApp(dbPath: string) {
  // 1. Database
  const database = new Database(dbPath);

  // 2. Repositories
  const taskRepo = new TaskRepository(database);
  const eventRepo = new EventRepository(database);
  const configRepo = new ConfigRepository(database);
  const scheduleRepo = new ScheduleRepository(database);
  const analyticsRepo = new AnalyticsRepository(database);
  const recurrenceRepo = new RecurrenceRepository(database);

  // 3. Engine components
  const dependencyResolver = new DependencyResolver();
  const conflictDetector = new ConflictDetector();
  const scheduler = new Scheduler(
    taskRepo,
    eventRepo,
    configRepo,
    conflictDetector,
    dependencyResolver,
    scheduleRepo,
  );
  const recurrenceManager = new RecurrenceManager(recurrenceRepo, taskRepo);
  const replanCoordinator = new ReplanCoordinator(
    scheduler,
    scheduleRepo,
    taskRepo,
    configRepo,
    recurrenceManager,
  );

  // 4. Analytics
  const analyticsEngine = new AnalyticsEngine(analyticsRepo, taskRepo, scheduleRepo, configRepo);

  // 5. MCP Tool handlers
  const taskTools = new TaskTools(
    taskRepo,
    recurrenceManager,
    dependencyResolver,
    replanCoordinator,
  );
  const eventTools = new EventTools(eventRepo, replanCoordinator);
  const scheduleTools = new ScheduleTools(
    scheduleRepo,
    taskRepo,
    configRepo,
    replanCoordinator,
    conflictDetector,
  );
  const analyticsTools = new AnalyticsTools(analyticsEngine);
  const configTools = new ConfigTools(configRepo, replanCoordinator);

  // 6. MCP Server
  const server = new McpServer(taskTools, eventTools, scheduleTools, analyticsTools, configTools);

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
