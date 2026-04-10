import type { AnalyticsRepository } from "../storage/analytics-repository.js";
import type { EstimationAccuracy, DurationRecord } from "../models/analytics.js";
import type { Period } from "./period.js";
import { resolvePeriod } from "./period.js";

export class EstimationCalculator {
  private readonly analyticsRepo: AnalyticsRepository;

  constructor(analyticsRepo: AnalyticsRepository) {
    this.analyticsRepo = analyticsRepo;
  }

  compute(period: Period, referenceDate?: Date): EstimationAccuracy {
    const range = resolvePeriod(period, referenceDate);
    const records = this.analyticsRepo.getDurationRecords(range.start, range.end);

    if (records.length === 0) {
      return {
        averageAccuracyPercentage: null,
        overestimateCount: 0,
        underestimateCount: 0,
        averageOverestimateMinutes: null,
        averageUnderestimateMinutes: null,
        accuracyByCategory: null,
      };
    }

    const accuracies = records.map((r) => perTaskAccuracy(r.estimatedMinutes, r.actualMinutes));
    const averageAccuracyPercentage = round2(
      accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length,
    );

    const overestimates = records.filter((r) => r.actualMinutes < r.estimatedMinutes);
    const underestimates = records.filter((r) => r.actualMinutes > r.estimatedMinutes);

    const averageOverestimateMinutes =
      overestimates.length === 0
        ? null
        : round1(
            overestimates.reduce((sum, r) => sum + (r.estimatedMinutes - r.actualMinutes), 0) /
              overestimates.length,
          );

    const averageUnderestimateMinutes =
      underestimates.length === 0
        ? null
        : round1(
            underestimates.reduce((sum, r) => sum + (r.actualMinutes - r.estimatedMinutes), 0) /
              underestimates.length,
          );

    const accuracyByCategory = computeCategoryAccuracy(records);

    return {
      averageAccuracyPercentage,
      overestimateCount: overestimates.length,
      underestimateCount: underestimates.length,
      averageOverestimateMinutes,
      averageUnderestimateMinutes,
      accuracyByCategory,
    };
  }
}

function perTaskAccuracy(estimated: number, actual: number): number {
  if (estimated === 0) return 0;
  const deviation = (Math.abs(actual - estimated) / estimated) * 100;
  return Math.max(0, 100 - deviation);
}

function computeCategoryAccuracy(records: DurationRecord[]): Record<string, number> {
  const groups = new Map<string, number[]>();

  for (const record of records) {
    const category = record.category ?? "uncategorized";
    const accuracy = perTaskAccuracy(record.estimatedMinutes, record.actualMinutes);

    if (!groups.has(category)) {
      groups.set(category, []);
    }
    const group = groups.get(category);
    if (group) {
      group.push(accuracy);
    }
  }

  const result: Record<string, number> = {};
  for (const [category, accuracies] of groups) {
    result[category] = round2(accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length);
  }

  return result;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
