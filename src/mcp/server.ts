import { McpServer as SdkMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { AppError } from "../models/errors.js";
import type { Logger, AppLogger, LogTransport } from "../common/logger.js";
import type { TaskTools } from "./tools/task-tools.js";
import type { EventTools } from "./tools/event-tools.js";
import type { ScheduleTools } from "./tools/schedule-tools.js";
import type { AnalyticsTools } from "./tools/analytics-tools.js";
import type { ConfigTools } from "./tools/config-tools.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

function createMcpTransport(server: SdkMcpServer): LogTransport {
  return (level, logger, data) => {
    server.sendLoggingMessage({ level, logger, data });
  };
}

export function wrapToolHandler(
  handler: (input: Record<string, unknown>) => unknown,
  toolName: string,
  logger: Logger,
): (input: Record<string, unknown>) => Promise<CallToolResult> {
  return async (input) => {
    logger.debug("tools", { event: "tool_invoked", tool: toolName });
    try {
      let result = handler(input);
      if (result instanceof Promise) {
        result = await result;
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (error) {
      if (error instanceof AppError) {
        logger.debug("tools", {
          event: "tool_error",
          tool: toolName,
          code: error.code,
          message: error.message,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ code: error.code, message: error.message }),
            },
          ],
          isError: true,
        };
      }
      logger.error("tools", { event: "tool_unexpected_error", tool: toolName });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              code: "INTERNAL_ERROR",
              message: "an unexpected error occurred",
            }),
          },
        ],
        isError: true,
      };
    }
  };
}

const TASK_ID_DESCRIPTION = "Task ID (required)";
const PERIOD_SCHEMA = z.enum(["day", "week", "month"]).describe("Analysis period (required)");

export class McpServer {
  private readonly sdkServer: SdkMcpServer;
  private readonly toolNames: string[] = [];
  private readonly logger: Logger;

  constructor(
    taskTools: TaskTools,
    eventTools: EventTools,
    scheduleTools: ScheduleTools,
    analyticsTools: AnalyticsTools,
    configTools: ConfigTools,
    logger: Logger,
  ) {
    this.logger = logger;
    this.sdkServer = new SdkMcpServer(
      { name: "smart-agentic-calendar", version: "1.0.0" },
      { capabilities: { logging: {} } },
    );
    this.registerTaskTools(taskTools);
    this.registerEventTools(eventTools);
    this.registerScheduleTools(scheduleTools);
    this.registerAnalyticsTools(analyticsTools);
    this.registerConfigTools(configTools);
  }

  getToolNames(): string[] {
    return [...this.toolNames];
  }

  async start(appLogger?: AppLogger): Promise<void> {
    if (appLogger) {
      appLogger.addTransport(createMcpTransport(this.sdkServer));
    }

    const transport = new StdioServerTransport();
    await this.sdkServer.connect(transport);
    this.logger.info("mcp", "Smart Agentic Calendar MCP server started");
  }

  private registerTool(
    name: string,
    description: string,
    inputSchema: z.ZodObject<z.ZodRawShape>,
    handler: (input: Record<string, unknown>) => unknown,
  ): void {
    this.toolNames.push(name);
    const wrapped = wrapToolHandler(handler, name, this.logger);
    this.sdkServer.registerTool(name, { description, inputSchema }, async (args) => {
      return wrapped(args as Record<string, unknown>);
    });
  }

