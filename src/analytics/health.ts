import type { AnalyticsRepository } from "../storage/analytics-repository.js";
import type { TaskRepository } from "../storage/task-repository.js";
import type { ScheduleRepository } from "../storage/schedule-repository.js";
import type { ConfigRepository } from "../storage/config-repository.js";
import type { ScheduleHealth } from "../models/analytics.js";
import type { TimeBlock } from "../models/schedule.js";
import type { Availability } from "../models/config.js";
import { resolvePeriod } from "./period.js";
import { diffMinutes } from "../common/time.js";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const OVERDUE_WEIGHT = 15;
const AT_RISK_WEIGHT = 10;
const OVER_UTILIZATION_THRESHOLD = 90;
const OVER_UTILIZATION_MULTIPLIER = 2;
const UNDER_UTILIZATION_THRESHOLD = 20;
const UNDER_UTILIZATION_MULTIPLIER = 1;

export class HealthCalculator {
  private readonly analyticsRepo: AnalyticsRepository;
  private readonly taskRepo: TaskRepository;
  private readonly scheduleRepo: ScheduleRepository;
  private readonly configRepo: ConfigRepository;

  constructor(
    analyticsRepo: AnalyticsRepository,
    taskRepo: TaskRepository,
    scheduleRepo: ScheduleRepository,
    configRepo: ConfigRepository,
  ) {
    this.analyticsRepo = analyticsRepo;
    this.taskRepo = taskRepo;
    this.scheduleRepo = scheduleRepo;
    this.configRepo = configRepo;
  }

  compute(referenceDate?: Date): ScheduleHealth {
    const ref = referenceDate ?? new Date();
    const weekRange = resolvePeriod("week", ref);
    const config = this.configRepo.getFullConfig();
    const timeBlocks = this.scheduleRepo.getSchedule(weekRange.start, weekRange.end);
    const overdueTasks = this.analyticsRepo.getOverdueTasks(ref.toISOString());
    const atRiskTasks = this.taskRepo.findAll({ status: "at_risk" });

    const overdueCount = overdueTasks.length;
    const atRiskCount = atRiskTasks.length;

    const availablePerDay = computeAvailableMinutesPerDay(config.availability, weekRange.start);
    const scheduledPerDay = computeScheduledMinutesPerDay(timeBlocks, weekRange.start);

    const totalAvailable = sumValues(availablePerDay);
    const totalScheduled = sumValues(scheduledPerDay);

    const utilizationPercentage =
      totalAvailable === 0 ? 0 : round2((totalScheduled / totalAvailable) * 100);

    const freeHoursThisWeek =
      totalAvailable === 0 ? 0 : round1(Math.max(0, (totalAvailable - totalScheduled) / 60));

    const { busiestDay, lightestDay } = findBusiestLightestDay(
      scheduledPerDay,
      availablePerDay,
      weekRange.start,
    );

    const healthScore = computeHealthScore(overdueCount, atRiskCount, utilizationPercentage);

    return {
      healthScore,
      utilizationPercentage,
      overdueCount,
      atRiskCount,
      freeHoursThisWeek,
      busiestDay,
      lightestDay,
    };
  }
}

function computeHealthScore(
  overdueCount: number,
  atRiskCount: number,
  utilizationPercentage: number,
): number {
  let score = 100;

  score -= overdueCount * OVERDUE_WEIGHT;
  score -= atRiskCount * AT_RISK_WEIGHT;

  if (utilizationPercentage > OVER_UTILIZATION_THRESHOLD) {
    score -= (utilizationPercentage - OVER_UTILIZATION_THRESHOLD) * OVER_UTILIZATION_MULTIPLIER;
  } else if (utilizationPercentage < UNDER_UTILIZATION_THRESHOLD) {
    score -= (UNDER_UTILIZATION_THRESHOLD - utilizationPercentage) * UNDER_UTILIZATION_MULTIPLIER;
  }

  return Math.round(Math.max(0, Math.min(100, score)));
}

function computeAvailableMinutesPerDay(
  availability: Availability,
  weekStart: string,
): Map<number, number> {
  const result = new Map<number, number>();
  const startDate = new Date(weekStart);

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + dayOffset);
    const dayOfWeek = date.getUTCDay(); // 0=Sun..6=Sat

    let minutes = 0;
    for (const window of availability.windows) {
      if (window.day === dayOfWeek) {
        const [startH, startM] = window.startTime.split(":").map(Number);
        const [endH, endM] = window.endTime.split(":").map(Number);
        minutes += endH * 60 + endM - (startH * 60 + startM);
      }
    }

    result.set(dayOffset, minutes);
  }

  return result;
}

function computeScheduledMinutesPerDay(
  timeBlocks: TimeBlock[],
  weekStart: string,
): Map<number, number> {
  const result = new Map<number, number>();
  const startMs = new Date(weekStart).getTime();

  for (const block of timeBlocks) {
    const blockDate = new Date(block.startTime);
    const dayOffset = Math.floor((blockDate.getTime() - startMs) / (24 * 60 * 60 * 1000));

    if (dayOffset >= 0 && dayOffset < 7) {
      const minutes = diffMinutes(block.startTime, block.endTime);
      result.set(dayOffset, (result.get(dayOffset) ?? 0) + minutes);
    }
  }

  return result;
}

function findBusiestLightestDay(
  scheduledPerDay: Map<number, number>,
  availablePerDay: Map<number, number>,
  weekStart: string,
): { busiestDay: string | null; lightestDay: string | null } {
  // Check if any time blocks exist
  let hasScheduled = false;
  for (const minutes of scheduledPerDay.values()) {
    if (minutes > 0) {
      hasScheduled = true;
      break;
    }
  }

  if (!hasScheduled) {
    return { busiestDay: null, lightestDay: null };
  }

  const startDate = new Date(weekStart);
  let busiestOffset = -1;
  let busiestMinutes = -1;
  let lightestOffset = -1;
  let lightestMinutes = Infinity;

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const scheduled = scheduledPerDay.get(dayOffset) ?? 0;
    const available = availablePerDay.get(dayOffset) ?? 0;

    // Busiest: any day with scheduled time
    if (scheduled > busiestMinutes) {
      busiestMinutes = scheduled;
      busiestOffset = dayOffset;
    }

    // Lightest: only days with availability > 0
    if (available > 0 && scheduled < lightestMinutes) {
      lightestMinutes = scheduled;
      lightestOffset = dayOffset;
    }
  }

  const busiestDay = busiestOffset >= 0 ? getDayName(startDate, busiestOffset) : null;
  const lightestDay = lightestOffset >= 0 ? getDayName(startDate, lightestOffset) : null;

  return { busiestDay, lightestDay };
}

function getDayName(weekStart: Date, dayOffset: number): string {
  const date = new Date(weekStart);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return DAY_NAMES[date.getUTCDay()];
}

function sumValues(map: Map<number, number>): number {
  let sum = 0;
  for (const v of map.values()) {
    sum += v;
  }
  return sum;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
