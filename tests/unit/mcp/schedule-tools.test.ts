import { describe, it, expect, vi } from "vitest";
import { ScheduleTools } from "../../../src/mcp/tools/schedule-tools.js";
import type { ScheduleRepository } from "../../../src/storage/schedule-repository.js";
import type { TaskRepository } from "../../../src/storage/task-repository.js";
import type { ConfigRepository } from "../../../src/storage/config-repository.js";
import type { ReplanCoordinator } from "../../../src/engine/replan-coordinator.js";
import type { ConflictDetector } from "../../../src/engine/conflict-detector.js";
import type { Task } from "../../../src/models/task.js";
import type { TimeBlock } from "../../../src/models/schedule.js";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Test Task",
    description: null,
    duration: 60,
    deadline: null,
    priority: "P3",
    status: "pending",
    category: "work",
    tags: [],
    isRecurring: false,
    recurrenceTemplateId: null,
    actualDuration: null,
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
    ...overrides,
  };
}

function makeBlock(overrides: Partial<TimeBlock> = {}): TimeBlock {
  return {
    id: "block-1",
    taskId: "task-1",
    startTime: "2026-04-10T09:00:00.000Z",
    endTime: "2026-04-10T10:00:00.000Z",
    date: "2026-04-10",
    blockIndex: 0,
    totalBlocks: 1,
    ...overrides,
  };
}

