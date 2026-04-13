import type { Task } from "../models/task.js";
import type { TimeBlock, ScheduleResult } from "../models/schedule.js";
import type { Event } from "../models/event.js";
import type { Availability, FocusTime } from "../models/config.js";
import type { AtRiskTask } from "../models/conflict.js";
import type { DependencyEdge } from "../models/dependency.js";
import type { TaskRepository } from "../storage/task-repository.js";
import type { EventRepository } from "../storage/event-repository.js";
import type { ConfigRepository } from "../storage/config-repository.js";
import type { ScheduleRepository } from "../storage/schedule-repository.js";
import type { Logger } from "../common/logger.js";
import { generateId } from "../common/id.js";
import { diffMinutes, addMinutes } from "../common/time.js";
import { ConflictDetector } from "./conflict-detector.js";
import { DependencyResolver } from "./dependency-resolver.js";

// --- Public types ---

export interface AvailableSlot {
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

interface SlotScore {
  slot: AvailableSlot;
  totalScore: number;
  breakdown: {
    deadlineProximity: number;
    priority: number;
    focusTime: number;
    energy: number;
    buffer: number;
  };
}

interface EnergyConfig {
  peakEnergyStart: string;
  peakEnergyEnd: string;
  lowEnergyStart: string;
  lowEnergyEnd: string;
}

export const DEFAULT_WEIGHTS = {
  deadlineProximity: 40,
  priority: 30,
  focusTime: 15,
  energy: 10,
  buffer: 5,
};

const FOCUS_TAGS = ["deep-work", "focus"];
const PEAK_ENERGY_TAGS = ["deep-work", "focus"];
const LOW_ENERGY_TAGS = ["routine", "admin"];

// --- Scoring functions (exported for testing) ---

export function deadlineProximityScore(task: Task, _slot: AvailableSlot, now: Date): number {
  if (!task.deadline) return 0.5;

  const deadline = new Date(task.deadline).getTime();
  const nowMs = now.getTime();

  if (deadline <= nowMs) return 1.0; // already overdue — maximum urgency

  // Score based on urgency: how close is the deadline relative to a 28-day horizon?
  const hoursToDeadline = (deadline - nowMs) / 3_600_000;
  const maxHorizonHours = 28 * 24; // 4-week scheduling horizon
  const urgency = 1.0 - Math.min(1.0, hoursToDeadline / maxHorizonHours);
  return Math.max(0, Math.min(1, urgency));
}

export function priorityScore(task: Task): number {
  const scores: Record<string, number> = {
    P1: 1.0,
    P2: 0.75,
    P3: 0.5,
    P4: 0.25,
  };
  return scores[task.priority] ?? 0.5;
}

export function focusTimeScore(task: Task, slot: AvailableSlot, focusTime: FocusTime): number {
  if (focusTime.blocks.length === 0) return 0.5;

  const isFocusTask = task.tags.some((t) => FOCUS_TAGS.includes(t.toLowerCase()));
  const inFocusBlock = isSlotInFocusBlock(slot, focusTime);

  if (isFocusTask && inFocusBlock) return 1.0;
  if (isFocusTask && !inFocusBlock) return 0.0;
  if (!isFocusTask && inFocusBlock) return 0.2;
  return 0.5;
}

export function energyScore(
  task: Task,
  slot: AvailableSlot,
  energyConfig: EnergyConfig | null,
): number {
  if (!energyConfig) return 0.5;

  const isPeakTask = task.tags.some((t) => PEAK_ENERGY_TAGS.includes(t.toLowerCase()));
  const isLowTask = task.tags.some((t) => LOW_ENERGY_TAGS.includes(t.toLowerCase()));

  if (!isPeakTask && !isLowTask) return 0.5;

  const slotTime = extractTime(slot.startTime);

  if (isPeakTask) {
    const inPeak = isTimeInRange(
      slotTime,
      energyConfig.peakEnergyStart,
      energyConfig.peakEnergyEnd,
    );
    return inPeak ? 1.0 : 0.2;
  }

  if (isLowTask) {
    const inLow = isTimeInRange(slotTime, energyConfig.lowEnergyStart, energyConfig.lowEnergyEnd);
    return inLow ? 1.0 : 0.2;
  }

  return 0.5;
}

export function bufferScore(
  slot: AvailableSlot,
  adjacentBlocks: TimeBlock[],
  bufferTimeMinutes: number,
): number {
  let score = 1.0;

  const slotStart = new Date(slot.startTime).getTime();
  const slotEnd = new Date(slot.endTime).getTime();
  const bufferMs = bufferTimeMinutes * 60_000;

  for (const block of adjacentBlocks) {
    const blockEnd = new Date(block.endTime).getTime();
    const blockStart = new Date(block.startTime).getTime();

    // Block ends just before slot starts (within buffer)
    if (blockEnd <= slotStart && slotStart - blockEnd < bufferMs) {
      score -= 0.5;
    }
    // Block starts just after slot ends (within buffer)
    if (blockStart >= slotEnd && blockStart - slotEnd < bufferMs) {
      score -= 0.5;
    }
  }

  return Math.max(0, score);
}

export function scoreSlot(
  task: Task,
  slot: AvailableSlot,
  now: Date,
  focusTime: FocusTime,
  energyConfig: EnergyConfig | null,
  adjacentBlocks: TimeBlock[],
  bufferTimeMinutes: number,
): SlotScore {
  const breakdown = {
    deadlineProximity: deadlineProximityScore(task, slot, now),
    priority: priorityScore(task),
    focusTime: focusTimeScore(task, slot, focusTime),
    energy: energyScore(task, slot, energyConfig),
    buffer: bufferScore(slot, adjacentBlocks, bufferTimeMinutes),
  };

  const totalScore =
    DEFAULT_WEIGHTS.deadlineProximity * breakdown.deadlineProximity +
    DEFAULT_WEIGHTS.priority * breakdown.priority +
    DEFAULT_WEIGHTS.focusTime * breakdown.focusTime +
    DEFAULT_WEIGHTS.energy * breakdown.energy +
    DEFAULT_WEIGHTS.buffer * breakdown.buffer;

  return { slot, totalScore, breakdown };
}

// --- Availability map ---

export function buildAvailabilityMap(
  start: Date,
  end: Date,
  availability: Availability,
  events: Event[],
  pinnedBlocks: TimeBlock[],
): AvailableSlot[] {
  const slots: AvailableSlot[] = [];
  const current = new Date(start);

  while (current < end) {
    const dayOfWeek = current.getUTCDay();
    const dateStr = current.toISOString().slice(0, 10);

    // Check for all-day events blocking this day
    const allDayBlock = events.some((e) => e.isAllDay && e.date === dateStr);

    if (!allDayBlock) {
      // Find availability windows for this day
      const windows = availability.windows.filter((w) => w.day === dayOfWeek);

      for (const window of windows) {
        const windowStart = `${dateStr}T${window.startTime}:00.000Z`;
        const windowEnd = `${dateStr}T${window.endTime}:00.000Z`;

        // Collect all blockers (events + pinned blocks) for this day
        const blockers = collectBlockers(dateStr, windowStart, windowEnd, events, pinnedBlocks);

        // Subtract blockers from the availability window
        const freeSlots = subtractBlockers(windowStart, windowEnd, blockers);

        for (const free of freeSlots) {
          const durationMinutes = diffMinutes(free.start, free.end);
          if (durationMinutes > 0) {
            slots.push({
              date: dateStr,
              startTime: free.start,
              endTime: free.end,
              durationMinutes,
            });
          }
        }
      }
    }

    // Move to next day
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return slots;
}

// --- Scheduler class ---

interface TaskPlacement {
  taskId: string;
  blocks: TimeBlock[];
  unscheduledMinutes: number;
}

export class Scheduler {
  private readonly taskRepo: TaskRepository;
  private readonly eventRepo: EventRepository;
  private readonly configRepo: ConfigRepository;
  private readonly conflictDetector: ConflictDetector;
  private readonly dependencyResolver: DependencyResolver;
  private readonly scheduleRepo: ScheduleRepository;
  private readonly logger: Logger;

  constructor(
    taskRepo: TaskRepository,
    eventRepo: EventRepository,
    configRepo: ConfigRepository,
    conflictDetector: ConflictDetector,
    dependencyResolver: DependencyResolver,
    scheduleRepo: ScheduleRepository,
    logger: Logger,
  ) {
    this.taskRepo = taskRepo;
    this.eventRepo = eventRepo;
    this.configRepo = configRepo;
    this.conflictDetector = conflictDetector;
    this.dependencyResolver = dependencyResolver;
    this.scheduleRepo = scheduleRepo;
    this.logger = logger;
  }

  generateSchedule(start: Date, end: Date): ScheduleResult {
    this.logger.debug("scheduler", {
      event: "generate_start",
      horizonStart: start.toISOString(),
      horizonEnd: end.toISOString(),
    });

    const config = this.configRepo.getFullConfig();
    const now = new Date();

    // 1. Load inputs
    const allTasks = this.taskRepo.findAll();
    const pendingTasks = allTasks.filter(
      (t) => t.status === "pending" || t.status === "scheduled" || t.status === "at_risk",
    );
    const events = this.eventRepo.findInRange(start.toISOString(), end.toISOString());

    // Get pinned blocks (completed/in-progress tasks)
    const existingBlocks = this.scheduleRepo.getSchedule(start.toISOString(), end.toISOString());
    const completedTaskIds = new Set(
      allTasks.filter((t) => t.status === "completed").map((t) => t.id),
    );
    const pinnedBlocks = existingBlocks.filter((b) => completedTaskIds.has(b.taskId));

    // Load dependencies
    const dependencies: DependencyEdge[] = [];
    for (const task of pendingTasks) {
      const deps = this.taskRepo.getDependencies(task.id);
      for (const dep of deps) {
        dependencies.push({ taskId: task.id, dependsOnId: dep.id });
      }
    }

    // 2. Build availability map
    const availableSlots = buildAvailabilityMap(
      start,
      end,
      config.availability,
      events,
      pinnedBlocks,
    );

    // 3. Filter out blocked tasks and order remaining
    const blockedTasks = this.dependencyResolver.getBlockedTasks(pendingTasks, dependencies);
    const blockedIds = new Set(blockedTasks.map((t) => t.id));
    const schedulableTasks = pendingTasks.filter((t) => !blockedIds.has(t.id));

    const schedulableIds = new Set(schedulableTasks.map((t) => t.id));
    const orderedTasks = this.dependencyResolver.topologicalSort(
      schedulableTasks,
      dependencies.filter((d) => schedulableIds.has(d.taskId) && schedulableIds.has(d.dependsOnId)),
    );

    // 4. Place each task
    const allTimeBlocks: TimeBlock[] = [...pinnedBlocks];
    const remainingSlots = [...availableSlots];
    const atRiskTasks: AtRiskTask[] = [];

    for (const task of orderedTasks) {
      const placement = placeTask(
        task,
        remainingSlots,
        allTimeBlocks,
        now,
        config.focusTime,
        null, // energy config — extracted from preferences if set
        config.preferences.bufferTimeMinutes,
        config.preferences.minimumBlockMinutes,
        config.focusTime.minimumBlockMinutes,
      );

      allTimeBlocks.push(...placement.blocks);

      // Remove used slot space
      for (const block of placement.blocks) {
        consumeSlotSpace(remainingSlots, block);
      }

      if (placement.unscheduledMinutes > 0) {
        atRiskTasks.push({
          taskId: task.id,
          reason: `insufficient time: ${placement.unscheduledMinutes} minutes unscheduled`,
        });
      }
    }

    // Add blocked tasks as at-risk
    for (const task of blockedTasks) {
      atRiskTasks.push({
        taskId: task.id,
        reason: "blocked by incomplete dependencies",
      });
    }

    // 5. Run conflict detection
    const newBlocks = allTimeBlocks.filter((b) => !pinnedBlocks.includes(b));
    const conflicts = this.conflictDetector.detectConflicts(
      pendingTasks,
      newBlocks,
      config.availability,
      dependencies,
      now,
    );

    const result = {
      timeBlocks: allTimeBlocks.filter((b) => !pinnedBlocks.includes(b)),
      conflicts,
      atRiskTasks,
    };

    this.logger.info("scheduler", {
      event: "generate_complete",
      blocksCount: result.timeBlocks.length,
      atRiskCount: result.atRiskTasks.length,
    });

    return result;
  }
}

// --- Task placement ---

function adjustForTrailingBlock(
  blockDuration: number,
  remainingMinutes: number,
  minimumBlockMinutes: number,
): number {
  const leftover = remainingMinutes - blockDuration;
  if (leftover > 0 && leftover < minimumBlockMinutes) {
    const adjusted = remainingMinutes - minimumBlockMinutes;
    return adjusted >= minimumBlockMinutes ? adjusted : remainingMinutes;
  }
  return blockDuration;
}

export function placeTask(
  task: Task,
  availableSlots: AvailableSlot[],
  existingBlocks: TimeBlock[],
  now: Date,
  focusTime: FocusTime,
  energyConfig: EnergyConfig | null,
  bufferTimeMinutes: number,
  minimumBlockMinutes: number,
  focusMinimumBlockMinutes: number,
): TaskPlacement {
  let remainingMinutes = task.duration;
  const blocks: TimeBlock[] = [];
  let blockIndex = 0;

  // Score all available slots
  const scoredSlots = availableSlots
    .filter((s) => s.durationMinutes >= minimumBlockMinutes)
    .map((slot) =>
      scoreSlot(task, slot, now, focusTime, energyConfig, existingBlocks, bufferTimeMinutes),
    )
    .sort((a, b) => b.totalScore - a.totalScore);

  // Apply focus time fragmentation prevention
  const isFocusTask = task.tags.some((t) => FOCUS_TAGS.includes(t.toLowerCase()));

  for (const scored of scoredSlots) {
    if (remainingMinutes <= 0) break;

    const slot = scored.slot;

    // Focus fragmentation prevention: don't place short non-focus tasks in focus blocks
    if (!isFocusTask && isSlotInFocusBlock(slot, focusTime)) {
      if (task.duration < focusMinimumBlockMinutes) {
        continue; // Skip focus block for short non-focus tasks
      }
    }

    const rawDuration = Math.min(remainingMinutes, slot.durationMinutes);
    const blockDuration = adjustForTrailingBlock(
      rawDuration,
      remainingMinutes,
      minimumBlockMinutes,
    );

    blocks.push({
      id: generateId(),
      taskId: task.id,
      startTime: slot.startTime,
      endTime: addMinutes(slot.startTime, blockDuration),
      date: slot.date,
      blockIndex,
      totalBlocks: 0, // Updated below
    });

    remainingMinutes -= blockDuration;
    blockIndex++;
  }

  // Update totalBlocks
  for (const block of blocks) {
    block.totalBlocks = blocks.length;
  }

  return {
    taskId: task.id,
    blocks,
    unscheduledMinutes: Math.max(0, remainingMinutes),
  };
}

// --- Helpers ---

function isSlotInFocusBlock(slot: AvailableSlot, focusTime: FocusTime): boolean {
  const slotDate = new Date(slot.startTime);
  const dayOfWeek = slotDate.getUTCDay();
  const slotTimeStr = extractTime(slot.startTime);

  return focusTime.blocks.some(
    (fb) => fb.day === dayOfWeek && slotTimeStr >= fb.startTime && slotTimeStr < fb.endTime,
  );
}

function extractTime(isoString: string): string {
  return isoString.slice(11, 16);
}

function isTimeInRange(time: string, start: string, end: string): boolean {
  return time >= start && time < end;
}

interface Blocker {
  start: string;
  end: string;
}

function clipToWindow(
  start: string,
  end: string,
  windowStart: string,
  windowEnd: string,
): Blocker | null {
  if (start >= windowEnd || end <= windowStart) return null;
  return {
    start: start < windowStart ? windowStart : start,
    end: end > windowEnd ? windowEnd : end,
  };
}

function collectBlockers(
  _dateStr: string,
  windowStart: string,
  windowEnd: string,
  events: Event[],
  pinnedBlocks: TimeBlock[],
): Blocker[] {
  const blockers: Blocker[] = [];

  for (const event of events) {
    if (event.isAllDay || !event.startTime || !event.endTime) continue;
    const clipped = clipToWindow(event.startTime, event.endTime, windowStart, windowEnd);
    if (clipped) blockers.push(clipped);
  }

  for (const block of pinnedBlocks) {
    const clipped = clipToWindow(block.startTime, block.endTime, windowStart, windowEnd);
    if (clipped) blockers.push(clipped);
  }

  blockers.sort((a, b) => a.start.localeCompare(b.start));
  return blockers;
}

function subtractBlockers(
  windowStart: string,
  windowEnd: string,
  blockers: Blocker[],
): { start: string; end: string }[] {
  const freeSlots: { start: string; end: string }[] = [];
  let currentStart = windowStart;

  for (const blocker of blockers) {
    if (blocker.start > currentStart) {
      freeSlots.push({ start: currentStart, end: blocker.start });
    }
    if (blocker.end > currentStart) {
      currentStart = blocker.end;
    }
  }

  if (currentStart < windowEnd) {
    freeSlots.push({ start: currentStart, end: windowEnd });
  }

  return freeSlots;
}

function splitSlotAroundBlock(
  slot: AvailableSlot,
  blockStart: number,
  blockEnd: number,
  blockStartTime: string,
  blockEndTime: string,
): AvailableSlot[] {
  const slotStart = new Date(slot.startTime).getTime();
  const slotEnd = new Date(slot.endTime).getTime();
  const remaining: AvailableSlot[] = [];

  if (blockStart > slotStart) {
    const beforeDuration = (blockStart - slotStart) / 60_000;
    if (beforeDuration > 0) {
      remaining.push({
        date: slot.date,
        startTime: slot.startTime,
        endTime: blockStartTime,
        durationMinutes: beforeDuration,
      });
    }
  }
  if (blockEnd < slotEnd) {
    const afterDuration = (slotEnd - blockEnd) / 60_000;
    if (afterDuration > 0) {
      remaining.push({
        date: slot.date,
        startTime: blockEndTime,
        endTime: slot.endTime,
        durationMinutes: afterDuration,
      });
    }
  }

  return remaining;
}

function consumeSlotSpace(slots: AvailableSlot[], block: TimeBlock): void {
  const blockStart = new Date(block.startTime).getTime();
  const blockEnd = new Date(block.endTime).getTime();

  for (let i = slots.length - 1; i >= 0; i--) {
    const slot = slots[i];
    const slotStart = new Date(slot.startTime).getTime();
    const slotEnd = new Date(slot.endTime).getTime();

    if (blockStart < slotEnd && blockEnd > slotStart) {
      slots.splice(i, 1);
      const remaining = splitSlotAroundBlock(
        slot,
        blockStart,
        blockEnd,
        block.startTime,
        block.endTime,
      );
      for (const r of remaining) {
        slots.push(r);
      }
    }
  }
}