  private registerTaskTools(t: TaskTools): void {
    this.registerTool(
      "create_task",
      "Create a new task. Triggers background schedule replan. Required: title, estimated_duration. Optional: description, deadline, priority (P1-P4, default P3), category, tags, recurrence_rule, blocked_by.",
      z.object({
        title: z.string().describe("Task title (required)"),
        description: z.string().optional().describe("Task description (optional)"),
        estimated_duration: z.number().describe("Duration in minutes (required, positive integer)"),
        deadline: z
          .string()
          .optional()
          .describe("ISO 8601 UTC datetime ending in Z, e.g. 2026-06-01T17:30:00Z (optional)"),
        priority: z
          .enum(["P1", "P2", "P3", "P4"])
          .optional()
          .describe("Priority level (optional, default P3)"),
        category: z.string().optional().describe("Task category (optional)"),
        tags: z.array(z.string()).optional().describe("Tags (optional, default [])"),
        recurrence_rule: z
          .string()
          .optional()
          .describe("RRULE string for recurring tasks (optional)"),
        blocked_by: z
          .array(z.string())
          .optional()
          .describe("Task IDs this task depends on (optional)"),
      }),
      (input) => t.createTask(input),
    );

    this.registerTool(
      "update_task",
      "Update an existing task. Triggers background schedule replan. Required: task_id. At least one other field must be provided.",
      z.object({
        task_id: z.string().describe(TASK_ID_DESCRIPTION),
        title: z.string().optional(),
        description: z.string().optional(),
        estimated_duration: z
          .number()
          .optional()
          .describe("Duration in minutes (positive integer)"),
        deadline: z
          .string()
          .optional()
          .describe("ISO 8601 UTC datetime ending in Z, e.g. 2026-06-01T17:30:00Z"),
        priority: z.enum(["P1", "P2", "P3", "P4"]).optional(),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
        blocked_by: z.array(z.string()).optional(),
      }),
      (input) => t.updateTask(input),
    );

    this.registerTool(
      "complete_task",
      "Mark a task as completed. Records actual duration. Idempotent. Triggers background replan.",
      z.object({
        task_id: z.string().describe(TASK_ID_DESCRIPTION),
        actual_duration_minutes: z
          .number()
          .optional()
          .describe("Actual time spent in minutes (optional, defaults to estimated)"),
      }),
      (input) => t.completeTask(input),
    );

    this.registerTool(
      "delete_task",
      "Cancel a task (soft delete). Returns affected dependent tasks. Triggers background replan.",
      z.object({
        task_id: z.string().describe(TASK_ID_DESCRIPTION),
      }),
      (input) => t.deleteTask(input as { task_id: string }),
    );

    this.registerTool(
      "list_tasks",
      "List tasks with optional filters. By default excludes cancelled tasks. No replan triggered.",
      z.object({
        status: z.enum(["pending", "scheduled", "completed", "cancelled", "at_risk"]).optional(),
        priority: z.enum(["P1", "P2", "P3", "P4"]).optional(),
        deadline_before: z
          .string()
          .optional()
          .describe("ISO 8601 UTC datetime ending in Z, e.g. 2026-06-01T23:59:59Z"),
        deadline_after: z
          .string()
          .optional()
          .describe("ISO 8601 UTC datetime ending in Z, e.g. 2026-06-01T00:00:00Z"),
        category: z.string().optional(),
      }),
      (input) => t.listTasks(input),
    );
  }

  private registerEventTools(e: EventTools): void {
    this.registerTool(
      "create_event",
      "Create a calendar event (timed or all-day). Triggers background replan. Required: title + (start_time & end_time) or (is_all_day & date).",
      z.object({
        title: z.string().describe("Event title (required)"),
        start_time: z
          .string()
          .optional()
          .describe(
            "ISO 8601 UTC datetime ending in Z, e.g. 2026-06-01T09:00:00Z (required for timed)",
          ),
        end_time: z
          .string()
          .optional()
          .describe(
            "ISO 8601 UTC datetime ending in Z, e.g. 2026-06-01T10:00:00Z (required for timed)",
          ),
        is_all_day: z.boolean().optional().describe("All-day event flag (optional)"),
        date: z.string().optional().describe("YYYY-MM-DD date (required for all-day)"),
      }),
      (input) => e.createEvent(input),
    );

    this.registerTool(
      "update_event",
      "Update an existing event. Triggers background replan.",
      z.object({
        event_id: z.string().describe("Event ID (required)"),
        title: z.string().optional(),
        start_time: z
          .string()
          .optional()
          .describe("ISO 8601 UTC datetime ending in Z, e.g. 2026-06-01T09:00:00Z"),
        end_time: z
          .string()
          .optional()
          .describe("ISO 8601 UTC datetime ending in Z, e.g. 2026-06-01T10:00:00Z"),
        is_all_day: z.boolean().optional(),
        date: z.string().optional().describe("YYYY-MM-DD format, e.g. 2026-06-01"),
      }),
      (input) => e.updateEvent(input),
    );

    this.registerTool(
      "delete_event",
      "Delete an event. Triggers background replan.",
      z.object({
        event_id: z.string().describe("Event ID (required)"),
      }),
      (input) => e.deleteEvent(input as { event_id: string }),
    );

    this.registerTool(
      "list_events",
      "List events in a date range. No replan triggered.",
      z.object({
        start_date: z
          .string()
          .describe("Start date in YYYY-MM-DD format, e.g. 2026-06-01 (required)"),
        end_date: z.string().describe("End date in YYYY-MM-DD format, e.g. 2026-06-07 (required)"),
      }),
      (input) => e.listEvents(input as { start_date: string; end_date: string }),
    );
  }

