import { describe, it, expect, vi } from "vitest";
import { AnalyticsTools } from "../../../src/mcp/tools/analytics-tools.js";
import type { AnalyticsEngine } from "../../../src/analytics/analytics-engine.js";
import { ValidationError } from "../../../src/models/errors.js";
import { createNoOpLogger } from "../../../src/common/logger.js";

function createMocks() {
  const analyticsEngine = {
    getProductivityStats: vi.fn().mockReturnValue({
      period: "week",
      tasksCompleted: 5,
      tasksOverdue: 1,
      tasksCancelled: 0,
      completionRate: 0.8,
      onTimeRate: 0.9,
    }),
    getScheduleHealth: vi.fn().mockReturnValue({
      healthScore: 85,
      utilizationPercentage: 70,
      overdueCount: 2,
      atRiskCount: 1,
      freeHoursThisWeek: 10,
      busiestDay: "Monday",
      lightestDay: "Friday",
    }),
    getEstimationAccuracy: vi.fn().mockReturnValue({
      averageAccuracyPercentage: 78,
      overestimateCount: 3,
      underestimateCount: 2,
      averageOverestimateMinutes: 15,
      averageUnderestimateMinutes: 10,
      accuracyByCategory: null,
    }),
    getTimeAllocation: vi.fn().mockReturnValue({
      period: "week",
      categories: [{ category: "work", hours: 20, percentage: 80 }],
    }),
  } as unknown as AnalyticsEngine;

  const tools = new AnalyticsTools(analyticsEngine, createNoOpLogger());
  return { tools, analyticsEngine };
}

describe("AnalyticsTools", () => {
  describe("getProductivityStats", () => {
    it("delegates to analyticsEngine, maps output to snake_case", () => {
      const { tools, analyticsEngine } = createMocks();
      const result = tools.getProductivityStats({ period: "week" });

      expect(analyticsEngine.getProductivityStats).toHaveBeenCalledWith("week");
      expect(result.tasks_completed).toBe(5);
      expect(result.on_time_rate).toBe(0.9);
    });

    it("invalid period: ValidationError propagated", () => {
      const { tools } = createMocks();
      expect(() => tools.getProductivityStats({ period: "century" })).toThrow(ValidationError);
    });
  });

  describe("getScheduleHealth", () => {
    it("delegates to analyticsEngine, maps output to snake_case", () => {
      const { tools, analyticsEngine } = createMocks();
      const result = tools.getScheduleHealth();

      expect(analyticsEngine.getScheduleHealth).toHaveBeenCalled();
      expect(result.health_score).toBe(85);
      expect(result.free_hours_this_week).toBe(10);
    });
  });

  describe("getEstimationAccuracy", () => {
    it("delegates to analyticsEngine, maps output to snake_case", () => {
      const { tools, analyticsEngine } = createMocks();
      const result = tools.getEstimationAccuracy({ period: "month" });

      expect(analyticsEngine.getEstimationAccuracy).toHaveBeenCalledWith("month");
      expect(result.average_accuracy_percentage).toBe(78);
    });

    it("invalid period: ValidationError propagated", () => {
      const { tools } = createMocks();
      expect(() => tools.getEstimationAccuracy({ period: "bad" })).toThrow(ValidationError);
    });
  });

  describe("getTimeAllocation", () => {
    it("delegates to analyticsEngine, maps output to snake_case", () => {
      const { tools, analyticsEngine } = createMocks();
      const result = tools.getTimeAllocation({ period: "week" });

      expect(analyticsEngine.getTimeAllocation).toHaveBeenCalledWith("week");
      expect(result.period).toBe("week");
      expect(result.categories[0].category).toBe("work");
    });

    it("invalid period: ValidationError propagated", () => {
      const { tools } = createMocks();
      expect(() => tools.getTimeAllocation({ period: "" })).toThrow(ValidationError);
    });
  });

  it("all methods: no replan triggered (no replanCoordinator dependency)", () => {
    // AnalyticsTools has no replanCoordinator — verified by constructor signature
    const { tools } = createMocks();
    expect(tools.getProductivityStats({ period: "day" })).toBeDefined();
    expect(tools.getScheduleHealth()).toBeDefined();
    expect(tools.getEstimationAccuracy({ period: "week" })).toBeDefined();
    expect(tools.getTimeAllocation({ period: "month" })).toBeDefined();
  });
});
