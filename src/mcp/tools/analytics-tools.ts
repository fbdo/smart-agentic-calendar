import type { AnalyticsEngine } from "../../analytics/analytics-engine.js";
import type { Logger } from "../../common/logger.js";
import {
  validatePeriodInput,
  mapProductivityOutput,
  mapHealthOutput,
  mapEstimationOutput,
  mapAllocationOutput,
} from "../validators.js";

export class AnalyticsTools {
  private readonly analyticsEngine: AnalyticsEngine;
  private readonly logger: Logger;

  constructor(analyticsEngine: AnalyticsEngine, logger: Logger) {
    this.analyticsEngine = analyticsEngine;
    this.logger = logger;
  }

  getProductivityStats(input: { period: string }) {
    validatePeriodInput(input.period);
    const stats = this.analyticsEngine.getProductivityStats(input.period);
    return mapProductivityOutput(stats);
  }

  getScheduleHealth() {
    const health = this.analyticsEngine.getScheduleHealth();
    return mapHealthOutput(health);
  }

  getEstimationAccuracy(input: { period: string }) {
    validatePeriodInput(input.period);
    const accuracy = this.analyticsEngine.getEstimationAccuracy(input.period);
    return mapEstimationOutput(accuracy);
  }

  getTimeAllocation(input: { period: string }) {
    validatePeriodInput(input.period);
    const allocation = this.analyticsEngine.getTimeAllocation(input.period);
    return mapAllocationOutput(allocation);
  }
}
