import { describe, it, expect, vi } from "vitest";
import { AllocationCalculator } from "../../../src/analytics/allocation.js";
import type { AnalyticsRepository } from "../../../src/storage/analytics-repository.js";
import type { CategorySummary } from "../../../src/models/analytics.js";

function mockAnalyticsRepo(categories: CategorySummary[] = []): AnalyticsRepository {
  return {
    getTasksByCategory: vi.fn().mockReturnValue(categories),
    getCompletedTasks: vi.fn().mockReturnValue([]),
    getOverdueTasks: vi.fn().mockReturnValue([]),
    getCancelledTasks: vi.fn().mockReturnValue([]),
    getDurationRecords: vi.fn().mockReturnValue([]),
  } as unknown as AnalyticsRepository;
}

const REF = new Date("2026-04-10T14:00:00.000Z");

describe("AllocationCalculator", () => {
  it("computes hours and percentages for multiple categories sorted by hours desc", () => {
    const categories: CategorySummary[] = [
      { category: "work", totalMinutes: 120, taskCount: 3 },
      { category: "personal", totalMinutes: 60, taskCount: 2 },
      { category: "admin", totalMinutes: 30, taskCount: 1 },
    ];

    const calc = new AllocationCalculator(mockAnalyticsRepo(categories));
    const result = calc.compute("week", REF);

    expect(result.period).toBe("week");
    expect(result.categories).toHaveLength(3);

    // Sorted by hours descending (already sorted from repo, but verify)
    expect(result.categories[0].category).toBe("work");
    expect(result.categories[0].hours).toBe(2); // 120/60
    expect(result.categories[0].percentage).toBeCloseTo(57.14, 1); // 120/210*100

    expect(result.categories[1].category).toBe("personal");
    expect(result.categories[1].hours).toBe(1); // 60/60
    expect(result.categories[1].percentage).toBeCloseTo(28.57, 1); // 60/210*100

    expect(result.categories[2].category).toBe("admin");
    expect(result.categories[2].hours).toBe(0.5); // 30/60
    expect(result.categories[2].percentage).toBeCloseTo(14.29, 1); // 30/210*100
  });

  it("returns 100% for single category", () => {
    const categories: CategorySummary[] = [{ category: "work", totalMinutes: 300, taskCount: 5 }];

    const calc = new AllocationCalculator(mockAnalyticsRepo(categories));
    const result = calc.compute("week", REF);

    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].category).toBe("work");
    expect(result.categories[0].hours).toBe(5);
    expect(result.categories[0].percentage).toBe(100);
  });

  it("handles uncategorized tasks", () => {
    const categories: CategorySummary[] = [
      { category: "uncategorized", totalMinutes: 90, taskCount: 3 },
    ];

    const calc = new AllocationCalculator(mockAnalyticsRepo(categories));
    const result = calc.compute("week", REF);

    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].category).toBe("uncategorized");
    expect(result.categories[0].percentage).toBe(100);
  });

  it("returns empty categories array when no data (EC-5)", () => {
    const calc = new AllocationCalculator(mockAnalyticsRepo([]));
    const result = calc.compute("week", REF);

    expect(result.period).toBe("week");
    expect(result.categories).toEqual([]);
  });

  it("passes correct date range to repository", () => {
    const getTasksByCategory = vi.fn().mockReturnValue([]);
    const repo = {
      getTasksByCategory,
      getCompletedTasks: vi.fn().mockReturnValue([]),
      getOverdueTasks: vi.fn().mockReturnValue([]),
      getCancelledTasks: vi.fn().mockReturnValue([]),
      getDurationRecords: vi.fn().mockReturnValue([]),
    } as unknown as AnalyticsRepository;

    const calc = new AllocationCalculator(repo);
    calc.compute("week", REF);

    expect(getTasksByCategory).toHaveBeenCalledWith(
      "2026-04-06T00:00:00.000Z",
      "2026-04-13T00:00:00.000Z",
    );
  });

  it("rounds hours to 2 decimal places and percentages to 2 decimal places", () => {
    const categories: CategorySummary[] = [
      { category: "work", totalMinutes: 100, taskCount: 2 }, // 1.67 hours
      { category: "admin", totalMinutes: 50, taskCount: 1 }, // 0.83 hours
    ];

    const calc = new AllocationCalculator(mockAnalyticsRepo(categories));
    const result = calc.compute("week", REF);

    expect(result.categories[0].hours).toBe(1.67); // 100/60 rounded
    expect(result.categories[1].hours).toBe(0.83); // 50/60 rounded
    expect(result.categories[0].percentage).toBe(66.67); // 100/150*100 rounded
    expect(result.categories[1].percentage).toBe(33.33); // 50/150*100 rounded
  });
});
