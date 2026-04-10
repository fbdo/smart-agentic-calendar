import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ReplanCoordinator } from "../../../src/engine/replan-coordinator.js";
import type { Scheduler } from "../../../src/engine/scheduler.js";
import type { ScheduleRepository } from "../../../src/storage/schedule-repository.js";
import type { TaskRepository } from "../../../src/storage/task-repository.js";
import type { ConfigRepository } from "../../../src/storage/config-repository.js";
import type { RecurrenceManager } from "../../../src/engine/recurrence-manager.js";
import type { ScheduleResult } from "../../../src/models/schedule.js";

function createMocks() {
  const scheduleResult: ScheduleResult = {
    timeBlocks: [],
    conflicts: [],
    atRiskTasks: [],
  };

  const scheduler = {
    generateSchedule: vi.fn().mockReturnValue(scheduleResult),
  } as unknown as Scheduler;

  const scheduleRepo = {
    setScheduleStatus: vi.fn(),
    clearSchedule: vi.fn(),
    saveSchedule: vi.fn(),
    getScheduleStatus: vi.fn().mockReturnValue("up_to_date"),
  } as unknown as ScheduleRepository;

  const taskRepo = {
    updateStatus: vi.fn(),
    findById: vi.fn(),
  } as unknown as TaskRepository;

  const configRepo = {
    getPreferences: vi.fn().mockReturnValue({ schedulingHorizonWeeks: 4 }),
  } as unknown as ConfigRepository;

  const recurrenceManager = {
    expandHorizon: vi.fn().mockReturnValue([]),
  } as unknown as RecurrenceManager;

  return { scheduler, scheduleRepo, taskRepo, configRepo, recurrenceManager, scheduleResult };
}

