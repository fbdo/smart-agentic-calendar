import { describe, it, expect, vi } from "vitest";
import { ProductivityCalculator } from "../../../src/analytics/productivity.js";
import type { AnalyticsRepository } from "../../../src/storage/analytics-repository.js";
import type { CompletedTaskRecord } from "../../../src/models/analytics.js";
import type { Task } from "../../../src/models/task.js";

function makeCompletedRecord(
  overrides: Partial<CompletedTaskRecord> & { taskId: string },
): CompletedTaskRecord {
  return {
    title: "Task",
    category: null,
    estimatedDuration: 60,
    actualDuration: 55,
    completedAt: "2026-04-10T12:00:00.000Z",
    wasOnTime: true,
    ...overrides,
  };
}

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
    createdAt: "2026-04-06T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
    ...overrides,
  };
}

function mockAnalyticsRepo(overrides: Partial<AnalyticsRepository> = {}): AnalyticsRepository {
  return {
    getCompletedTasks: vi.fn().mockReturnValue([]),
    getOverdueTasks: vi.fn().mockReturnValue([]),
    getCancelledTasks: vi.fn().mockReturnValue([]),
    getTasksByCategory: vi.fn().mockReturnValue([]),
    getDurationRecords: vi.fn().mockReturnValue([]),
    ...overrides,
  } as unknown as AnalyticsRepository;
}

// Reference date: Friday 2026-04-10
// Week range: 2026-04-06T00:00:00.000Z to 2026-04-13T00:00:00.000Z
const REF = new Date("2026-04-10T14:00:00.000Z");

