import { describe, it, expect, vi } from "vitest";
import { HealthCalculator } from "../../../src/analytics/health.js";
import type { AnalyticsRepository } from "../../../src/storage/analytics-repository.js";
import type { TaskRepository } from "../../../src/storage/task-repository.js";
import type { ScheduleRepository } from "../../../src/storage/schedule-repository.js";
import type { ConfigRepository } from "../../../src/storage/config-repository.js";
import type { Task } from "../../../src/models/task.js";
import type { TimeBlock } from "../../../src/models/schedule.js";
import type {
  Availability,
  UserConfig,
  FocusTime,
  Preferences,
} from "../../../src/models/config.js";

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: "Task",
    description: null,
    duration: 60,
    deadline: null,
    priority: "P3",
    status: "pending",
    category: null,
    tags: [],
    isRecurring: false,
    recurrenceTemplateId: null,
    actualDuration: null,
    createdAt: "2026-04-06T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
    ...overrides,
  };
}

function makeBlock(taskId: string, start: string, end: string, date: string): TimeBlock {
  return {
    id: `block-${taskId}-${date}`,
    taskId,
    startTime: start,
    endTime: end,
    date,
    blockIndex: 0,
    totalBlocks: 1,
  };
}

const weekdayAvailability: Availability = {
  windows: [
    { day: 1, startTime: "09:00", endTime: "17:00" }, // Mon 480min
    { day: 2, startTime: "09:00", endTime: "17:00" }, // Tue 480min
    { day: 3, startTime: "09:00", endTime: "17:00" }, // Wed 480min
    { day: 4, startTime: "09:00", endTime: "17:00" }, // Thu 480min
    { day: 5, startTime: "09:00", endTime: "17:00" }, // Fri 480min
  ],
};
// Total: 2400min = 40 hours

const defaultPreferences: Preferences = {
  bufferTimeMinutes: 15,
  defaultPriority: "P3",
  defaultDuration: 60,
  schedulingHorizonWeeks: 4,
  minimumBlockMinutes: 15,
};

const defaultFocusTime: FocusTime = { blocks: [], minimumBlockMinutes: 60 };

function makeConfig(availability: Availability = weekdayAvailability): UserConfig {
  return {
    availability,
    focusTime: defaultFocusTime,
    preferences: defaultPreferences,
  };
}

interface MockDeps {
  overdueTasks?: Task[];
  atRiskTasks?: Task[];
  timeBlocks?: TimeBlock[];
  config?: UserConfig;
}

function createCalculator(deps: MockDeps = {}) {
  const analyticsRepo = {
    getOverdueTasks: vi.fn().mockReturnValue(deps.overdueTasks ?? []),
    getCompletedTasks: vi.fn().mockReturnValue([]),
    getCancelledTasks: vi.fn().mockReturnValue([]),
    getTasksByCategory: vi.fn().mockReturnValue([]),
    getDurationRecords: vi.fn().mockReturnValue([]),
  } as unknown as AnalyticsRepository;

  const taskRepo = {
    findAll: vi.fn().mockReturnValue(deps.atRiskTasks ?? []),
  } as unknown as TaskRepository;

  const scheduleRepo = {
    getSchedule: vi.fn().mockReturnValue(deps.timeBlocks ?? []),
  } as unknown as ScheduleRepository;

  const configRepo = {
    getFullConfig: vi.fn().mockReturnValue(deps.config ?? makeConfig()),
  } as unknown as ConfigRepository;

  return new HealthCalculator(analyticsRepo, taskRepo, scheduleRepo, configRepo);
}

// Reference: week of 2026-04-06 (Mon) to 2026-04-13 (Mon)
const REF = new Date("2026-04-10T14:00:00.000Z");

