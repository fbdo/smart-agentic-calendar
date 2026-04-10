import { describe, it, expect, vi } from "vitest";
import { AnalyticsEngine } from "../../../src/analytics/analytics-engine.js";
import type { AnalyticsRepository } from "../../../src/storage/analytics-repository.js";
import type { TaskRepository } from "../../../src/storage/task-repository.js";
import type { ScheduleRepository } from "../../../src/storage/schedule-repository.js";
import type { ConfigRepository } from "../../../src/storage/config-repository.js";
import { ValidationError } from "../../../src/models/errors.js";
import type { UserConfig } from "../../../src/models/config.js";

const defaultConfig: UserConfig = {
  availability: {
    windows: [
      { day: 1, startTime: "09:00", endTime: "17:00" },
      { day: 2, startTime: "09:00", endTime: "17:00" },
      { day: 3, startTime: "09:00", endTime: "17:00" },
      { day: 4, startTime: "09:00", endTime: "17:00" },
      { day: 5, startTime: "09:00", endTime: "17:00" },
    ],
  },
  focusTime: { blocks: [], minimumBlockMinutes: 60 },
  preferences: {
    bufferTimeMinutes: 15,
    defaultPriority: "P3",
    defaultDuration: 60,
    schedulingHorizonWeeks: 4,
    minimumBlockMinutes: 15,
  },
};

function createEngine() {
  const analyticsRepo = {
    getCompletedTasks: vi.fn().mockReturnValue([]),
    getOverdueTasks: vi.fn().mockReturnValue([]),
    getCancelledTasks: vi.fn().mockReturnValue([]),
    getTasksByCategory: vi.fn().mockReturnValue([]),
    getDurationRecords: vi.fn().mockReturnValue([]),
  } as unknown as AnalyticsRepository;

  const taskRepo = {
    findAll: vi.fn().mockReturnValue([]),
  } as unknown as TaskRepository;

  const scheduleRepo = {
    getSchedule: vi.fn().mockReturnValue([]),
  } as unknown as ScheduleRepository;

  const configRepo = {
    getFullConfig: vi.fn().mockReturnValue(defaultConfig),
  } as unknown as ConfigRepository;

  return {
    engine: new AnalyticsEngine(analyticsRepo, taskRepo, scheduleRepo, configRepo),
    analyticsRepo,
    taskRepo,
    scheduleRepo,
    configRepo,
  };
}

const REF = new Date("2026-04-10T14:00:00.000Z");

describe("AnalyticsEngine", () => {
  it("getProductivityStats delegates to ProductivityCalculator", () => {
    const { engine, analyticsRepo } = createEngine();
    const result = engine.getProductivityStats("week", REF);

    expect(result.period).toBe("week");
    expect(result.tasksCompleted).toBe(0);
    expect(analyticsRepo.getCompletedTasks).toHaveBeenCalled();
  });

  it("getScheduleHealth delegates to HealthCalculator", () => {
    const { engine, configRepo } = createEngine();
    const result = engine.getScheduleHealth(REF);

    expect(result.healthScore).toBeDefined();
    expect(configRepo.getFullConfig).toHaveBeenCalled();
  });

  it("getEstimationAccuracy delegates to EstimationCalculator", () => {
    const { engine, analyticsRepo } = createEngine();
    const result = engine.getEstimationAccuracy("month", REF);

    expect(result.averageAccuracyPercentage).toBeNull();
    expect(analyticsRepo.getDurationRecords).toHaveBeenCalled();
  });

  it("getTimeAllocation delegates to AllocationCalculator", () => {
    const { engine, analyticsRepo } = createEngine();
    const result = engine.getTimeAllocation("day", REF);

    expect(result.period).toBe("day");
    expect(result.categories).toEqual([]);
    expect(analyticsRepo.getTasksByCategory).toHaveBeenCalled();
  });

  it("getProductivityStats throws ValidationError for invalid period", () => {
    const { engine } = createEngine();
    expect(() => engine.getProductivityStats("century" as never, REF)).toThrow(ValidationError);
    expect(() => engine.getProductivityStats("century" as never, REF)).toThrow(
      "invalid period: must be day, week, or month",
    );
  });

  it("getEstimationAccuracy throws ValidationError for invalid period", () => {
    const { engine } = createEngine();
    expect(() => engine.getEstimationAccuracy("yearly" as never, REF)).toThrow(ValidationError);
  });

  it("getTimeAllocation throws ValidationError for invalid period", () => {
    const { engine } = createEngine();
    expect(() => engine.getTimeAllocation("" as never, REF)).toThrow(ValidationError);
  });

  it("getScheduleHealth does not validate period (no period param)", () => {
    const { engine } = createEngine();
    // Should not throw — no period parameter to validate
    expect(() => engine.getScheduleHealth(REF)).not.toThrow();
  });
});
