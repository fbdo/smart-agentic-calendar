import type { Scheduler } from "./scheduler.js";
import type { ScheduleRepository } from "../storage/schedule-repository.js";
import type { TaskRepository } from "../storage/task-repository.js";
import type { ConfigRepository } from "../storage/config-repository.js";
import type { RecurrenceManager } from "./recurrence-manager.js";
import type { ScheduleStatus } from "../models/schedule.js";

export class ReplanCoordinator {
  private readonly scheduler: Scheduler;
  private readonly scheduleRepo: ScheduleRepository;
  private readonly taskRepo: TaskRepository;
  private readonly configRepo: ConfigRepository;
  private readonly recurrenceManager: RecurrenceManager;

  private dirty = false;
  private replanning = false;
  private pendingTimeout: ReturnType<typeof setTimeout> | null = null;
  private awaitCallbacks: (() => void)[] = [];

  constructor(
    scheduler: Scheduler,
    scheduleRepo: ScheduleRepository,
    taskRepo: TaskRepository,
    configRepo: ConfigRepository,
    recurrenceManager: RecurrenceManager,
  ) {
    this.scheduler = scheduler;
    this.scheduleRepo = scheduleRepo;
    this.taskRepo = taskRepo;
    this.configRepo = configRepo;
    this.recurrenceManager = recurrenceManager;
  }

  requestReplan(): void {
    this.dirty = true;
    if (this.pendingTimeout === null && !this.replanning) {
      this.pendingTimeout = setTimeout(() => this.executeReplan(), 0);
    }
  }

  isReplanning(): boolean {
    return this.replanning;
  }

  getScheduleStatus(): ScheduleStatus {
    if (this.replanning) return "replan_in_progress";
    return "up_to_date";
  }

  async awaitReplan(): Promise<void> {
    if (!this.dirty && !this.replanning) {
      return;
    }

    if (!this.replanning && this.dirty) {
      // Cancel any pending setTimeout and execute immediately
      if (this.pendingTimeout !== null) {
        clearTimeout(this.pendingTimeout);
        this.pendingTimeout = null;
      }
      this.executeReplan();
      return;
    }

    // Replan is in progress — wait for it to complete
    return new Promise<void>((resolve) => {
      this.awaitCallbacks.push(resolve);
    });
  }

  private executeReplan(): void {
    this.pendingTimeout = null;

    if (!this.dirty) return;

    this.dirty = false;
    this.replanning = true;
    this.scheduleRepo.setScheduleStatus("replan_in_progress");

    try {
      // Step 1: Expand recurrence horizon
      const preferences = this.configRepo.getPreferences();
      const horizonEnd = new Date();
      horizonEnd.setDate(horizonEnd.getDate() + preferences.schedulingHorizonWeeks * 7);
      this.recurrenceManager.expandHorizon(horizonEnd);

      // Step 2: Generate schedule
      const horizonStart = new Date();
      horizonStart.setUTCHours(0, 0, 0, 0);
      const result = this.scheduler.generateSchedule(horizonStart, horizonEnd);

      // Step 3: Save results
      this.scheduleRepo.clearSchedule();
      this.scheduleRepo.saveSchedule(result.timeBlocks);

      // Step 4: Update task statuses
      for (const atRisk of result.atRiskTasks) {
        const task = this.taskRepo.findById(atRisk.taskId);
        if (task && task.status !== "completed" && task.status !== "cancelled") {
          this.taskRepo.updateStatus(atRisk.taskId, "at_risk");
        }
      }
    } catch {
      // Graceful degradation: previous schedule preserved
    } finally {
      this.replanning = false;
      this.scheduleRepo.setScheduleStatus("up_to_date");

      // Resolve any awaitReplan promises
      const callbacks = this.awaitCallbacks;
      this.awaitCallbacks = [];
      for (const callback of callbacks) {
        callback();
      }

      // If dirty again (mutation during replan), schedule another
      if (this.dirty) {
        this.pendingTimeout = setTimeout(() => this.executeReplan(), 0);
      }
    }
  }
}
