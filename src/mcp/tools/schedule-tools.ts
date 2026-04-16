import type { ScheduleRepository } from "../../storage/schedule-repository.js";
import type { TaskRepository } from "../../storage/task-repository.js";
import type { ConfigRepository } from "../../storage/config-repository.js";
import type { ReplanCoordinator } from "../../engine/replan-coordinator.js";
import type { ConflictDetector } from "../../engine/conflict-detector.js";
import type { Task } from "../../models/task.js";
import type { TimeBlock } from "../../models/schedule.js";
import type { DependencyEdge } from "../../models/dependency.js";
import type { Logger } from "../../common/logger.js";
import {
  validateGetScheduleInput,
  mapConflictOutput,
  type GetScheduleMcpInput,
} from "../validators.js";

export class ScheduleTools {
  private readonly scheduleRepo: ScheduleRepository;
  private readonly taskRepo: TaskRepository;
  private readonly configRepo: ConfigRepository;
  private readonly replanCoordinator: ReplanCoordinator;
  private readonly conflictDetector: ConflictDetector;
  private readonly logger: Logger;

  constructor(
    scheduleRepo: ScheduleRepository,
    taskRepo: TaskRepository,
    configRepo: ConfigRepository,
    replanCoordinator: ReplanCoordinator,
    conflictDetector: ConflictDetector,
    logger: Logger,
  ) {
    this.scheduleRepo = scheduleRepo;
    this.taskRepo = taskRepo;
    this.configRepo = configRepo;
    this.replanCoordinator = replanCoordinator;
    this.conflictDetector = conflictDetector;
    this.logger = logger;
  }

  getSchedule(input: GetScheduleMcpInput) {
    validateGetScheduleInput(input);

    const timeBlocks = this.scheduleRepo.getSchedule(input.start_date, input.end_date);
    const enrichedBlocks = this.enrichTimeBlocks(timeBlocks);
    const scheduleStatus = this.replanCoordinator.getScheduleStatus();

    const response: {
      schedule: typeof enrichedBlocks;
      schedule_status: string;
      message?: string;
    } = {
      schedule: enrichedBlocks,
      schedule_status: scheduleStatus,
    };

    if (scheduleStatus === "replan_in_progress") {
      response.message =
        "A replan is currently in progress. The returned schedule may not reflect the latest changes. Please try again shortly.";
    }

    return response;
  }

  async replan() {
    await this.replanCoordinator.awaitReplan();

    const preferences = this.configRepo.getPreferences();
    const horizonStart = new Date();
    horizonStart.setUTCHours(0, 0, 0, 0);
    const horizonEnd = new Date(horizonStart);
    horizonEnd.setDate(horizonEnd.getDate() + preferences.schedulingHorizonWeeks * 7);

    const timeBlocks = this.scheduleRepo.getSchedule(
      horizonStart.toISOString(),
      horizonEnd.toISOString(),
    );
    const enrichedBlocks = this.enrichTimeBlocks(timeBlocks);

    const allTasks = this.taskRepo.findAll();
    const availability = this.configRepo.getAvailability();
    const allDeps = this.buildDependencyEdges();
    const conflicts = this.conflictDetector.detectConflicts(
      allTasks,
      timeBlocks,
      availability,
      allDeps,
      new Date(),
    );

    return {
      schedule: enrichedBlocks,
      conflicts: conflicts.map(mapConflictOutput),
      schedule_status: "up_to_date" as const,
      message: "Schedule replanned successfully",
    };
  }

  getConflicts() {
    const allTasks = this.taskRepo.findAll();
    const preferences = this.configRepo.getPreferences();
    const horizonStart = new Date();
    horizonStart.setUTCHours(0, 0, 0, 0);
    const horizonEnd = new Date(horizonStart);
    horizonEnd.setDate(horizonEnd.getDate() + preferences.schedulingHorizonWeeks * 7);

    const timeBlocks = this.scheduleRepo.getSchedule(
      horizonStart.toISOString(),
      horizonEnd.toISOString(),
    );
    const availability = this.configRepo.getAvailability();
    const allDeps = this.buildDependencyEdges();
    const conflicts = this.conflictDetector.detectConflicts(
      allTasks,
      timeBlocks,
      availability,
      allDeps,
      new Date(),
    );

    const scheduleStatus = this.replanCoordinator.getScheduleStatus();

    return {
      conflicts: conflicts.map(mapConflictOutput),
      schedule_status: scheduleStatus,
    };
  }

  private enrichTimeBlocks(timeBlocks: TimeBlock[]) {
    const taskIds = new Set(timeBlocks.map((b) => b.taskId));
    const tasksMap = new Map<string, Task>();

    for (const id of taskIds) {
      const task = this.taskRepo.findById(id);
      if (task) tasksMap.set(id, task);
    }

    return timeBlocks.map((block) => {
      const task = tasksMap.get(block.taskId);
      return {
        id: block.id,
        task_id: block.taskId,
        start_time: block.startTime,
        end_time: block.endTime,
        date: block.date,
        block_index: block.blockIndex,
        total_blocks: block.totalBlocks,
        task_title: task?.title ?? "Unknown",
        task_priority: task?.priority ?? "P3",
        task_category: task?.category ?? null,
        task_status: task?.status ?? "pending",
      };
    });
  }

  private buildDependencyEdges(): DependencyEdge[] {
    return this.taskRepo.getAllDependencyEdges();
  }
}
