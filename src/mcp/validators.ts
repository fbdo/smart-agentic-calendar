import { ValidationError } from "../models/errors.js";
import type { Task, TaskPriority, TaskStatus } from "../models/task.js";
import type { Event } from "../models/event.js";
import type { TimeBlock } from "../models/schedule.js";
import type { Conflict } from "../models/conflict.js";
import type {
  ProductivityStats,
  ScheduleHealth,
  EstimationAccuracy,
  TimeAllocation,
} from "../models/analytics.js";
import type { Availability, DayOfWeek, FocusTime, Preferences } from "../models/config.js";
import type { TaskFilters } from "../storage/task-repository.js";
import {
  VALID_PRIORITIES,
  VALID_PERIODS,
  DEFAULT_PRIORITY,
  DEFAULT_FOCUS_TIME_MINIMUM_BLOCK_MINUTES,
  MAX_SCHEDULING_HORIZON_WEEKS,
  MIN_MINIMUM_BLOCK_MINUTES,
  MAX_MINIMUM_BLOCK_MINUTES,
} from "../common/constants.js";
import { isValidISO8601, isValidTimeHHMM } from "../common/time.js";

const INVALID_PRIORITY_MESSAGE = "invalid priority: must be P1, P2, P3, or P4";
const END_BEFORE_START_MESSAGE = "end time must be after start time";

// ── MCP Input Types (snake_case) ─────────────────────────────────────

export interface CreateTaskMcpInput {
  title?: string;
  description?: string;
  estimated_duration?: number;
  deadline?: string;
  priority?: string;
  category?: string;
  tags?: string[];
  recurrence_rule?: string;
  blocked_by?: string[];
}

export interface UpdateTaskMcpInput {
  task_id?: string;
  title?: string;
  description?: string;
  estimated_duration?: number;
  deadline?: string;
  priority?: string;
  category?: string;
  tags?: string[];
  blocked_by?: string[];
}

export interface CompleteTaskMcpInput {
  task_id?: string;
  actual_duration_minutes?: number;
}

export interface DeleteTaskMcpInput {
  task_id: string;
}

export interface ListTasksMcpInput {
  status?: string;
  priority?: string;
  deadline_before?: string;
  deadline_after?: string;
  category?: string;
}

export interface CreateEventMcpInput {
  title?: string;
  start_time?: string;
  end_time?: string;
  is_all_day?: boolean;
  date?: string;
}

export interface UpdateEventMcpInput {
  event_id?: string;
  title?: string;
  start_time?: string;
  end_time?: string;
  is_all_day?: boolean;
  date?: string;
}

export interface DeleteEventMcpInput {
  event_id: string;
}

export interface ListEventsMcpInput {
  start_date: string;
  end_date: string;
}

export interface GetScheduleMcpInput {
  start_date: string;
  end_date: string;
}

export interface SetAvailabilityMcpInput {
  windows: { day: number; start_time: string; end_time: string }[];
}

export interface SetFocusTimeMcpInput {
  blocks: { day: number; start_time: string; end_time: string }[];
  minimum_block_minutes?: number;
}

export interface SetPreferencesMcpInput {
  buffer_time_minutes?: number;
  default_priority?: string;
  default_duration?: number;
  scheduling_horizon_weeks?: number;
  minimum_block_minutes?: number;
}

// ── Internal mapped types ────────────────────────────────────────────

type TaskInput = Omit<Task, "id" | "createdAt" | "updatedAt" | "status" | "actualDuration">;
type TaskUpdates = Partial<
  Pick<Task, "title" | "description" | "duration" | "deadline" | "priority" | "category" | "tags">
>;
type EventInput = Omit<Event, "id" | "createdAt" | "updatedAt">;
type EventUpdates = Partial<Pick<Event, "title" | "startTime" | "endTime" | "isAllDay" | "date">>;

// ── Validation Functions ─────────────────────────────────────────────

