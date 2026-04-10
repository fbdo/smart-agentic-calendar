import { describe, it, expect } from "vitest";
import { ConflictDetector } from "../../../src/engine/conflict-detector.js";
import type { Task } from "../../../src/models/task.js";
import type { TimeBlock } from "../../../src/models/schedule.js";
import type { Availability } from "../../../src/models/config.js";
import type { DependencyEdge } from "../../../src/models/dependency.js";

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: "Task",
    description: null,
    duration: 60,
    deadline: null,
    priority: "P3",
    status: "pending",
    category: null,
    tags: [],
    isRecurring: false,
    recurrenceTemplateId: null,
    actualDuration: null,
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
    ...overrides,
  };
}

function makeBlock(taskId: string, start: string, end: string, date: string): TimeBlock {
  return {
    id: `block-${taskId}-${date}`,
    taskId,
    startTime: start,
    endTime: end,
    date,
    blockIndex: 0,
    totalBlocks: 1,
  };
}

const weekdayAvailability: Availability = {
  windows: [
    { day: 1, startTime: "09:00", endTime: "17:00" },
    { day: 2, startTime: "09:00", endTime: "17:00" },
    { day: 3, startTime: "09:00", endTime: "17:00" },
    { day: 4, startTime: "09:00", endTime: "17:00" },
    { day: 5, startTime: "09:00", endTime: "17:00" },
  ],
};

