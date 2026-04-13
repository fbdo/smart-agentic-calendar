import type { AnalyticsRepository } from "../storage/analytics-repository.js";
import type { TaskRepository } from "../storage/task-repository.js";
import type { ScheduleRepository } from "../storage/schedule-repository.js";
import type { ConfigRepository } from "../storage/config-repository.js";
import type {
  ProductivityStats,
  ScheduleHealth,
  EstimationAccuracy,
  TimeAllocation,
} from "../models/analytics.js";
import type { Logger } from "../common/logger.js";
import { validatePeriod } from "./period.js";
import { ProductivityCalculator } from "./productivity.js";
import { HealthCalculator } from "./health.js";
import { EstimationCalculator } from "./estimation.js";
import { AllocationCalculator } from "./allocation.js";

export class AnalyticsEngine {
  private readonly productivity: ProductivityCalculator;
  private readonly health: HealthCalculator;
  private readonly estimation: EstimationCalculator;
  private readonly allocation: AllocationCalculator;
  private readonly logger: Logger;

  constructor(
    analyticsRepo: AnalyticsRepository,
    taskRepo: TaskRepository,
    scheduleRepo: ScheduleRepository,
    configRepo: ConfigRepository,
    logger: Logger,
  ) {
    this.productivity = new ProductivityCalculator(analyticsRepo);
    this.health = new HealthCalculator(analyticsRepo, taskRepo, scheduleRepo, configRepo);
    this.estimation = new EstimationCalculator(analyticsRepo);
    this.allocation = new AllocationCalculator(analyticsRepo);
    this.logger = logger;
  }

  getProductivityStats(period: string, referenceDate?: Date): ProductivityStats {
    validatePeriod(period);
    return this.productivity.compute(period, referenceDate);
  }

  getScheduleHealth(referenceDate?: Date): ScheduleHealth {
    return this.health.compute(referenceDate);
  }

  getEstimationAccuracy(period: string, referenceDate?: Date): EstimationAccuracy {
    validatePeriod(period);
    return this.estimation.compute(period, referenceDate);
  }

  getTimeAllocation(period: string, referenceDate?: Date): TimeAllocation {
    validatePeriod(period);
    return this.allocation.compute(period, referenceDate);
  }
}