export function validateCreateTaskInput(input: CreateTaskMcpInput): void {
  if (!input.title || !input.title.trim()) {
    throw new ValidationError("title is required");
  }
  if (input.estimated_duration == null) {
    throw new ValidationError("estimated_duration is required");
  }
  if (input.estimated_duration <= 0) {
    throw new ValidationError("duration must be a positive number of minutes");
  }
  if (input.priority !== undefined && !VALID_PRIORITIES.includes(input.priority as TaskPriority)) {
    throw new ValidationError(INVALID_PRIORITY_MESSAGE);
  }
  if (input.deadline !== undefined && !isValidISO8601(input.deadline)) {
    throw new ValidationError("deadline must be a valid ISO 8601 date");
  }
}

export function validateUpdateTaskInput(input: UpdateTaskMcpInput): void {
  if (!input.task_id) {
    throw new ValidationError("task_id is required");
  }
  const hasUpdate =
    input.title !== undefined ||
    input.description !== undefined ||
    input.estimated_duration !== undefined ||
    input.deadline !== undefined ||
    input.priority !== undefined ||
    input.category !== undefined ||
    input.tags !== undefined ||
    input.blocked_by !== undefined;
  if (!hasUpdate) {
    throw new ValidationError("at least one update field is required");
  }
  if (input.estimated_duration !== undefined && input.estimated_duration <= 0) {
    throw new ValidationError("duration must be a positive number of minutes");
  }
  if (input.priority !== undefined && !VALID_PRIORITIES.includes(input.priority as TaskPriority)) {
    throw new ValidationError(INVALID_PRIORITY_MESSAGE);
  }
}

export function validateCompleteTaskInput(input: CompleteTaskMcpInput): void {
  if (!input.task_id) {
    throw new ValidationError("task_id is required");
  }
  if (input.actual_duration_minutes !== undefined && input.actual_duration_minutes <= 0) {
    throw new ValidationError("actual_duration_minutes must be a positive number");
  }
}

export function validateCreateEventInput(input: CreateEventMcpInput): void {
  if (!input.title || !input.title.trim()) {
    throw new ValidationError("title is required");
  }
  if (input.is_all_day) {
    if (!input.date) {
      throw new ValidationError("date is required for all-day events");
    }
  } else {
    if (!input.start_time) {
      throw new ValidationError("start_time is required for timed events");
    }
    if (!input.end_time) {
      throw new ValidationError("end_time is required for timed events");
    }
    if (input.end_time <= input.start_time) {
      throw new ValidationError(END_BEFORE_START_MESSAGE);
    }
  }
}

export function validateUpdateEventInput(input: UpdateEventMcpInput): void {
  if (!input.event_id) {
    throw new ValidationError("event_id is required");
  }
  if (
    input.start_time !== undefined &&
    input.end_time !== undefined &&
    input.end_time <= input.start_time
  ) {
    throw new ValidationError(END_BEFORE_START_MESSAGE);
  }
  if (input.is_all_day === true && input.date === undefined) {
    throw new ValidationError("date is required for all-day events");
  }
}

function validateDateRange(input: { start_date: string; end_date: string }): void {
  if (input.end_date < input.start_date) {
    throw new ValidationError("end_date must not be before start_date");
  }
}

export function validateListEventsInput(input: ListEventsMcpInput): void {
  validateDateRange(input);
}

export function validateGetScheduleInput(input: GetScheduleMcpInput): void {
  validateDateRange(input);
}

export function validatePeriodInput(period: string): void {
  if (!VALID_PERIODS.includes(period as "day" | "week" | "month")) {
    throw new ValidationError("invalid period: must be day, week, or month");
  }
}

export function validateSetAvailabilityInput(input: SetAvailabilityMcpInput): void {
  if (!input.windows || input.windows.length === 0) {
    throw new ValidationError("windows must not be empty");
  }
  for (const window of input.windows) {
    validateDayAndTime(window.day, window.start_time, window.end_time);
  }
}

