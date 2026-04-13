// eslint-disable-next-line sonarjs/deprecation -- Low-level Server is needed for setRequestHandler; McpServer has a different API
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { AppError } from "../models/errors.js";
import type { Logger } from "../common/logger.js";
import type { TaskTools } from "./tools/task-tools.js";
import type { EventTools } from "./tools/event-tools.js";
import type { ScheduleTools } from "./tools/schedule-tools.js";
import type { AnalyticsTools } from "./tools/analytics-tools.js";
import type { ConfigTools } from "./tools/config-tools.js";

const TASK_ID_DESCRIPTION = "Task ID (required)";
const PERIOD_ENUM = ["day", "week", "month"];
const ANALYSIS_PERIOD_DESCRIPTION = "Analysis period (required)";

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => unknown;
}

export function wrapToolHandler(
  handler: (input: Record<string, unknown>) => unknown,
  toolName: string,
  logger: Logger,
): (input: Record<string, unknown>) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}> {
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

export class McpServer {
  private readonly tools = new Map<string, ToolDefinition>();
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
    this.registerTaskTools(taskTools);
    this.registerEventTools(eventTools);
    this.registerScheduleTools(scheduleTools);
    this.registerAnalyticsTools(analyticsTools);
    this.registerConfigTools(configTools);
  }

  getToolNames(): string[] {
    return [...this.tools.keys()];
  }

  async start(): Promise<void> {
    // eslint-disable-next-line sonarjs/deprecation -- Low-level Server is needed for setRequestHandler
    const server = new Server(
      { name: "smart-agentic-calendar", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );

    const toolsArray = [...this.tools.values()];

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: toolsArray.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const tool = this.tools.get(toolName);
      if (!tool) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                code: "NOT_FOUND",
                message: `Unknown tool: ${toolName}`,
              }),
            },
          ],
          isError: true,
        };
      }

      const wrapped = wrapToolHandler(tool.handler, toolName, this.logger);
      return wrapped((request.params.arguments ?? {}) as Record<string, unknown>);
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write("Smart Agentic Calendar MCP server started\n");
  }

  private register(def: ToolDefinition): void {
    this.tools.set(def.name, def);
  }

  private registerTaskTools(t: TaskTools): void {
    this.register({
      name: "create_task",
      description:
        "Create a new task. Triggers background schedule replan. Required: title, estimated_duration. Optional: description, deadline, priority (P1-P4, default P3), category, tags, recurrence_rule, blocked_by.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title (required)" },
          description: { type: "string", description: "Task description (optional)" },
          estimated_duration: {
            type: "number",
            description: "Duration in minutes (required, positive integer)",
          },
          deadline: {
            type: "string",
            description: "ISO 8601 UTC datetime (optional)",
          },
          priority: {
            type: "string",
            enum: ["P1", "P2", "P3", "P4"],
            description: "Priority level (optional, default P3)",
          },
          category: { type: "string", description: "Task category (optional)" },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags (optional, default [])",
          },
          recurrence_rule: {
            type: "string",
            description: "RRULE string for recurring tasks (optional)",
          },
          blocked_by: {
            type: "array",
            items: { type: "string" },
            description: "Task IDs this task depends on (optional)",
          },
        },
        required: ["title", "estimated_duration"],
      },
      handler: (input) => t.createTask(input),
    });

    this.register({
      name: "update_task",
      description:
        "Update an existing task. Triggers background schedule replan. Required: task_id. At least one other field must be provided.",
      inputSchema: {
        type: "object",
        properties: {
          task_id: { type: "string", description: TASK_ID_DESCRIPTION },
          title: { type: "string" },
          description: { type: "string" },
          estimated_duration: { type: "number" },
          deadline: { type: "string" },
          priority: { type: "string", enum: ["P1", "P2", "P3", "P4"] },
          category: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          blocked_by: { type: "array", items: { type: "string" } },
        },
        required: ["task_id"],
      },
      handler: (input) => t.updateTask(input),
    });

    this.register({
      name: "complete_task",
      description:
        "Mark a task as completed. Records actual duration. Idempotent. Triggers background replan.",
      inputSchema: {
        type: "object",
        properties: {
          task_id: { type: "string", description: TASK_ID_DESCRIPTION },
          actual_duration_minutes: {
            type: "number",
            description: "Actual time spent in minutes (optional, defaults to estimated)",
          },
        },
        required: ["task_id"],
      },
      handler: (input) => t.completeTask(input),
    });

    this.register({
      name: "delete_task",
      description:
        "Cancel a task (soft delete). Returns affected dependent tasks. Triggers background replan.",
      inputSchema: {
        type: "object",
        properties: {
          task_id: { type: "string", description: TASK_ID_DESCRIPTION },
        },
        required: ["task_id"],
      },
      handler: (input) => t.deleteTask(input as { task_id: string }),
    });

    this.register({
      name: "list_tasks",
      description:
        "List tasks with optional filters. By default excludes cancelled tasks. No replan triggered.",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["pending", "scheduled", "completed", "cancelled", "at_risk"],
          },
          priority: { type: "string", enum: ["P1", "P2", "P3", "P4"] },
          deadline_before: { type: "string", description: "ISO 8601 datetime" },
          deadline_after: { type: "string", description: "ISO 8601 datetime" },
          category: { type: "string" },
        },
      },
      handler: (input) => t.listTasks(input),
    });
  }

  private registerEventTools(e: EventTools): void {
    this.register({
      name: "create_event",
      description:
        "Create a calendar event (timed or all-day). Triggers background replan. Required: title + (start_time & end_time) or (is_all_day & date).",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title (required)" },
          start_time: { type: "string", description: "ISO 8601 start (required for timed)" },
          end_time: { type: "string", description: "ISO 8601 end (required for timed)" },
          is_all_day: { type: "boolean", description: "All-day event flag (optional)" },
          date: { type: "string", description: "YYYY-MM-DD date (required for all-day)" },
        },
        required: ["title"],
      },
      handler: (input) => e.createEvent(input),
    });

    this.register({
      name: "update_event",
      description: "Update an existing event. Triggers background replan.",
      inputSchema: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "Event ID (required)" },
          title: { type: "string" },
          start_time: { type: "string" },
          end_time: { type: "string" },
          is_all_day: { type: "boolean" },
          date: { type: "string" },
        },
        required: ["event_id"],
      },
      handler: (input) => e.updateEvent(input),
    });

    this.register({
      name: "delete_event",
      description: "Delete an event. Triggers background replan.",
      inputSchema: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "Event ID (required)" },
        },
        required: ["event_id"],
      },
      handler: (input) => e.deleteEvent(input as { event_id: string }),
    });

    this.register({
      name: "list_events",
      description: "List events in a date range. No replan triggered.",
      inputSchema: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Start date (required)" },
          end_date: { type: "string", description: "End date (required)" },
        },
        required: ["start_date", "end_date"],
      },
      handler: (input) => e.listEvents(input as { start_date: string; end_date: string }),
    });
  }

  private registerScheduleTools(s: ScheduleTools): void {
    this.register({
      name: "get_schedule",
      description:
        "Get the current schedule with enriched time blocks. Returns schedule_status indicating if a replan is in progress. No replan triggered.",
      inputSchema: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Start date (required)" },
          end_date: { type: "string", description: "End date (required)" },
        },
        required: ["start_date", "end_date"],
      },
      handler: (input) => s.getSchedule(input as { start_date: string; end_date: string }),
    });

    this.register({
      name: "replan",
      description:
        "Trigger a synchronous replan. Waits for completion. Returns updated schedule and conflicts with schedule_status 'up_to_date'.",
      inputSchema: { type: "object", properties: {} },
      handler: () => s.replan(),
    });

    this.register({
      name: "get_conflicts",
      description:
        "Get current scheduling conflicts. Returns conflict details with deprioritization suggestions. No replan triggered.",
      inputSchema: { type: "object", properties: {} },
      handler: () => s.getConflicts(),
    });
  }

  private registerAnalyticsTools(a: AnalyticsTools): void {
    this.register({
      name: "get_productivity_stats",
      description: "Get task completion and on-time rates for a period. No replan triggered.",
      inputSchema: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: PERIOD_ENUM,
            description: ANALYSIS_PERIOD_DESCRIPTION,
          },
        },
        required: ["period"],
      },
      handler: (input) => a.getProductivityStats(input as { period: string }),
    });

    this.register({
      name: "get_schedule_health",
      description:
        "Get schedule health score, utilization, and risk indicators. No replan triggered.",
      inputSchema: { type: "object", properties: {} },
      handler: () => a.getScheduleHealth(),
    });

    this.register({
      name: "get_estimation_accuracy",
      description:
        "Get estimation accuracy metrics comparing estimated vs actual durations. No replan triggered.",
      inputSchema: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: PERIOD_ENUM,
            description: ANALYSIS_PERIOD_DESCRIPTION,
          },
        },
        required: ["period"],
      },
      handler: (input) => a.getEstimationAccuracy(input as { period: string }),
    });

    this.register({
      name: "get_time_allocation",
      description: "Get time allocation by category for a period. No replan triggered.",
      inputSchema: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: PERIOD_ENUM,
            description: ANALYSIS_PERIOD_DESCRIPTION,
          },
        },
        required: ["period"],
      },
      handler: (input) => a.getTimeAllocation(input as { period: string }),
    });
  }

  private registerConfigTools(c: ConfigTools): void {
    this.register({
      name: "set_availability",
      description:
        "Set weekly availability windows. Triggers background replan. Required: windows (non-empty array with day 0-6, start_time, end_time).",
      inputSchema: {
        type: "object",
        properties: {
          windows: {
            type: "array",
            items: {
              type: "object",
              properties: {
                day: { type: "number", description: "Day of week (0=Sun, 6=Sat)" },
                start_time: { type: "string", description: "HH:MM format" },
                end_time: { type: "string", description: "HH:MM format" },
              },
              required: ["day", "start_time", "end_time"],
            },
            description: "Availability windows (required, non-empty)",
          },
        },
        required: ["windows"],
      },
      handler: (input) =>
        c.setAvailability(
          input as { windows: { day: number; start_time: string; end_time: string }[] },
        ),
    });

    this.register({
      name: "set_focus_time",
      description:
        "Set focus time blocks. Triggers background replan. Required: blocks (non-empty array). Optional: minimum_block_minutes (15-120, default 60).",
      inputSchema: {
        type: "object",
        properties: {
          blocks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                day: { type: "number" },
                start_time: { type: "string" },
                end_time: { type: "string" },
              },
              required: ["day", "start_time", "end_time"],
            },
          },
          minimum_block_minutes: { type: "number", description: "Minimum block size (15-120)" },
        },
        required: ["blocks"],
      },
      handler: (input) =>
        c.setFocusTime(
          input as {
            blocks: { day: number; start_time: string; end_time: string }[];
            minimum_block_minutes?: number;
          },
        ),
    });

    this.register({
      name: "set_preferences",
      description:
        "Update scheduling preferences (partial merge). Triggers background replan. At least one field required.",
      inputSchema: {
        type: "object",
        properties: {
          buffer_time_minutes: { type: "number", description: "Buffer between tasks (>= 0)" },
          default_priority: { type: "string", enum: ["P1", "P2", "P3", "P4"] },
          default_duration: { type: "number", description: "Default task duration in minutes" },
          scheduling_horizon_weeks: { type: "number", description: "Scheduling horizon (1-12)" },
          minimum_block_minutes: { type: "number", description: "Min task block (15-120)" },
        },
      },
      handler: (input) => c.setPreferences(input),
    });

    this.register({
      name: "get_preferences",
      description:
        "Get full configuration including availability, focus time, and scheduling preferences. No replan triggered.",
      inputSchema: { type: "object", properties: {} },
      handler: () => c.getPreferences(),
    });
  }
}