function createMocks() {
  const scheduleRepo = {
    getSchedule: vi.fn().mockReturnValue([makeBlock()]),
  } as unknown as ScheduleRepository;

  const taskRepo = {
    findById: vi.fn().mockReturnValue(makeTask()),
    findAll: vi.fn().mockReturnValue([makeTask()]),
    getDependencies: vi.fn().mockReturnValue([]),
  } as unknown as TaskRepository;

  const configRepo = {
    getAvailability: vi.fn().mockReturnValue({ windows: [] }),
    getPreferences: vi.fn().mockReturnValue({
      bufferTimeMinutes: 15,
      defaultPriority: "P3",
      defaultDuration: 60,
      schedulingHorizonWeeks: 4,
      minimumBlockMinutes: 30,
    }),
  } as unknown as ConfigRepository;

  const replanCoordinator = {
    requestReplan: vi.fn(),
    getScheduleStatus: vi.fn().mockReturnValue("up_to_date"),
    awaitReplan: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReplanCoordinator;

  const conflictDetector = {
    detectConflicts: vi.fn().mockReturnValue([]),
  } as unknown as ConflictDetector;

  const tools = new ScheduleTools(
    scheduleRepo,
    taskRepo,
    configRepo,
    replanCoordinator,
    conflictDetector,
  );

  return { tools, scheduleRepo, taskRepo, configRepo, replanCoordinator, conflictDetector };
}

describe("ScheduleTools", () => {
  describe("getSchedule", () => {
    it("returns enriched time blocks with task details", () => {
      const { tools } = createMocks();
      const result = tools.getSchedule({
        start_date: "2026-04-10",
        end_date: "2026-04-17",
      });

      expect(result.schedule).toHaveLength(1);
      expect(result.schedule[0].task_title).toBe("Test Task");
      expect(result.schedule[0].task_priority).toBe("P3");
      expect(result.schedule[0].task_category).toBe("work");
      expect(result.schedule[0].task_status).toBe("pending");
    });

    it("schedule_status up_to_date: no message field", () => {
      const { tools } = createMocks();
      const result = tools.getSchedule({
        start_date: "2026-04-10",
        end_date: "2026-04-17",
      });

      expect(result.schedule_status).toBe("up_to_date");
      expect(result.message).toBeUndefined();
    });

    it("schedule_status replan_in_progress: includes message", () => {
      const { tools, replanCoordinator } = createMocks();
      (replanCoordinator.getScheduleStatus as ReturnType<typeof vi.fn>).mockReturnValue(
        "replan_in_progress",
      );

      const result = tools.getSchedule({
        start_date: "2026-04-10",
        end_date: "2026-04-17",
      });

      expect(result.schedule_status).toBe("replan_in_progress");
      expect(result.message).toContain("replan is currently in progress");
    });

    it("no replan triggered", () => {
      const { tools, replanCoordinator } = createMocks();
      tools.getSchedule({ start_date: "2026-04-10", end_date: "2026-04-17" });
      expect(replanCoordinator.requestReplan).not.toHaveBeenCalled();
    });

    it("empty schedule: returns empty array", () => {
      const { tools, scheduleRepo } = createMocks();
      (scheduleRepo.getSchedule as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const result = tools.getSchedule({
        start_date: "2026-04-10",
        end_date: "2026-04-17",
      });
      expect(result.schedule).toEqual([]);
    });
  });

  describe("replan", () => {
    it("awaits replanCoordinator.awaitReplan(), returns enriched schedule + conflicts", async () => {
      const { tools, replanCoordinator } = createMocks();
      const result = await tools.replan();

      expect(replanCoordinator.awaitReplan).toHaveBeenCalled();
      expect(result.schedule).toBeDefined();
      expect(result.conflicts).toBeDefined();
      expect(result.schedule_status).toBe("up_to_date");
      expect(result.message).toBe("Schedule replanned successfully");
    });
  });

  describe("getConflicts", () => {
    it("returns conflicts mapped to snake_case + schedule_status", () => {
      const { tools, conflictDetector } = createMocks();
      (conflictDetector.detectConflicts as ReturnType<typeof vi.fn>).mockReturnValue([
        {
          taskId: "t-1",
          reason: "overdue",
          deadline: "2026-04-09T00:00:00.000Z",
          requiredMinutes: 60,
          availableMinutes: 0,
          competingTaskIds: [],
          suggestions: [],
        },
      ]);

      const result = tools.getConflicts();

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].task_id).toBe("t-1");
      expect(result.schedule_status).toBe("up_to_date");
    });

    it("no conflicts: returns empty array", () => {
      const { tools } = createMocks();
      const result = tools.getConflicts();
      expect(result.conflicts).toEqual([]);
    });

    it("no replan triggered", () => {
      const { tools, replanCoordinator } = createMocks();
      tools.getConflicts();
      expect(replanCoordinator.requestReplan).not.toHaveBeenCalled();
    });
  });

  describe("enrichTimeBlocks", () => {
    it("batch lookup: multiple blocks with same taskId → single task lookup", () => {
      const { tools, scheduleRepo, taskRepo } = createMocks();
      (scheduleRepo.getSchedule as ReturnType<typeof vi.fn>).mockReturnValue([
        makeBlock({ id: "b-1", taskId: "task-1" }),
        makeBlock({ id: "b-2", taskId: "task-1" }),
      ]);

      tools.getSchedule({ start_date: "2026-04-10", end_date: "2026-04-17" });

      // findById should be called once for task-1, not twice
      const findByIdCalls = (taskRepo.findById as ReturnType<typeof vi.fn>).mock.calls;
      const taskIdCalls = findByIdCalls.filter((c) => c[0] === "task-1");
      expect(taskIdCalls).toHaveLength(1);
    });

    it("missing task: uses fallback values", () => {
      const { tools, taskRepo, scheduleRepo } = createMocks();
      (scheduleRepo.getSchedule as ReturnType<typeof vi.fn>).mockReturnValue([
        makeBlock({ taskId: "missing" }),
      ]);
      (taskRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const result = tools.getSchedule({ start_date: "2026-04-10", end_date: "2026-04-17" });

      expect(result.schedule[0].task_title).toBe("Unknown");
      expect(result.schedule[0].task_priority).toBe("P3");
      expect(result.schedule[0].task_category).toBeNull();
      expect(result.schedule[0].task_status).toBe("pending");
    });
  });
});