describe("ProductivityCalculator", () => {
  it("computes correct metrics for mixed resolved tasks", () => {
    const completed = [
      makeCompletedRecord({ taskId: "t1", wasOnTime: true }),
      makeCompletedRecord({ taskId: "t2", wasOnTime: true }),
      makeCompletedRecord({ taskId: "t3", wasOnTime: false }),
      makeCompletedRecord({ taskId: "t4", wasOnTime: true }),
      makeCompletedRecord({ taskId: "t5", wasOnTime: false }),
    ];
    const overdue = [
      makeTask({ id: "t6", deadline: "2026-04-08T17:00:00.000Z", status: "pending" }),
      makeTask({ id: "t7", deadline: "2026-04-09T17:00:00.000Z", status: "scheduled" }),
    ];
    const cancelled = [makeTask({ id: "t8", status: "cancelled" })];

    const repo = mockAnalyticsRepo({
      getCompletedTasks: vi.fn().mockReturnValue(completed),
      getOverdueTasks: vi.fn().mockReturnValue(overdue),
      getCancelledTasks: vi.fn().mockReturnValue(cancelled),
    });

    const calc = new ProductivityCalculator(repo);
    const result = calc.compute("week", REF);

    expect(result.period).toBe("week");
    expect(result.tasksCompleted).toBe(5);
    expect(result.tasksOverdue).toBe(2);
    expect(result.tasksCancelled).toBe(1);
    // 5 / (5 + 2 + 1) = 62.5%
    expect(result.completionRate).toBe(62.5);
  });

  it("computes on-time rate only from deadline-bearing completed tasks", () => {
    const completed = [
      makeCompletedRecord({
        taskId: "t1",
        wasOnTime: true,
        estimatedDuration: 60,
        completedAt: "2026-04-10T10:00:00.000Z",
      }),
      makeCompletedRecord({
        taskId: "t2",
        wasOnTime: true,
        estimatedDuration: 30,
        completedAt: "2026-04-10T11:00:00.000Z",
      }),
      makeCompletedRecord({
        taskId: "t3",
        wasOnTime: false,
        estimatedDuration: 45,
        completedAt: "2026-04-10T12:00:00.000Z",
      }),
    ];

    const repo = mockAnalyticsRepo({
      getCompletedTasks: vi.fn().mockReturnValue(completed),
    });

    const calc = new ProductivityCalculator(repo);
    const result = calc.compute("week", REF);

    // All 3 have wasOnTime set, so all count as having deadlines
    // 2 on time / 3 with deadline = 66.67%
    expect(result.onTimeRate).toBeCloseTo(66.67, 1);
  });

  it("returns all zeros when no resolved tasks exist (EC-1)", () => {
    const repo = mockAnalyticsRepo();
    const calc = new ProductivityCalculator(repo);
    const result = calc.compute("week", REF);

    expect(result.period).toBe("week");
    expect(result.tasksCompleted).toBe(0);
    expect(result.tasksOverdue).toBe(0);
    expect(result.tasksCancelled).toBe(0);
    expect(result.completionRate).toBe(0);
    expect(result.onTimeRate).toBe(0);
  });

  it("returns 100% on-time rate when all deadline tasks are on time", () => {
    const completed = [
      makeCompletedRecord({ taskId: "t1", wasOnTime: true }),
      makeCompletedRecord({ taskId: "t2", wasOnTime: true }),
    ];

    const repo = mockAnalyticsRepo({
      getCompletedTasks: vi.fn().mockReturnValue(completed),
    });

    const calc = new ProductivityCalculator(repo);
    const result = calc.compute("week", REF);

    expect(result.onTimeRate).toBe(100);
  });

  it("returns 0% on-time rate when no completed tasks had deadlines", () => {
    // wasOnTime is derived from deadline existence in the repo query
    // If no completed tasks have deadlines, the repo returns them with wasOnTime based on deadline presence
    // For this test, simulate completed tasks that had no deadline (wasOnTime defaults but no deadline)
    // The on-time denominator is tasks with wasOnTime that had a deadline
    // Since CompletedTaskRecord doesn't carry the deadline field, we use a different approach:
    // If ALL wasOnTime are false and there are no deadline-bearing tasks, onTimeRate = 0

    // Actually, the repo marks wasOnTime based on deadline presence:
    // CASE WHEN deadline IS NOT NULL AND updated_at <= deadline THEN 1 ELSE 0 END
    // Tasks with no deadline get wasOnTime = 0
    // But we can't distinguish "no deadline" from "late" via wasOnTime alone
    // We need to check: does the completed task have a non-null deadline?
    // The CompletedTaskRecord doesn't carry deadline — but the repo query marks wasOnTime = 0 for no-deadline tasks
    // For on-time rate, we need to count tasks that HAD deadlines

    // Since the current model doesn't distinguish, the calculator should count
    // wasOnTime=true as "had deadline AND was on time"
    // For tasks with no deadline, wasOnTime=false (from the SQL)
    // So onTimeCount / completedCount where wasOnTime is relevant

    // For this test: all completed tasks have no deadline → wasOnTime=false for all → onTimeRate = 0
    const completed = [
      makeCompletedRecord({ taskId: "t1", wasOnTime: false }),
      makeCompletedRecord({ taskId: "t2", wasOnTime: false }),
    ];

    const repo = mockAnalyticsRepo({
      getCompletedTasks: vi.fn().mockReturnValue(completed),
    });

    const calc = new ProductivityCalculator(repo);
    const result = calc.compute("week", REF);

    expect(result.onTimeRate).toBe(0);
  });

  it("passes correct date range to repository methods", () => {
    const getCompletedTasks = vi.fn().mockReturnValue([]);
    const getOverdueTasks = vi.fn().mockReturnValue([]);
    const getCancelledTasks = vi.fn().mockReturnValue([]);

    const repo = mockAnalyticsRepo({ getCompletedTasks, getOverdueTasks, getCancelledTasks });
    const calc = new ProductivityCalculator(repo);
    calc.compute("week", REF);

    // Week of 2026-04-10 (Friday) → Mon 2026-04-06 to Mon 2026-04-13
    expect(getCompletedTasks).toHaveBeenCalledWith(
      "2026-04-06T00:00:00.000Z",
      "2026-04-13T00:00:00.000Z",
    );
    expect(getOverdueTasks).toHaveBeenCalledWith("2026-04-13T00:00:00.000Z");
    expect(getCancelledTasks).toHaveBeenCalledWith(
      "2026-04-06T00:00:00.000Z",
      "2026-04-13T00:00:00.000Z",
    );
  });

  it("filters overdue tasks to those with deadline in period range", () => {
    const overdue = [
      makeTask({ id: "t1", deadline: "2026-04-08T17:00:00.000Z" }), // in range
      makeTask({ id: "t2", deadline: "2026-04-01T17:00:00.000Z" }), // before range
    ];

    const repo = mockAnalyticsRepo({
      getOverdueTasks: vi.fn().mockReturnValue(overdue),
    });

    const calc = new ProductivityCalculator(repo);
    const result = calc.compute("week", REF);

    // Only t1 has deadline in [2026-04-06, 2026-04-13)
    expect(result.tasksOverdue).toBe(1);
  });
});