export function validateSetFocusTimeInput(input: SetFocusTimeMcpInput): void {
  if (!input.blocks || input.blocks.length === 0) {
    throw new ValidationError("blocks must not be empty");
  }
  for (const block of input.blocks) {
    validateDayAndTime(block.day, block.start_time, block.end_time);
  }
  if (
    input.minimum_block_minutes !== undefined &&
    (input.minimum_block_minutes < MIN_MINIMUM_BLOCK_MINUTES ||
      input.minimum_block_minutes > MAX_MINIMUM_BLOCK_MINUTES)
  ) {
    throw new ValidationError(
      `minimum_block_minutes must be between ${MIN_MINIMUM_BLOCK_MINUTES} and ${MAX_MINIMUM_BLOCK_MINUTES}`,
    );
  }
}

export function validateSetPreferencesInput(input: SetPreferencesMcpInput): void {
  const hasField =
    input.buffer_time_minutes !== undefined ||
    input.default_priority !== undefined ||
    input.default_duration !== undefined ||
    input.scheduling_horizon_weeks !== undefined ||
    input.minimum_block_minutes !== undefined;

  if (!hasField) {
    throw new ValidationError("at least one preference field is required");
  }

  if (input.buffer_time_minutes !== undefined && input.buffer_time_minutes < 0) {
    throw new ValidationError("buffer_time_minutes must be non-negative");
  }
  if (
    input.default_priority !== undefined &&
    !VALID_PRIORITIES.includes(input.default_priority as TaskPriority)
  ) {
    throw new ValidationError(INVALID_PRIORITY_MESSAGE);
  }
  if (input.default_duration !== undefined && input.default_duration <= 0) {
    throw new ValidationError("default_duration must be a positive number");
  }
  if (
    input.scheduling_horizon_weeks !== undefined &&
    (input.scheduling_horizon_weeks < 1 ||
      input.scheduling_horizon_weeks > MAX_SCHEDULING_HORIZON_WEEKS)
  ) {
    throw new ValidationError(
      `scheduling_horizon_weeks must be between 1 and ${MAX_SCHEDULING_HORIZON_WEEKS}`,
    );
  }
  if (
    input.minimum_block_minutes !== undefined &&
    (input.minimum_block_minutes < MIN_MINIMUM_BLOCK_MINUTES ||
      input.minimum_block_minutes > MAX_MINIMUM_BLOCK_MINUTES)
  ) {
    throw new ValidationError(
      `minimum_block_minutes must be between ${MIN_MINIMUM_BLOCK_MINUTES} and ${MAX_MINIMUM_BLOCK_MINUTES}`,
    );
  }
}

function validateDayAndTime(day: number, startTime: string, endTime: string): void {
  if (day < 0 || day > 6 || !Number.isInteger(day)) {
    throw new ValidationError("invalid day of week");
  }
  if (!isValidTimeHHMM(startTime)) {
    throw new ValidationError("invalid time format");
  }
  if (!isValidTimeHHMM(endTime)) {
    throw new ValidationError("invalid time format");
  }
  if (endTime <= startTime) {
    throw new ValidationError(END_BEFORE_START_MESSAGE);
  }
}

// ── Input Mapping Functions (snake_case → camelCase) ─────────────────

export function mapCreateTaskInput(input: CreateTaskMcpInput): {
  taskData: TaskInput;
  recurrenceRule?: string;
  blockedBy?: string[];
} {
  const title = input.title ?? "";
  const estimatedDuration = input.estimated_duration ?? 0;

  return {
    taskData: {
      title: title.trim(),
      description: input.description ?? null,
      duration: estimatedDuration,
      deadline: input.deadline ?? null,
      priority: (input.priority as TaskPriority) ?? DEFAULT_PRIORITY,
      category: input.category ?? null,
      tags: input.tags ?? [],
      isRecurring: input.recurrence_rule != null,
      recurrenceTemplateId: null,
    },
    recurrenceRule: input.recurrence_rule,
    blockedBy: input.blocked_by,
  };
}