describe("ReplanCoordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requestReplan sets dirty flag and schedules replan", async () => {
    const { scheduler, scheduleRepo, taskRepo, configRepo, recurrenceManager } = createMocks();
    const coordinator = new ReplanCoordinator(
      scheduler,
      scheduleRepo,
      taskRepo,
      configRepo,
      recurrenceManager,
    );

    coordinator.requestReplan();

    // Before setImmediate fires, schedule status should reflect pending replan
    expect(coordinator.getScheduleStatus()).toBe("up_to_date");

    // Run setImmediate
    await vi.advanceTimersToNextTimerAsync();

    expect(scheduler.generateSchedule).toHaveBeenCalledTimes(1);
    expect(scheduleRepo.setScheduleStatus).toHaveBeenCalledWith("replan_in_progress");
  });

  it("multiple requestReplan calls coalesce into one replan", async () => {
    const { scheduler, scheduleRepo, taskRepo, configRepo, recurrenceManager } = createMocks();
    const coordinator = new ReplanCoordinator(
      scheduler,
      scheduleRepo,
      taskRepo,
      configRepo,
      recurrenceManager,
    );

    coordinator.requestReplan();
    coordinator.requestReplan();
    coordinator.requestReplan();

    await vi.advanceTimersToNextTimerAsync();

    expect(scheduler.generateSchedule).toHaveBeenCalledTimes(1);
  });

  it("isReplanning returns false when not replanning", () => {
    const { scheduler, scheduleRepo, taskRepo, configRepo, recurrenceManager } = createMocks();
    const coordinator = new ReplanCoordinator(
      scheduler,
      scheduleRepo,
      taskRepo,
      configRepo,
      recurrenceManager,
    );

    expect(coordinator.isReplanning()).toBe(false);
  });

  it("getScheduleStatus returns up_to_date when idle", () => {
    const { scheduler, scheduleRepo, taskRepo, configRepo, recurrenceManager } = createMocks();
    const coordinator = new ReplanCoordinator(
      scheduler,
      scheduleRepo,
      taskRepo,
      configRepo,
      recurrenceManager,
    );

    expect(coordinator.getScheduleStatus()).toBe("up_to_date");
  });

  it("awaitReplan resolves immediately when not dirty and not replanning", async () => {
    const { scheduler, scheduleRepo, taskRepo, configRepo, recurrenceManager } = createMocks();
    const coordinator = new ReplanCoordinator(
      scheduler,
      scheduleRepo,
      taskRepo,
      configRepo,
      recurrenceManager,
    );

    await coordinator.awaitReplan();
    // Should not have triggered a replan
    expect(scheduler.generateSchedule).not.toHaveBeenCalled();
  });

  it("awaitReplan triggers synchronous replan when dirty but not replanning", async () => {
    const { scheduler, scheduleRepo, taskRepo, configRepo, recurrenceManager } = createMocks();
    const coordinator = new ReplanCoordinator(
      scheduler,
      scheduleRepo,
      taskRepo,
      configRepo,
      recurrenceManager,
    );

    coordinator.requestReplan();
    // Don't advance timers — call awaitReplan which should execute immediately
    await coordinator.awaitReplan();

    expect(scheduler.generateSchedule).toHaveBeenCalledTimes(1);
  });

  it("replan clears and saves schedule", async () => {
    const { scheduler, scheduleRepo, taskRepo, configRepo, recurrenceManager } = createMocks();
    const coordinator = new ReplanCoordinator(
      scheduler,
      scheduleRepo,
      taskRepo,
      configRepo,
      recurrenceManager,
    );

    coordinator.requestReplan();
    await vi.advanceTimersToNextTimerAsync();

    expect(scheduleRepo.clearSchedule).toHaveBeenCalled();
    expect(scheduleRepo.saveSchedule).toHaveBeenCalled();
  });

  it("replan calls recurrenceManager.expandHorizon before scheduling", async () => {
    const { scheduler, scheduleRepo, taskRepo, configRepo, recurrenceManager } = createMocks();
    const coordinator = new ReplanCoordinator(
      scheduler,
      scheduleRepo,
      taskRepo,
      configRepo,
      recurrenceManager,
    );

    coordinator.requestReplan();
    await vi.advanceTimersToNextTimerAsync();

    expect(recurrenceManager.expandHorizon).toHaveBeenCalledTimes(1);
    // expandHorizon should be called before generateSchedule
    const expandOrder = (recurrenceManager.expandHorizon as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const scheduleOrder = (scheduler.generateSchedule as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    expect(expandOrder).toBeLessThan(scheduleOrder);
  });

  it("replan sets status to up_to_date after completion", async () => {
    const { scheduler, scheduleRepo, taskRepo, configRepo, recurrenceManager } = createMocks();
    const coordinator = new ReplanCoordinator(
      scheduler,
      scheduleRepo,
      taskRepo,
      configRepo,
      recurrenceManager,
    );

    coordinator.requestReplan();
    await vi.advanceTimersToNextTimerAsync();

    // Last call to setScheduleStatus should be "up_to_date"
    const calls = (scheduleRepo.setScheduleStatus as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[calls.length - 1][0]).toBe("up_to_date");
  });

  it("updates at-risk task statuses after replan", async () => {
    const { scheduler, scheduleRepo, taskRepo, configRepo, recurrenceManager } = createMocks();
    const scheduleResult: ScheduleResult = {
      timeBlocks: [],
      conflicts: [],
      atRiskTasks: [{ taskId: "task-1", reason: "insufficient time" }],
    };
    (scheduler.generateSchedule as ReturnType<typeof vi.fn>).mockReturnValue(scheduleResult);
    (taskRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue({
      id: "task-1",
      status: "pending",
    });

    const coordinator = new ReplanCoordinator(
      scheduler,
      scheduleRepo,
      taskRepo,
      configRepo,
      recurrenceManager,
    );

    coordinator.requestReplan();
    await vi.advanceTimersToNextTimerAsync();

    expect(taskRepo.updateStatus).toHaveBeenCalledWith("task-1", "at_risk");
  });

  it("skips at-risk status update for completed tasks", async () => {
    const { scheduler, scheduleRepo, taskRepo, configRepo, recurrenceManager } = createMocks();
    const scheduleResult: ScheduleResult = {
      timeBlocks: [],
      conflicts: [],
      atRiskTasks: [{ taskId: "task-1", reason: "insufficient time" }],
    };
    (scheduler.generateSchedule as ReturnType<typeof vi.fn>).mockReturnValue(scheduleResult);
    (taskRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue({
      id: "task-1",
      status: "completed",
    });

    const coordinator = new ReplanCoordinator(
      scheduler,
      scheduleRepo,
      taskRepo,
      configRepo,
      recurrenceManager,
    );

    coordinator.requestReplan();
    await vi.advanceTimersToNextTimerAsync();

    expect(taskRepo.updateStatus).not.toHaveBeenCalled();
  });

  it("preserves previous schedule on replan error", async () => {
    const { scheduler, scheduleRepo, taskRepo, configRepo, recurrenceManager } = createMocks();
    (scheduler.generateSchedule as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("scheduling failed");
    });
    const coordinator = new ReplanCoordinator(
      scheduler,
      scheduleRepo,
      taskRepo,
      configRepo,
      recurrenceManager,
    );

    coordinator.requestReplan();
    await vi.advanceTimersToNextTimerAsync();

    // Should NOT have cleared or saved schedule
    expect(scheduleRepo.clearSchedule).not.toHaveBeenCalled();
    expect(scheduleRepo.saveSchedule).not.toHaveBeenCalled();
    // Status should return to up_to_date
    const calls = (scheduleRepo.setScheduleStatus as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[calls.length - 1][0]).toBe("up_to_date");
  });
});