  private registerScheduleTools(s: ScheduleTools): void {
    this.registerTool(
      "get_schedule",
      "Get the current schedule with enriched time blocks. Returns schedule_status indicating if a replan is in progress. No replan triggered.",
      z.object({
        start_date: z
          .string()
          .describe("Start date in YYYY-MM-DD format, e.g. 2026-06-01 (required)"),
        end_date: z.string().describe("End date in YYYY-MM-DD format, e.g. 2026-06-07 (required)"),
      }),
      (input) => s.getSchedule(input as { start_date: string; end_date: string }),
    );

    this.registerTool(
      "replan",
      "Trigger a synchronous replan. Waits for completion. Returns updated schedule and conflicts with schedule_status 'up_to_date'.",
      z.object({}),
      () => s.replan(),
    );

    this.registerTool(
      "get_conflicts",
      "Get current scheduling conflicts. Returns conflict details with deprioritization suggestions. No replan triggered.",
      z.object({}),
      () => s.getConflicts(),
    );
  }

  private registerAnalyticsTools(a: AnalyticsTools): void {
    this.registerTool(
      "get_productivity_stats",
      "Get task completion and on-time rates for a period. No replan triggered.",
      z.object({ period: PERIOD_SCHEMA }),
      (input) => a.getProductivityStats(input as { period: string }),
    );

    this.registerTool(
      "get_schedule_health",
      "Get schedule health score, utilization, and risk indicators. No replan triggered.",
      z.object({}),
      () => a.getScheduleHealth(),
    );

    this.registerTool(
      "get_estimation_accuracy",
      "Get estimation accuracy metrics comparing estimated vs actual durations. No replan triggered.",
      z.object({ period: PERIOD_SCHEMA }),
      (input) => a.getEstimationAccuracy(input as { period: string }),
    );

    this.registerTool(
      "get_time_allocation",
      "Get time allocation by category for a period. No replan triggered.",
      z.object({ period: PERIOD_SCHEMA }),
      (input) => a.getTimeAllocation(input as { period: string }),
    );
  }

  private registerConfigTools(c: ConfigTools): void {
    const dayTimeBlock = z.object({
      day: z.number().describe("Day of week (0=Sun, 6=Sat)"),
      start_time: z.string().describe("HH:MM format"),
      end_time: z.string().describe("HH:MM format"),
    });

    this.registerTool(
      "set_availability",
      "Set weekly availability windows. Triggers background replan. Required: windows (non-empty array with day 0-6, start_time, end_time).",
      z.object({
        windows: z.array(dayTimeBlock).describe("Availability windows (required, non-empty)"),
      }),
      (input) =>
        c.setAvailability(
          input as { windows: { day: number; start_time: string; end_time: string }[] },
        ),
    );

    this.registerTool(
      "set_focus_time",
      "Set focus time blocks. Triggers background replan. Required: blocks (non-empty array). Optional: minimum_block_minutes (15-120, default 60).",
      z.object({
        blocks: z.array(dayTimeBlock),
        minimum_block_minutes: z.number().optional().describe("Minimum block size (15-120)"),
      }),
      (input) =>
        c.setFocusTime(
          input as {
            blocks: { day: number; start_time: string; end_time: string }[];
            minimum_block_minutes?: number;
          },
        ),
    );

    this.registerTool(
      "set_preferences",
      "Update scheduling preferences (partial merge). Triggers background replan. At least one field required.",
      z.object({
        buffer_time_minutes: z.number().optional().describe("Buffer between tasks (>= 0)"),
        default_priority: z.enum(["P1", "P2", "P3", "P4"]).optional(),
        default_duration: z.number().optional().describe("Default task duration in minutes"),
        scheduling_horizon_weeks: z.number().optional().describe("Scheduling horizon (1-12)"),
        minimum_block_minutes: z.number().optional().describe("Min task block (15-120)"),
      }),
      (input) => c.setPreferences(input),
    );

    this.registerTool(
      "get_preferences",
      "Get full configuration including availability, focus time, and scheduling preferences. No replan triggered.",
      z.object({}),
      () => c.getPreferences(),
    );
  }
}
