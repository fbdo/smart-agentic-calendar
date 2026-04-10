import type { AnalyticsRepository } from "../storage/analytics-repository.js";
import type { TimeAllocation, CategoryAllocation } from "../models/analytics.js";
import type { Period } from "./period.js";
import { resolvePeriod } from "./period.js";

export class AllocationCalculator {
  private readonly analyticsRepo: AnalyticsRepository;

  constructor(analyticsRepo: AnalyticsRepository) {
    this.analyticsRepo = analyticsRepo;
  }

  compute(period: Period, referenceDate?: Date): TimeAllocation {
    const range = resolvePeriod(period, referenceDate);
    const summaries = this.analyticsRepo.getTasksByCategory(range.start, range.end);

    if (summaries.length === 0) {
      return { period, categories: [] };
    }

    const totalMinutes = summaries.reduce((sum, s) => sum + s.totalMinutes, 0);

    const categories: CategoryAllocation[] = summaries
      .map((s) => ({
        category: s.category,
        hours: round2(s.totalMinutes / 60),
        percentage: totalMinutes === 0 ? 0 : round2((s.totalMinutes / totalMinutes) * 100),
      }))
      .sort((a, b) => b.hours - a.hours);

    return { period, categories };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