describe("HealthCalculator", () => {
  it("healthy schedule: 60% utilization, 0 overdue, 0 at-risk → score 80+", () => {
    // 60% of 2400min = 1440min scheduled across 5 days = 288min/day
    const blocks = [
      makeBlock("t1", "2026-04-06T09:00:00.000Z", "2026-04-06T13:48:00.000Z", "2026-04-06"), // Mon 288min
      makeBlock("t2", "2026-04-07T09:00:00.000Z", "2026-04-07T13:48:00.000Z", "2026-04-07"), // Tue 288min
      makeBlock("t3", "2026-04-08T09:00:00.000Z", "2026-04-08T13:48:00.000Z", "2026-04-08"), // Wed 288min
      makeBlock("t4", "2026-04-09T09:00:00.000Z", "2026-04-09T13:48:00.000Z", "2026-04-09"), // Thu 288min
      makeBlock("t5", "2026-04-10T09:00:00.000Z", "2026-04-10T13:48:00.000Z", "2026-04-10"), // Fri 288min
    ];

    const calc = createCalculator({ timeBlocks: blocks });
    const result = calc.compute(REF);

    expect(result.healthScore).toBeGreaterThanOrEqual(80);
    expect(result.overdueCount).toBe(0);
    expect(result.atRiskCount).toBe(0);
    expect(result.utilizationPercentage).toBeCloseTo(60, 0);
  });

  it("overloaded schedule: 95% utilization, 3 at-risk, 1 overdue → score <50", () => {
    // 95% of 2400min = 2280min across 5 days = 456min/day
    const blocks = [
      makeBlock("t1", "2026-04-06T09:00:00.000Z", "2026-04-06T16:36:00.000Z", "2026-04-06"), // 456min
      makeBlock("t2", "2026-04-07T09:00:00.000Z", "2026-04-07T16:36:00.000Z", "2026-04-07"),
      makeBlock("t3", "2026-04-08T09:00:00.000Z", "2026-04-08T16:36:00.000Z", "2026-04-08"),
      makeBlock("t4", "2026-04-09T09:00:00.000Z", "2026-04-09T16:36:00.000Z", "2026-04-09"),
      makeBlock("t5", "2026-04-10T09:00:00.000Z", "2026-04-10T16:36:00.000Z", "2026-04-10"),
    ];

    const atRisk = [
      makeTask({ id: "ar1", status: "at_risk" }),
      makeTask({ id: "ar2", status: "at_risk" }),
      makeTask({ id: "ar3", status: "at_risk" }),
    ];
    const overdue = [makeTask({ id: "o1", deadline: "2026-04-08T17:00:00.000Z" })];

    const calc = createCalculator({
      timeBlocks: blocks,
      atRiskTasks: atRisk,
      overdueTasks: overdue,
    });
    const result = calc.compute(REF);

    // 100 - 1*15(overdue) - 3*10(at-risk) - (95-90)*2(utilization) = 100 - 15 - 30 - 10 = 45
    expect(result.healthScore).toBeLessThan(50);
    expect(result.atRiskCount).toBe(3);
    expect(result.utilizationPercentage).toBeCloseTo(95, 0);
  });

  it("computes utilization correctly", () => {
    // 240min scheduled out of 2400min available = 10%
    const blocks = [
      makeBlock("t1", "2026-04-06T09:00:00.000Z", "2026-04-06T13:00:00.000Z", "2026-04-06"), // 240min
    ];

    const calc = createCalculator({ timeBlocks: blocks });
    const result = calc.compute(REF);

    expect(result.utilizationPercentage).toBe(10);
  });

  it("computes free hours correctly", () => {
    // 240min scheduled, 2400min available → free = (2400-240)/60 = 36.0
    const blocks = [
      makeBlock("t1", "2026-04-06T09:00:00.000Z", "2026-04-06T13:00:00.000Z", "2026-04-06"),
    ];

    const calc = createCalculator({ timeBlocks: blocks });
    const result = calc.compute(REF);

    expect(result.freeHoursThisWeek).toBe(36);
  });

  it("identifies busiest and lightest day", () => {
    const blocks = [
      makeBlock("t1", "2026-04-06T09:00:00.000Z", "2026-04-06T15:00:00.000Z", "2026-04-06"), // Mon 360min
      makeBlock("t2", "2026-04-07T09:00:00.000Z", "2026-04-07T10:00:00.000Z", "2026-04-07"), // Tue 60min
      makeBlock("t3", "2026-04-08T09:00:00.000Z", "2026-04-08T12:00:00.000Z", "2026-04-08"), // Wed 180min
    ];

    const calc = createCalculator({ timeBlocks: blocks });
    const result = calc.compute(REF);

    expect(result.busiestDay).toBe("Monday");
    expect(result.lightestDay).toBe("Thursday"); // Thu and Fri have 0 scheduled with availability
  });

  it("breaks busiest/lightest tie by earlier day", () => {
    const blocks = [
      makeBlock("t1", "2026-04-06T09:00:00.000Z", "2026-04-06T11:00:00.000Z", "2026-04-06"), // Mon 120min
      makeBlock("t2", "2026-04-07T09:00:00.000Z", "2026-04-07T11:00:00.000Z", "2026-04-07"), // Tue 120min
    ];

    const calc = createCalculator({ timeBlocks: blocks });
    const result = calc.compute(REF);

    expect(result.busiestDay).toBe("Monday");
    // Lightest: Wed/Thu/Fri all have 0, earliest with availability = Wednesday
    expect(result.lightestDay).toBe("Wednesday");
  });

  it("applies overdue penalty: 2 overdue → deduct 30", () => {
    const overdue = [
      makeTask({ id: "o1", deadline: "2026-04-08T17:00:00.000Z" }),
      makeTask({ id: "o2", deadline: "2026-04-09T17:00:00.000Z" }),
    ];

    const calc = createCalculator({ overdueTasks: overdue });
    const result = calc.compute(REF);

    // 100 - 2*15 - underUtilization(0% → 20) = 100 - 30 - 20 = 50
    expect(result.overdueCount).toBe(2);
    expect(result.healthScore).toBe(50);
  });

  it("applies at-risk penalty: 1 at-risk → deduct 10", () => {
    const atRisk = [makeTask({ id: "ar1", status: "at_risk" })];

    const calc = createCalculator({ atRiskTasks: atRisk });
    const result = calc.compute(REF);

    // 100 - 1*10 - underUtilization(0% → 20) = 100 - 10 - 20 = 70
    expect(result.atRiskCount).toBe(1);
    expect(result.healthScore).toBe(70);
  });

  it("applies utilization penalty above 90%", () => {
    // 95% of 2400 = 2280min
    const blocks = [
      makeBlock("t1", "2026-04-06T09:00:00.000Z", "2026-04-06T16:36:00.000Z", "2026-04-06"), // 456min
      makeBlock("t2", "2026-04-07T09:00:00.000Z", "2026-04-07T16:36:00.000Z", "2026-04-07"),
      makeBlock("t3", "2026-04-08T09:00:00.000Z", "2026-04-08T16:36:00.000Z", "2026-04-08"),
      makeBlock("t4", "2026-04-09T09:00:00.000Z", "2026-04-09T16:36:00.000Z", "2026-04-09"),
      makeBlock("t5", "2026-04-10T09:00:00.000Z", "2026-04-10T16:36:00.000Z", "2026-04-10"),
    ];

    const calc = createCalculator({ timeBlocks: blocks });
    const result = calc.compute(REF);

    // 95% utilization → penalty = (95-90)*2 = 10
    // 100 - 10 = 90
    expect(result.healthScore).toBe(90);
  });

  it("applies mild utilization penalty below 20%", () => {
    // 10% of 2400 = 240min on one day
    const blocks = [
      makeBlock("t1", "2026-04-06T09:00:00.000Z", "2026-04-06T13:00:00.000Z", "2026-04-06"), // 240min
    ];

    const calc = createCalculator({ timeBlocks: blocks });
    const result = calc.compute(REF);

    // 10% utilization → penalty = (20-10)*1 = 10
    // 100 - 10 = 90
    expect(result.healthScore).toBe(90);
  });

  it("no utilization penalty in neutral zone (20-90%)", () => {
    // 50% of 2400 = 1200min
    const blocks = [
      makeBlock("t1", "2026-04-06T09:00:00.000Z", "2026-04-06T13:00:00.000Z", "2026-04-06"), // 240min
      makeBlock("t2", "2026-04-07T09:00:00.000Z", "2026-04-07T13:00:00.000Z", "2026-04-07"), // 240min
      makeBlock("t3", "2026-04-08T09:00:00.000Z", "2026-04-08T13:00:00.000Z", "2026-04-08"), // 240min
      makeBlock("t4", "2026-04-09T09:00:00.000Z", "2026-04-09T13:00:00.000Z", "2026-04-09"), // 240min
      makeBlock("t5", "2026-04-10T09:00:00.000Z", "2026-04-10T13:00:00.000Z", "2026-04-10"), // 240min
    ];

    const calc = createCalculator({ timeBlocks: blocks });
    const result = calc.compute(REF);

    // 50% utilization → no penalty → score = 100
    expect(result.healthScore).toBe(100);
    expect(result.utilizationPercentage).toBe(50);
  });

  it("clamps health score floor at 0", () => {
    const overdue = Array.from({ length: 10 }, (_, i) =>
      makeTask({ id: `o${i}`, deadline: "2026-04-08T17:00:00.000Z" }),
    );

    const calc = createCalculator({ overdueTasks: overdue });
    const result = calc.compute(REF);

    // 100 - 10*15 - underUtilization = 100 - 150 - 20 → clamped to 0
    expect(result.healthScore).toBe(0);
  });

  it("returns zero utilization and freeHours when no availability (EC-3)", () => {
    const config = makeConfig({ windows: [] });
    const calc = createCalculator({ config });
    const result = calc.compute(REF);

    expect(result.utilizationPercentage).toBe(0);
    expect(result.freeHoursThisWeek).toBe(0);
  });

  it("returns null busiest/lightest when no time blocks (EC-4)", () => {
    const calc = createCalculator();
    const result = calc.compute(REF);

    expect(result.busiestDay).toBeNull();
    expect(result.lightestDay).toBeNull();
  });

  it("handles overscheduled week: utilization > 100%, freeHours clamped to 0 (EC-7)", () => {
    // Schedule 500min/day on a 480min/day availability = 104.17%
    const blocks = [
      makeBlock("t1", "2026-04-06T08:40:00.000Z", "2026-04-06T17:00:00.000Z", "2026-04-06"), // 500min
      makeBlock("t2", "2026-04-07T08:40:00.000Z", "2026-04-07T17:00:00.000Z", "2026-04-07"),
      makeBlock("t3", "2026-04-08T08:40:00.000Z", "2026-04-08T17:00:00.000Z", "2026-04-08"),
      makeBlock("t4", "2026-04-09T08:40:00.000Z", "2026-04-09T17:00:00.000Z", "2026-04-09"),
      makeBlock("t5", "2026-04-10T08:40:00.000Z", "2026-04-10T17:00:00.000Z", "2026-04-10"),
    ];

    const calc = createCalculator({ timeBlocks: blocks });
    const result = calc.compute(REF);

    expect(result.utilizationPercentage).toBeGreaterThan(100);
    expect(result.freeHoursThisWeek).toBe(0);
  });

  it("only considers days with availability for lightest day (CR-8)", () => {
    // Only Mon and Tue have availability
    const config = makeConfig({
      windows: [
        { day: 1, startTime: "09:00", endTime: "17:00" }, // Mon
        { day: 2, startTime: "09:00", endTime: "17:00" }, // Tue
      ],
    });

    const blocks = [
      makeBlock("t1", "2026-04-06T09:00:00.000Z", "2026-04-06T15:00:00.000Z", "2026-04-06"), // Mon 360min
      makeBlock("t2", "2026-04-07T09:00:00.000Z", "2026-04-07T10:00:00.000Z", "2026-04-07"), // Tue 60min
    ];

    const calc = createCalculator({ timeBlocks: blocks, config });
    const result = calc.compute(REF);

    expect(result.busiestDay).toBe("Monday");
    expect(result.lightestDay).toBe("Tuesday"); // Not Wed/Thu/Fri (no availability)
  });
});
