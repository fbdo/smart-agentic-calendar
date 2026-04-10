import type { AnalyticsRepository } from "../storage/analytics-repository.js";
import type { ProductivityStats } from "../models/analytics.js";
import type { Period } from "./period.js";
import { resolvePeriod } from "./period.js";

export class ProductivityCalculator {
  private readonly analyticsRepo: AnalyticsRepository;

  constructor(analyticsRepo: AnalyticsRepository) {
    this.analyticsRepo = analyticsRepo;
  }

  compute(period: Period, referenceDate?: Date): ProductivityStats {
    const range = resolvePeriod(period, referenceDate);

    const completedTasks = this.analyticsRepo.getCompletedTasks(range.start, range.end);
    const allOverdueTasks = this.analyticsRepo.getOverdueTasks(range.end);
    const cancelledTasks = this.analyticsRepo.getCancelledTasks(range.start, range.end);

    // Filter overdue tasks to those with deadline within the period
    const overdueTasks = allOverdueTasks.filter(
      (t) => t.deadline !== null && t.deadline >= range.start,
    );

    const tasksCompleted = completedTasks.length;
    const tasksOverdue = overdueTasks.length;
    const tasksCancelled = cancelledTasks.length;

    const resolvedCount = tasksCompleted + tasksOverdue + tasksCancelled;

    const completionRate = resolvedCount === 0 ? 0 : round2((tasksCompleted / resolvedCount) * 100);

    const onTimeCount = completedTasks.filter((t) => t.wasOnTime).length;
    const onTimeRate =
      completedTasks.length === 0 ? 0 : round2((onTimeCount / completedTasks.length) * 100);

    return {
      period,
      tasksCompleted,
      tasksOverdue,
      tasksCancelled,
      completionRate,
      onTimeRate,
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
