import { describe, it, expect, vi } from "vitest";
import { McpServer, wrapToolHandler } from "../../../src/mcp/server.js";
import { ValidationError, NotFoundError } from "../../../src/models/errors.js";
import { createNoOpLogger } from "../../../src/common/logger.js";
import type { TaskTools } from "../../../src/mcp/tools/task-tools.js";
import type { EventTools } from "../../../src/mcp/tools/event-tools.js";
import type { ScheduleTools } from "../../../src/mcp/tools/schedule-tools.js";
import type { AnalyticsTools } from "../../../src/mcp/tools/analytics-tools.js";
import type { ConfigTools } from "../../../src/mcp/tools/config-tools.js";

function createToolMocks() {
  const taskTools = {
    createTask: vi.fn().mockReturnValue({ task: { id: "t-1" } }),
    getTask: vi.fn().mockReturnValue({ task: { id: "t-1" } }),
    updateTask: vi.fn().mockReturnValue({ task: { id: "t-1" } }),
    completeTask: vi.fn().mockReturnValue({ task: { id: "t-1" } }),
    deleteTask: vi.fn().mockReturnValue({ task_id: "t-1" }),
    listTasks: vi.fn().mockReturnValue({ tasks: [], count: 0 }),
  } as unknown as TaskTools;

  const eventTools = {
    createEvent: vi.fn().mockReturnValue({ event: { id: "e-1" } }),
    updateEvent: vi.fn().mockReturnValue({ event: { id: "e-1" } }),
    deleteEvent: vi.fn().mockReturnValue({ event_id: "e-1" }),
    listEvents: vi.fn().mockReturnValue({ events: [], count: 0 }),
  } as unknown as EventTools;

  const scheduleTools = {
    getSchedule: vi.fn().mockReturnValue({ schedule: [], schedule_status: "up_to_date" }),
    replan: vi
      .fn()
      .mockResolvedValue({ schedule: [], conflicts: [], schedule_status: "up_to_date" }),
    getConflicts: vi.fn().mockReturnValue({ conflicts: [], schedule_status: "up_to_date" }),
  } as unknown as ScheduleTools;

  const analyticsTools = {
    getProductivityStats: vi.fn().mockReturnValue({ period: "week" }),
    getScheduleHealth: vi.fn().mockReturnValue({ health_score: 85 }),
    getEstimationAccuracy: vi.fn().mockReturnValue({ average_accuracy_percentage: 78 }),
    getTimeAllocation: vi.fn().mockReturnValue({ period: "week", categories: [] }),
  } as unknown as AnalyticsTools;

  const configTools = {
    setAvailability: vi.fn().mockReturnValue({ windows: [], message: "ok" }),
    setFocusTime: vi.fn().mockReturnValue({ blocks: [], message: "ok" }),
    setPreferences: vi.fn().mockReturnValue({ buffer_time_minutes: 15 }),
    getPreferences: vi.fn().mockReturnValue({ availability: [], focus_time: {}, preferences: {} }),
  } as unknown as ConfigTools;

  return { taskTools, eventTools, scheduleTools, analyticsTools, configTools };
}

describe("McpServer", () => {
  it("registers all 20 tools", () => {
    const mocks = createToolMocks();
    const server = new McpServer(
      mocks.taskTools,
      mocks.eventTools,
      mocks.scheduleTools,
      mocks.analyticsTools,
      mocks.configTools,
      createNoOpLogger(),
    );

    const toolNames = server.getToolNames();
    expect(toolNames).toHaveLength(21);
    expect(toolNames).toContain("create_task");
    expect(toolNames).toContain("get_task");
    expect(toolNames).toContain("update_task");
    expect(toolNames).toContain("complete_task");
    expect(toolNames).toContain("delete_task");
    expect(toolNames).toContain("list_tasks");
    expect(toolNames).toContain("create_event");
    expect(toolNames).toContain("update_event");
    expect(toolNames).toContain("delete_event");
    expect(toolNames).toContain("list_events");
    expect(toolNames).toContain("get_schedule");
    expect(toolNames).toContain("replan");
    expect(toolNames).toContain("get_conflicts");
    expect(toolNames).toContain("get_productivity_stats");
    expect(toolNames).toContain("get_schedule_health");
    expect(toolNames).toContain("get_estimation_accuracy");
    expect(toolNames).toContain("get_time_allocation");
    expect(toolNames).toContain("set_availability");
    expect(toolNames).toContain("set_focus_time");
    expect(toolNames).toContain("set_preferences");
    expect(toolNames).toContain("get_preferences");
  });
});

describe("wrapToolHandler", () => {
  it("success wrapper: returns content with JSON text", async () => {
    const handler = () => ({ id: "t-1", title: "Test" });
    const wrapped = wrapToolHandler(handler, "test_tool", createNoOpLogger());
    const result = await wrapped({});

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text)).toEqual({ id: "t-1", title: "Test" });
    expect(result.isError).toBeUndefined();
  });

  it("AppError (ValidationError) → isError: true with code and message", async () => {
    const handler = () => {
      throw new ValidationError("title is required");
    };
    const wrapped = wrapToolHandler(handler, "test_tool", createNoOpLogger());
    const result = await wrapped({});

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.message).toBe("title is required");
  });

  it("AppError (NotFoundError) → isError: true with code and message", async () => {
    const handler = () => {
      throw new NotFoundError("task", "abc-123");
    };
    const wrapped = wrapToolHandler(handler, "test_tool", createNoOpLogger());
    const result = await wrapped({});

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.code).toBe("NOT_FOUND");
    expect(body.message).toContain("not found");
  });

  it("unexpected Error → isError: true with INTERNAL_ERROR", async () => {
    const handler = () => {
      throw new Error("something broke");
    };
    const wrapped = wrapToolHandler(handler, "test_tool", createNoOpLogger());
    const result = await wrapped({});

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.message).toBe("an unexpected error occurred");
  });

  it("async handler (replan): awaits Promise before returning", async () => {
    const handler = async () => ({ schedule: [], schedule_status: "up_to_date" });
    const wrapped = wrapToolHandler(handler, "test_tool", createNoOpLogger());
    const result = await wrapped({});

    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.schedule_status).toBe("up_to_date");
  });
});