describe("ConflictDetector", () => {
  const detector = new ConflictDetector();

  describe("detectConflicts", () => {
    it("detects overdue task (deadline in the past)", () => {
      const now = new Date("2026-04-10T12:00:00.000Z");
      const tasks = [
        makeTask({
          id: "overdue",
          deadline: "2026-04-09T17:00:00.000Z",
          duration: 120,
        }),
      ];
      const conflicts = detector.detectConflicts(tasks, [], weekdayAvailability, [], now);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].taskId).toBe("overdue");
      expect(conflicts[0].reason).toBe("overdue");
    });

    it("detects insufficient time when task is not fully scheduled", () => {
      const now = new Date("2026-04-10T09:00:00.000Z");
      const tasks = [
        makeTask({
          id: "big",
          duration: 480, // 8 hours
          deadline: "2026-04-10T17:00:00.000Z", // same day
          status: "pending",
        }),
      ];
      // Only 2 hours scheduled out of 8
      const blocks = [
        makeBlock("big", "2026-04-10T09:00:00.000Z", "2026-04-10T11:00:00.000Z", "2026-04-10"),
      ];
      const conflicts = detector.detectConflicts(tasks, blocks, weekdayAvailability, [], now);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].taskId).toBe("big");
      expect(conflicts[0].reason).toBe("insufficient_time");
      expect(conflicts[0].requiredMinutes).toBe(360); // 480 - 120 scheduled
    });

    it("returns empty when all tasks are fully scheduled", () => {
      const now = new Date("2026-04-10T09:00:00.000Z");
      const tasks = [
        makeTask({
          id: "ok",
          duration: 60,
          deadline: "2026-04-10T17:00:00.000Z",
        }),
      ];
      const blocks = [
        makeBlock("ok", "2026-04-10T09:00:00.000Z", "2026-04-10T10:00:00.000Z", "2026-04-10"),
      ];
      const conflicts = detector.detectConflicts(tasks, blocks, weekdayAvailability, [], now);
      expect(conflicts).toHaveLength(0);
    });

    it("skips completed tasks", () => {
      const now = new Date("2026-04-10T12:00:00.000Z");
      const tasks = [
        makeTask({
          id: "done",
          status: "completed",
          deadline: "2026-04-09T17:00:00.000Z", // past deadline, but completed
        }),
      ];
      const conflicts = detector.detectConflicts(tasks, [], weekdayAvailability, [], now);
      expect(conflicts).toHaveLength(0);
    });

    it("skips cancelled tasks", () => {
      const now = new Date("2026-04-10T12:00:00.000Z");
      const tasks = [
        makeTask({
          id: "nope",
          status: "cancelled",
          deadline: "2026-04-09T17:00:00.000Z",
        }),
      ];
      const conflicts = detector.detectConflicts(tasks, [], weekdayAvailability, [], now);
      expect(conflicts).toHaveLength(0);
    });

    it("handles tasks with no deadline (no conflict possible for deadline checks)", () => {
      const now = new Date("2026-04-10T09:00:00.000Z");
      const tasks = [makeTask({ id: "noDeadline", duration: 60, deadline: null })];
      // Unscheduled, but no deadline → no insufficient_time conflict for deadline
      const conflicts = detector.detectConflicts(tasks, [], weekdayAvailability, [], now);
      expect(conflicts).toHaveLength(0);
    });

    it("detects dependency chain infeasibility", () => {
      const now = new Date("2026-04-10T09:00:00.000Z");
      const tasks = [
        makeTask({ id: "A", duration: 240, status: "pending" }),
        makeTask({ id: "B", duration: 240, status: "pending" }),
        makeTask({
          id: "C",
          duration: 240,
          deadline: "2026-04-10T17:00:00.000Z", // 8 hours available, chain = 12 hours
          status: "pending",
        }),
      ];
      const deps: DependencyEdge[] = [
        { taskId: "B", dependsOnId: "A" },
        { taskId: "C", dependsOnId: "B" },
      ];
      const conflicts = detector.detectConflicts(tasks, [], weekdayAvailability, deps, now);
      const chainConflict = conflicts.find((c) => c.reason === "dependency_chain");
      expect(chainConflict).toBeDefined();
      expect(chainConflict!.taskId).toBe("C");
    });

    it("detects multiple conflict types simultaneously", () => {
      const now = new Date("2026-04-10T12:00:00.000Z");
      const tasks = [
        makeTask({ id: "overdue", deadline: "2026-04-09T00:00:00.000Z", duration: 60 }),
        makeTask({ id: "tight", deadline: "2026-04-10T13:00:00.000Z", duration: 480 }),
      ];
      const conflicts = detector.detectConflicts(tasks, [], weekdayAvailability, [], now);
      expect(conflicts).toHaveLength(2);
      expect(conflicts.map((c) => c.reason).sort((a, b) => a.localeCompare(b))).toEqual([
        "insufficient_time",
        "overdue",
      ]);
    });
  });

  describe("suggestDeprioritizations", () => {
    it("suggests lowest-priority tasks first (greedy)", () => {
      const atRiskTask = makeTask({
        id: "at-risk",
        priority: "P1",
        duration: 120,
        deadline: "2026-04-12T17:00:00.000Z",
      });
      const competingTasks = [
        {
          taskId: "p2",
          priority: "P2" as const,
          deadline: "2026-04-15T17:00:00.000Z",
          scheduledMinutes: 60,
        },
        {
          taskId: "p4",
          priority: "P4" as const,
          deadline: "2026-04-15T17:00:00.000Z",
          scheduledMinutes: 90,
        },
        {
          taskId: "p3",
          priority: "P3" as const,
          deadline: "2026-04-15T17:00:00.000Z",
          scheduledMinutes: 60,
        },
      ];
      const suggestions = detector.suggestDeprioritizations(atRiskTask, competingTasks, 120);
      // P4 first (90 min), then P3 (60 min) — total 150 >= 120, stop
      expect(suggestions).toHaveLength(2);
      expect(suggestions[0].taskId).toBe("p4");
      expect(suggestions[1].taskId).toBe("p3");
    });

    it("stops accumulating when enough time is freed", () => {
      const atRiskTask = makeTask({
        id: "at-risk",
        priority: "P1",
        duration: 60,
        deadline: "2026-04-12T17:00:00.000Z",
      });
      const competingTasks = [
        {
          taskId: "p4a",
          priority: "P4" as const,
          deadline: "2026-04-15T17:00:00.000Z",
          scheduledMinutes: 60,
        },
        {
          taskId: "p4b",
          priority: "P4" as const,
          deadline: "2026-04-15T17:00:00.000Z",
          scheduledMinutes: 60,
        },
      ];
      const suggestions = detector.suggestDeprioritizations(atRiskTask, competingTasks, 60);
      expect(suggestions).toHaveLength(1); // Only need one P4 task
    });

    it("filters out tasks with nearer deadline than at-risk task", () => {
      const atRiskTask = makeTask({
        id: "at-risk",
        priority: "P1",
        duration: 120,
        deadline: "2026-04-15T17:00:00.000Z",
      });
      const competingTasks = [
        {
          taskId: "nearer",
          priority: "P4" as const,
          deadline: "2026-04-12T17:00:00.000Z",
          scheduledMinutes: 120,
        },
        {
          taskId: "further",
          priority: "P4" as const,
          deadline: "2026-04-20T17:00:00.000Z",
          scheduledMinutes: 120,
        },
      ];
      const suggestions = detector.suggestDeprioritizations(atRiskTask, competingTasks, 120);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].taskId).toBe("further");
    });

    it("returns all candidates when not enough time can be freed (partial relief)", () => {
      const atRiskTask = makeTask({
        id: "at-risk",
        priority: "P1",
        duration: 480,
        deadline: "2026-04-15T17:00:00.000Z",
      });
      const competingTasks = [
        {
          taskId: "p4",
          priority: "P4" as const,
          deadline: "2026-04-20T17:00:00.000Z",
          scheduledMinutes: 60,
        },
      ];
      const suggestions = detector.suggestDeprioritizations(atRiskTask, competingTasks, 480);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].freedMinutes).toBe(60); // Partial relief
    });

    it("returns empty when no competing tasks exist", () => {
      const atRiskTask = makeTask({
        id: "at-risk",
        priority: "P1",
        duration: 120,
        deadline: "2026-04-15T17:00:00.000Z",
      });
      const suggestions = detector.suggestDeprioritizations(atRiskTask, [], 120);
      expect(suggestions).toHaveLength(0);
    });

    it("sorts by priority DESC then deadline DESC (furthest first)", () => {
      const atRiskTask = makeTask({
        id: "at-risk",
        priority: "P1",
        duration: 240,
        deadline: "2026-04-12T17:00:00.000Z",
      });
      const competingTasks = [
        {
          taskId: "p3-near",
          priority: "P3" as const,
          deadline: "2026-04-14T17:00:00.000Z",
          scheduledMinutes: 60,
        },
        {
          taskId: "p4-far",
          priority: "P4" as const,
          deadline: "2026-04-20T17:00:00.000Z",
          scheduledMinutes: 60,
        },
        {
          taskId: "p4-near",
          priority: "P4" as const,
          deadline: "2026-04-14T17:00:00.000Z",
          scheduledMinutes: 60,
        },
      ];
      const suggestions = detector.suggestDeprioritizations(atRiskTask, competingTasks, 240);
      // P4-far first (furthest deadline among P4), then P4-near, then P3-near
      expect(suggestions[0].taskId).toBe("p4-far");
      expect(suggestions[1].taskId).toBe("p4-near");
      expect(suggestions[2].taskId).toBe("p3-near");
    });
  });
});
