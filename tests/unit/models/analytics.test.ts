import { describe, it, expect } from "vitest";
import {
  type ProductivityStats,
  type ScheduleHealth,
  type EstimationAccuracy,
  type TimeAllocation,
} from "../../../src/models/analytics.js";

describe("Analytics types", () => {
  it("allows constructing ProductivityStats", () => {
    const stats: ProductivityStats = {
      period: "week",
      tasksCompleted: 10,
      tasksOverdue: 2,
      tasksCancelled: 1,
      completionRate: 76.9,
      onTimeRate: 80.0,
    };
    expect(stats.period).toBe("week");
    expect(stats.completionRate).toBeCloseTo(76.9);
  });

  it("allows constructing ScheduleHealth", () => {
    const health: ScheduleHealth = {
      healthScore: 85,
      utilizationPercentage: 72,
      overdueCount: 1,
      atRiskCount: 2,
      freeHoursThisWeek: 8,
      busiestDay: "Monday",
      lightestDay: "Friday",
    };
    expect(health.healthScore).toBe(85);
  });

  it("allows constructing EstimationAccuracy with nulls", () => {
    const accuracy: EstimationAccuracy = {
      averageAccuracyPercentage: null,
      overestimateCount: 0,
      underestimateCount: 0,
      averageOverestimateMinutes: null,
      averageUnderestimateMinutes: null,
      accuracyByCategory: null,
    };
    expect(accuracy.averageAccuracyPercentage).toBeNull();
  });

  it("allows constructing TimeAllocation", () => {
    const allocation: TimeAllocation = {
      period: "month",
      categories: [
        { category: "development", hours: 40, percentage: 50 },
        { category: "meetings", hours: 20, percentage: 25 },
      ],
    };
    expect(allocation.categories).toHaveLength(2);
  });
});