export function mapUpdateTaskInput(input: UpdateTaskMcpInput): {
  id: string;
  updates: TaskUpdates;
  blockedBy?: string[];
} {
  const updates: TaskUpdates = {};
  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.estimated_duration !== undefined) updates.duration = input.estimated_duration;
  if (input.deadline !== undefined) updates.deadline = input.deadline;
  if (input.priority !== undefined) updates.priority = input.priority as TaskPriority;
  if (input.category !== undefined) updates.category = input.category;
  if (input.tags !== undefined) updates.tags = input.tags;

  return {
    id: input.task_id ?? "",
    updates,
    blockedBy: input.blocked_by,
  };
}

export function mapListTasksInput(input: ListTasksMcpInput): TaskFilters {
  const filters: TaskFilters = {};
  if (input.status !== undefined) filters.status = input.status as TaskStatus;
  if (input.priority !== undefined) filters.priority = input.priority as TaskPriority;
  if (input.deadline_before !== undefined) filters.deadlineBefore = input.deadline_before;
  if (input.deadline_after !== undefined) filters.deadlineAfter = input.deadline_after;
  if (input.category !== undefined) filters.category = input.category;
  return filters;
}

export function mapCreateEventInput(input: CreateEventMcpInput): EventInput {
  const title = (input.title ?? "").trim();

  if (input.is_all_day) {
    return {
      title,
      startTime: null,
      endTime: null,
      isAllDay: true,
      date: input.date ?? "",
    };
  }
  return {
    title,
    startTime: input.start_time ?? "",
    endTime: input.end_time ?? "",
    isAllDay: false,
    date: null,
  };
}

export function mapUpdateEventInput(input: UpdateEventMcpInput): {
  id: string;
  updates: EventUpdates;
} {
  const updates: EventUpdates = {};
  if (input.title !== undefined) updates.title = input.title;
  if (input.start_time !== undefined) updates.startTime = input.start_time;
  if (input.end_time !== undefined) updates.endTime = input.end_time;
  if (input.is_all_day !== undefined) updates.isAllDay = input.is_all_day;
  if (input.date !== undefined) updates.date = input.date;

  return { id: input.event_id ?? "", updates };
}

export function mapSetAvailabilityInput(input: SetAvailabilityMcpInput): Availability {
  return {
    windows: input.windows.map((w) => ({
      day: w.day as DayOfWeek,
      startTime: w.start_time,
      endTime: w.end_time,
    })),
  };
}

export function mapSetFocusTimeInput(input: SetFocusTimeMcpInput): FocusTime {
  return {
    blocks: input.blocks.map((b) => ({
      day: b.day as DayOfWeek,
      startTime: b.start_time,
      endTime: b.end_time,
    })),
    minimumBlockMinutes: input.minimum_block_minutes ?? DEFAULT_FOCUS_TIME_MINIMUM_BLOCK_MINUTES,
  };
}

export function mapSetPreferencesInput(input: SetPreferencesMcpInput): Partial<Preferences> {
  const result: Partial<Preferences> = {};
  if (input.buffer_time_minutes !== undefined) result.bufferTimeMinutes = input.buffer_time_minutes;
  if (input.default_priority !== undefined)
    result.defaultPriority = input.default_priority as TaskPriority;
  if (input.default_duration !== undefined) result.defaultDuration = input.default_duration;
  if (input.scheduling_horizon_weeks !== undefined)
    result.schedulingHorizonWeeks = input.scheduling_horizon_weeks;
  if (input.minimum_block_minutes !== undefined)
    result.minimumBlockMinutes = input.minimum_block_minutes;
  return result;
}

// ── Output Mapping Functions (camelCase → snake_case) ────────────────

