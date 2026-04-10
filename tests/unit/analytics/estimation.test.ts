import { describe, it, expect, vi } from "vitest";
import { EstimationCalculator } from "../../../src/analytics/estimation.js";
import type { AnalyticsRepository } from "../../../src/storage/analytics-repository.js";
import type { DurationRecord } from "../../../src/models/analytics.js";

function makeRecord(overrides: Partial<DurationRecord> & { taskId: string }): DurationRecord {
  return {
    category: null,
    estimatedMinutes: 60,
    actualMinutes: 60,
    ...overrides,
  };
}

function mockAnalyticsRepo(records: DurationRecord[] = []): AnalyticsRepository {
  return {
    getDurationRecords: vi.fn().mockReturnValue(records),
    getCompletedTasks: vi.fn().mockReturnValue([]),
    getOverdueTasks: vi.fn().mockReturnValue([]),
    getCancelledTasks: vi.fn().mockReturnValue([]),
    getTasksByCategory: vi.fn().mockReturnValue([]),
  } as unknown as AnalyticsRepository;
}

const REF = new Date("2026-04-10T14:00:00.000Z");

describe("EstimationCalculator", () => {
  it("returns 100% accuracy for perfect estimates", () => {
    const records = [
      makeRecord({ taskId: "t1", estimatedMinutes: 60, actualMinutes: 60 }),
      makeRecord({ taskId: "t2", estimatedMinutes: 30, actualMinutes: 30 }),
    ];

    const calc = new EstimationCalculator(mockAnalyticsRepo(records));
    const result = calc.compute("week", REF);

    expect(result.averageAccuracyPercentage).toBe(100);
    expect(result.overestimateCount).toBe(0);
    expect(result.underestimateCount).toBe(0);
  });

  it("computes deviation-based accuracy for mixed estimates", () => {
    const records = [
      makeRecord({ taskId: "t1", estimatedMinutes: 60, actualMinutes: 90 }), // |90-60|/60 = 50% dev → 50% accuracy
      makeRecord({ taskId: "t2", estimatedMinutes: 60, actualMinutes: 60 }), // 0% dev → 100% accuracy
    ];

    const calc = new EstimationCalculator(mockAnalyticsRepo(records));
    const result = calc.compute("week", REF);

    // Average: (50 + 100) / 2 = 75
    expect(result.averageAccuracyPercentage).toBe(75);
  });

  it("classifies overestimates correctly", () => {
    const records = [
      makeRecord({ taskId: "t1", estimatedMinutes: 120, actualMinutes: 60 }), // overestimate by 60min
      makeRecord({ taskId: "t2", estimatedMinutes: 90, actualMinutes: 50 }), // overestimate by 40min
    ];

    const calc = new EstimationCalculator(mockAnalyticsRepo(records));
    const result = calc.compute("week", REF);

    expect(result.overestimateCount).toBe(2);
    expect(result.underestimateCount).toBe(0);
    expect(result.averageOverestimateMinutes).toBe(50); // (60+40)/2
    expect(result.averageUnderestimateMinutes).toBeNull();
  });

  it("classifies underestimates correctly", () => {
    const records = [
      makeRecord({ taskId: "t1", estimatedMinutes: 30, actualMinutes: 50 }), // underestimate by 20min
      makeRecord({ taskId: "t2", estimatedMinutes: 60, actualMinutes: 100 }), // underestimate by 40min
    ];

    const calc = new EstimationCalculator(mockAnalyticsRepo(records));
    const result = calc.compute("week", REF);

    expect(result.overestimateCount).toBe(0);
    expect(result.underestimateCount).toBe(2);
    expect(result.averageOverestimateMinutes).toBeNull();
    expect(result.averageUnderestimateMinutes).toBe(30); // (20+40)/2
  });

  it("handles mixed over/under estimates with separate averages", () => {
    const records = [
      makeRecord({ taskId: "t1", estimatedMinutes: 60, actualMinutes: 30 }), // over by 30
      makeRecord({ taskId: "t2", estimatedMinutes: 60, actualMinutes: 90 }), // under by 30
      makeRecord({ taskId: "t3", estimatedMinutes: 60, actualMinutes: 60 }), // exact
    ];

    const calc = new EstimationCalculator(mockAnalyticsRepo(records));
    const result = calc.compute("week", REF);

    expect(result.overestimateCount).toBe(1);
    expect(result.underestimateCount).toBe(1);
    expect(result.averageOverestimateMinutes).toBe(30);
    expect(result.averageUnderestimateMinutes).toBe(30);
  });

  it("clamps extreme deviation to 0% accuracy", () => {
    const records = [
      makeRecord({ taskId: "t1", estimatedMinutes: 10, actualMinutes: 120 }),
      // |120-10|/10 = 1100% deviation → max(0, 100-1100) = 0%
    ];

    const calc = new EstimationCalculator(mockAnalyticsRepo(records));
    const result = calc.compute("week", REF);

    expect(result.averageAccuracyPercentage).toBe(0);
  });

  it("returns 0% accuracy when estimated duration is zero (EC-6)", () => {
    const records = [makeRecord({ taskId: "t1", estimatedMinutes: 0, actualMinutes: 30 })];

    const calc = new EstimationCalculator(mockAnalyticsRepo(records));
    const result = calc.compute("week", REF);

    expect(result.averageAccuracyPercentage).toBe(0);
  });

  it("returns null metrics when no records exist (EC-2)", () => {
    const calc = new EstimationCalculator(mockAnalyticsRepo([]));
    const result = calc.compute("week", REF);

    expect(result.averageAccuracyPercentage).toBeNull();
    expect(result.overestimateCount).toBe(0);
    expect(result.underestimateCount).toBe(0);
    expect(result.averageOverestimateMinutes).toBeNull();
    expect(result.averageUnderestimateMinutes).toBeNull();
    expect(result.accuracyByCategory).toBeNull();
  });

  it("computes per-category accuracy", () => {
    const records = [
      makeRecord({ taskId: "t1", category: "work", estimatedMinutes: 60, actualMinutes: 60 }), // 100%
      makeRecord({ taskId: "t2", category: "work", estimatedMinutes: 60, actualMinutes: 90 }), // 50%
      makeRecord({ taskId: "t3", category: "personal", estimatedMinutes: 100, actualMinutes: 100 }), // 100%
    ];

    const calc = new EstimationCalculator(mockAnalyticsRepo(records));
    const result = calc.compute("week", REF);

    expect(result.accuracyByCategory).not.toBeNull();
    expect(result.accuracyByCategory!["work"]).toBe(75); // (100+50)/2
    expect(result.accuracyByCategory!["personal"]).toBe(100);
  });

  it("groups null category as 'uncategorized' (CR-6)", () => {
    const records = [
      makeRecord({ taskId: "t1", category: null, estimatedMinutes: 60, actualMinutes: 60 }), // 100%
    ];

    const calc = new EstimationCalculator(mockAnalyticsRepo(records));
    const result = calc.compute("week", REF);

    expect(result.accuracyByCategory).not.toBeNull();
    expect(result.accuracyByCategory!["uncategorized"]).toBe(100);
  });

  it("rounds percentages to 2 decimal places (PR-1)", () => {
    const records = [
      makeRecord({ taskId: "t1", estimatedMinutes: 60, actualMinutes: 80 }),
      // |80-60|/60 = 33.333...% dev → accuracy = 66.666...% → rounded to 66.67%
    ];

    const calc = new EstimationCalculator(mockAnalyticsRepo(records));
    const result = calc.compute("week", REF);

    expect(result.averageAccuracyPercentage).toBe(66.67);
  });

  it("rounds minutes to 1 decimal place (PR-3)", () => {
    const records = [
      makeRecord({ taskId: "t1", estimatedMinutes: 60, actualMinutes: 83 }), // under by 23
      makeRecord({ taskId: "t2", estimatedMinutes: 60, actualMinutes: 74 }), // under by 14
    ];

    const calc = new EstimationCalculator(mockAnalyticsRepo(records));
    const result = calc.compute("week", REF);

    // Average underestimate: (23+14)/2 = 18.5
    expect(result.averageUnderestimateMinutes).toBe(18.5);
  });
});