export function mapTaskOutput(task: Task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    estimated_duration: task.duration,
    deadline: task.deadline,
    priority: task.priority,
    status: task.status,
    category: task.category,
    tags: task.tags,
    is_recurring: task.isRecurring,
    recurrence_template_id: task.recurrenceTemplateId,
    actual_duration: task.actualDuration,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  };
}

export function mapEventOutput(event: Event) {
  return {
    id: event.id,
    title: event.title,
    start_time: event.startTime,
    end_time: event.endTime,
    is_all_day: event.isAllDay,
    date: event.date,
    created_at: event.createdAt,
    updated_at: event.updatedAt,
  };
}

export function mapTimeBlockOutput(block: TimeBlock, task: Task) {
  return {
    id: block.id,
    task_id: block.taskId,
    start_time: block.startTime,
    end_time: block.endTime,
    date: block.date,
    block_index: block.blockIndex,
    total_blocks: block.totalBlocks,
    task_title: task.title,
    task_priority: task.priority,
    task_category: task.category,
    task_status: task.status,
  };
}

export function mapConflictOutput(conflict: Conflict) {
  return {
    task_id: conflict.taskId,
    reason: conflict.reason,
    deadline: conflict.deadline,
    required_minutes: conflict.requiredMinutes,
    available_minutes: conflict.availableMinutes,
    competing_task_ids: conflict.competingTaskIds,
    suggestions: conflict.suggestions.map((s) => ({
      task_id: s.taskId,
      current_priority: s.currentPriority,
      freed_minutes: s.freedMinutes,
    })),
  };
}

export function mapProductivityOutput(stats: ProductivityStats) {
  return {
    period: stats.period,
    tasks_completed: stats.tasksCompleted,
    tasks_overdue: stats.tasksOverdue,
    tasks_cancelled: stats.tasksCancelled,
    completion_rate: stats.completionRate,
    on_time_rate: stats.onTimeRate,
  };
}

export function mapHealthOutput(health: ScheduleHealth) {
  return {
    health_score: health.healthScore,
    utilization_percentage: health.utilizationPercentage,
    overdue_count: health.overdueCount,
    at_risk_count: health.atRiskCount,
    free_hours_this_week: health.freeHoursThisWeek,
    busiest_day: health.busiestDay,
    lightest_day: health.lightestDay,
  };
}

export function mapEstimationOutput(accuracy: EstimationAccuracy) {
  return {
    average_accuracy_percentage: accuracy.averageAccuracyPercentage,
    overestimate_count: accuracy.overestimateCount,
    underestimate_count: accuracy.underestimateCount,
    average_overestimate_minutes: accuracy.averageOverestimateMinutes,
    average_underestimate_minutes: accuracy.averageUnderestimateMinutes,
    accuracy_by_category: accuracy.accuracyByCategory,
  };
}

export function mapAllocationOutput(allocation: TimeAllocation) {
  return {
    period: allocation.period,
    categories: allocation.categories.map((c) => ({
      category: c.category,
      hours: c.hours,
      percentage: c.percentage,
    })),
  };
}

export function mapAvailabilityOutput(availability: Availability) {
  return availability.windows.map((w) => ({
    day: w.day,
    start_time: w.startTime,
    end_time: w.endTime,
  }));
}

export function mapFocusTimeOutput(focusTime: FocusTime) {
  return {
    blocks: focusTime.blocks.map((b) => ({
      day: b.day,
      start_time: b.startTime,
      end_time: b.endTime,
    })),
    minimum_block_minutes: focusTime.minimumBlockMinutes,
  };
}

export function mapPreferencesOutput(preferences: Preferences) {
  return {
    buffer_time_minutes: preferences.bufferTimeMinutes,
    default_priority: preferences.defaultPriority,
    default_duration: preferences.defaultDuration,
    scheduling_horizon_weeks: preferences.schedulingHorizonWeeks,
    minimum_block_minutes: preferences.minimumBlockMinutes,
  };
}
