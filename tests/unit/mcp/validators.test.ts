import { describe, it, expect } from "vitest";
import {
  validateCreateTaskInput,
  validateUpdateTaskInput,
  validateCompleteTaskInput,
  validateCreateEventInput,
  validateListEventsInput,
  validateGetScheduleInput,
  validatePeriodInput,
  validateSetAvailabilityInput,
  validateSetFocusTimeInput,
  validateSetPreferencesInput,
  mapCreateTaskInput,
  mapUpdateTaskInput,
  mapListTasksInput,
  mapCreateEventInput,
  mapUpdateEventInput,
  mapSetAvailabilityInput,
  mapSetFocusTimeInput,
  mapSetPreferencesInput,
  mapTaskOutput,
  mapEventOutput,
  mapTimeBlockOutput,
  mapConflictOutput,
  mapProductivityOutput,
  mapHealthOutput,
  mapEstimationOutput,
  mapAllocationOutput,
  mapAvailabilityOutput,
  mapFocusTimeOutput,
  mapPreferencesOutput,
} from "../../../src/mcp/validators.js";
import { ValidationError } from "../../../src/models/errors.js";
import type { Task } from "../../../src/models/task.js";
import type { Event } from "../../../src/models/event.js";
import type { TimeBlock } from "../../../src/models/schedule.js";
import type { Conflict } from "../../../src/models/conflict.js";
import type {
  ProductivityStats,
  ScheduleHealth,
  EstimationAccuracy,
  TimeAllocation,
} from "../../../src/models/analytics.js";
import type { Availability, FocusTime, Preferences } from "../../../src/models/config.js";

// ── Input Mapping Tests ──────────────────────────────────────────────

describe("mapCreateTaskInput", () => {
  it("maps full snake_case input to camelCase with all fields", () => {
    const result = mapCreateTaskInput({
      title: "  My Task  ",
      description: "desc",
      estimated_duration: 60,
      deadline: "2026-04-15T00:00:00.000Z",
      priority: "P1",
      category: "work",
      tags: ["a", "b"],
      recurrence_rule: "FREQ=DAILY",
      blocked_by: ["id-1", "id-2"],
    });

    expect(result.taskData.title).toBe("My Task");
    expect(result.taskData.description).toBe("desc");
    expect(result.taskData.duration).toBe(60);
    expect(result.taskData.deadline).toBe("2026-04-15T00:00:00.000Z");
    expect(result.taskData.priority).toBe("P1");
    expect(result.taskData.category).toBe("work");
    expect(result.taskData.tags).toEqual(["a", "b"]);
    expect(result.taskData.isRecurring).toBe(true);
    expect(result.taskData.recurrenceTemplateId).toBeNull();
    expect(result.recurrenceRule).toBe("FREQ=DAILY");
    expect(result.blockedBy).toEqual(["id-1", "id-2"]);
  });

  it("applies defaults for omitted optional fields", () => {
    const result = mapCreateTaskInput({
      title: "Task",
      estimated_duration: 30,
    });

    expect(result.taskData.priority).toBe("P3");
    expect(result.taskData.description).toBeNull();
    expect(result.taskData.category).toBeNull();
    expect(result.taskData.tags).toEqual([]);
    expect(result.taskData.isRecurring).toBe(false);
    expect(result.recurrenceRule).toBeUndefined();
    expect(result.blockedBy).toBeUndefined();
  });

  it("sets isRecurring=true when recurrence_rule is present", () => {
    const result = mapCreateTaskInput({
      title: "Task",
      estimated_duration: 30,
      recurrence_rule: "FREQ=WEEKLY",
    });
    expect(result.taskData.isRecurring).toBe(true);
  });
});

describe("mapUpdateTaskInput", () => {
  it("extracts task_id and maps only provided update fields", () => {
    const result = mapUpdateTaskInput({
      task_id: "abc-123",
      title: "New title",
      estimated_duration: 90,
      priority: "P2",
    });

    expect(result.id).toBe("abc-123");
    expect(result.updates.title).toBe("New title");
    expect(result.updates.duration).toBe(90);
    expect(result.updates.priority).toBe("P2");
    expect(result.updates.description).toBeUndefined();
    expect(result.updates.deadline).toBeUndefined();
    expect(result.blockedBy).toBeUndefined();
  });

  it("maps blocked_by separately", () => {
    const result = mapUpdateTaskInput({
      task_id: "abc-123",
      blocked_by: ["dep-1"],
    });
    expect(result.blockedBy).toEqual(["dep-1"]);
  });
});

describe("mapListTasksInput", () => {
  it("maps snake_case filter fields to camelCase TaskFilters", () => {
    const result = mapListTasksInput({
      status: "pending",
      priority: "P1",
      deadline_before: "2026-05-01T00:00:00.000Z",
      deadline_after: "2026-04-01T00:00:00.000Z",
      category: "work",
    });

    expect(result.status).toBe("pending");
    expect(result.priority).toBe("P1");
    expect(result.deadlineBefore).toBe("2026-05-01T00:00:00.000Z");
    expect(result.deadlineAfter).toBe("2026-04-01T00:00:00.000Z");
    expect(result.category).toBe("work");
  });

  it("returns empty filters for no input", () => {
    const result = mapListTasksInput({});
    expect(result).toEqual({});
  });
});

describe("mapCreateEventInput", () => {
  it("maps timed event with start_time/end_time", () => {
    const result = mapCreateEventInput({
      title: "Meeting",
      start_time: "2026-04-10T09:00:00.000Z",
      end_time: "2026-04-10T10:00:00.000Z",
    });

    expect(result.title).toBe("Meeting");
    expect(result.startTime).toBe("2026-04-10T09:00:00.000Z");
    expect(result.endTime).toBe("2026-04-10T10:00:00.000Z");
    expect(result.isAllDay).toBe(false);
    expect(result.date).toBeNull();
  });

  it("maps all-day event with date", () => {
    const result = mapCreateEventInput({
      title: "Holiday",
      is_all_day: true,
      date: "2026-04-15",
    });

    expect(result.title).toBe("Holiday");
    expect(result.isAllDay).toBe(true);
    expect(result.date).toBe("2026-04-15");
    expect(result.startTime).toBeNull();
    expect(result.endTime).toBeNull();
  });
});

describe("mapUpdateEventInput", () => {
  it("extracts event_id and maps update fields", () => {
    const result = mapUpdateEventInput({
      event_id: "evt-1",
      title: "Updated",
      start_time: "2026-04-10T10:00:00.000Z",
    });
    expect(result.id).toBe("evt-1");
    expect(result.updates.title).toBe("Updated");
    expect(result.updates.startTime).toBe("2026-04-10T10:00:00.000Z");
  });
});

describe("mapSetAvailabilityInput", () => {
  it("maps windows array with snake_case to DayAvailability[]", () => {
    const result = mapSetAvailabilityInput({
      windows: [
        { day: 1, start_time: "09:00", end_time: "17:00" },
        { day: 2, start_time: "08:00", end_time: "16:00" },
      ],
    });

    expect(result.windows).toHaveLength(2);
    expect(result.windows[0]).toEqual({ day: 1, startTime: "09:00", endTime: "17:00" });
    expect(result.windows[1]).toEqual({ day: 2, startTime: "08:00", endTime: "16:00" });
  });
});

describe("mapSetFocusTimeInput", () => {
  it("maps blocks and minimum_block_minutes", () => {
    const result = mapSetFocusTimeInput({
      blocks: [{ day: 1, start_time: "09:00", end_time: "12:00" }],
      minimum_block_minutes: 45,
    });

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toEqual({ day: 1, startTime: "09:00", endTime: "12:00" });
    expect(result.minimumBlockMinutes).toBe(45);
  });

  it("applies default minimum_block_minutes when omitted", () => {
    const result = mapSetFocusTimeInput({
      blocks: [{ day: 3, start_time: "10:00", end_time: "12:00" }],
    });
    expect(result.minimumBlockMinutes).toBe(60);
  });
});

describe("mapSetPreferencesInput", () => {
  it("maps partial preferences (only provided fields)", () => {
    const result = mapSetPreferencesInput({
      buffer_time_minutes: 10,
      default_priority: "P2",
    });

    expect(result.bufferTimeMinutes).toBe(10);
    expect(result.defaultPriority).toBe("P2");
    expect(result.defaultDuration).toBeUndefined();
    expect(result.schedulingHorizonWeeks).toBeUndefined();
    expect(result.minimumBlockMinutes).toBeUndefined();
  });
});

// ── Output Mapping Tests ─────────────────────────────────────────────

const sampleTask: Task = {
  id: "t-1",
  title: "Test Task",
  description: "desc",
  duration: 60,
  deadline: "2026-04-15T00:00:00.000Z",
  priority: "P1",
  status: "pending",
  category: "work",
  tags: ["tag1"],
  isRecurring: true,
  recurrenceTemplateId: "tmpl-1",
  actualDuration: 55,
  createdAt: "2026-04-10T00:00:00.000Z",
  updatedAt: "2026-04-10T01:00:00.000Z",
};

describe("mapTaskOutput", () => {
  it("maps all camelCase fields to snake_case", () => {
    const result = mapTaskOutput(sampleTask);

    expect(result.id).toBe("t-1");
    expect(result.title).toBe("Test Task");
    expect(result.description).toBe("desc");
    expect(result.estimated_duration).toBe(60);
    expect(result.deadline).toBe("2026-04-15T00:00:00.000Z");
    expect(result.priority).toBe("P1");
    expect(result.status).toBe("pending");
    expect(result.category).toBe("work");
    expect(result.tags).toEqual(["tag1"]);
    expect(result.is_recurring).toBe(true);
    expect(result.recurrence_template_id).toBe("tmpl-1");
    expect(result.actual_duration).toBe(55);
    expect(result.created_at).toBe("2026-04-10T00:00:00.000Z");
    expect(result.updated_at).toBe("2026-04-10T01:00:00.000Z");
  });
});

const sampleEvent: Event = {
  id: "e-1",
  title: "Meeting",
  startTime: "2026-04-10T09:00:00.000Z",
  endTime: "2026-04-10T10:00:00.000Z",
  isAllDay: false,
  date: null,
  createdAt: "2026-04-10T00:00:00.000Z",
  updatedAt: "2026-04-10T00:00:00.000Z",
};

describe("mapEventOutput", () => {
  it("maps all event fields correctly", () => {
    const result = mapEventOutput(sampleEvent);

    expect(result.id).toBe("e-1");
    expect(result.title).toBe("Meeting");
    expect(result.start_time).toBe("2026-04-10T09:00:00.000Z");
    expect(result.end_time).toBe("2026-04-10T10:00:00.000Z");
    expect(result.is_all_day).toBe(false);
    expect(result.date).toBeNull();
    expect(result.created_at).toBe("2026-04-10T00:00:00.000Z");
    expect(result.updated_at).toBe("2026-04-10T00:00:00.000Z");
  });
});

describe("mapTimeBlockOutput", () => {
  it("enriches with task_title, task_priority, task_category, task_status", () => {
    const block: TimeBlock = {
      id: "b-1",
      taskId: "t-1",
      startTime: "2026-04-10T09:00:00.000Z",
      endTime: "2026-04-10T10:00:00.000Z",
      date: "2026-04-10",
      blockIndex: 0,
      totalBlocks: 2,
    };
    const result = mapTimeBlockOutput(block, sampleTask);

    expect(result.id).toBe("b-1");
    expect(result.task_id).toBe("t-1");
    expect(result.start_time).toBe("2026-04-10T09:00:00.000Z");
    expect(result.end_time).toBe("2026-04-10T10:00:00.000Z");
    expect(result.date).toBe("2026-04-10");
    expect(result.block_index).toBe(0);
    expect(result.total_blocks).toBe(2);
    expect(result.task_title).toBe("Test Task");
    expect(result.task_priority).toBe("P1");
    expect(result.task_category).toBe("work");
    expect(result.task_status).toBe("pending");
  });
});

describe("mapConflictOutput", () => {
  it("maps all Conflict fields to snake_case including nested suggestions", () => {
    const conflict: Conflict = {
      taskId: "t-1",
      reason: "insufficient_time",
      deadline: "2026-04-15T00:00:00.000Z",
      requiredMinutes: 120,
      availableMinutes: 60,
      competingTaskIds: ["t-2", "t-3"],
      suggestions: [{ taskId: "t-2", currentPriority: "P4", freedMinutes: 45 }],
    };
    const result = mapConflictOutput(conflict);

    expect(result.task_id).toBe("t-1");
    expect(result.reason).toBe("insufficient_time");
    expect(result.deadline).toBe("2026-04-15T00:00:00.000Z");
    expect(result.required_minutes).toBe(120);
    expect(result.available_minutes).toBe(60);
    expect(result.competing_task_ids).toEqual(["t-2", "t-3"]);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toEqual({
      task_id: "t-2",
      current_priority: "P4",
      freed_minutes: 45,
    });
  });
});

describe("mapProductivityOutput", () => {
  it("maps ProductivityStats to snake_case", () => {
    const stats: ProductivityStats = {
      period: "week",
      tasksCompleted: 5,
      tasksOverdue: 1,
      tasksCancelled: 0,
      completionRate: 0.8,
      onTimeRate: 0.9,
    };
    const result = mapProductivityOutput(stats);

    expect(result.period).toBe("week");
    expect(result.tasks_completed).toBe(5);
    expect(result.tasks_overdue).toBe(1);
    expect(result.tasks_cancelled).toBe(0);
    expect(result.completion_rate).toBe(0.8);
    expect(result.on_time_rate).toBe(0.9);
  });
});

describe("mapHealthOutput", () => {
  it("maps ScheduleHealth to snake_case", () => {
    const health: ScheduleHealth = {
      healthScore: 85,
      utilizationPercentage: 70,
      overdueCount: 2,
      atRiskCount: 1,
      freeHoursThisWeek: 10,
      busiestDay: "Monday",
      lightestDay: "Friday",
    };
    const result = mapHealthOutput(health);

    expect(result.health_score).toBe(85);
    expect(result.utilization_percentage).toBe(70);
    expect(result.overdue_count).toBe(2);
    expect(result.at_risk_count).toBe(1);
    expect(result.free_hours_this_week).toBe(10);
    expect(result.busiest_day).toBe("Monday");
    expect(result.lightest_day).toBe("Friday");
  });
});

describe("mapEstimationOutput", () => {
  it("maps EstimationAccuracy to snake_case", () => {
    const accuracy: EstimationAccuracy = {
      averageAccuracyPercentage: 78,
      overestimateCount: 3,
      underestimateCount: 2,
      averageOverestimateMinutes: 15,
      averageUnderestimateMinutes: 10,
      accuracyByCategory: { work: 80, personal: 75 },
    };
    const result = mapEstimationOutput(accuracy);

    expect(result.average_accuracy_percentage).toBe(78);
    expect(result.overestimate_count).toBe(3);
    expect(result.underestimate_count).toBe(2);
    expect(result.average_overestimate_minutes).toBe(15);
    expect(result.average_underestimate_minutes).toBe(10);
    expect(result.accuracy_by_category).toEqual({ work: 80, personal: 75 });
  });
});

describe("mapAllocationOutput", () => {
  it("maps TimeAllocation to snake_case", () => {
    const allocation: TimeAllocation = {
      period: "week",
      categories: [
        { category: "work", hours: 20, percentage: 60 },
        { category: "personal", hours: 5, percentage: 15 },
      ],
    };
    const result = mapAllocationOutput(allocation);

    expect(result.period).toBe("week");
    expect(result.categories).toHaveLength(2);
    expect(result.categories[0]).toEqual({ category: "work", hours: 20, percentage: 60 });
  });
});

describe("mapAvailabilityOutput", () => {
  it("maps Availability windows to snake_case", () => {
    const availability: Availability = {
      windows: [{ day: 1, startTime: "09:00", endTime: "17:00" }],
    };
    const result = mapAvailabilityOutput(availability);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ day: 1, start_time: "09:00", end_time: "17:00" });
  });
});

describe("mapFocusTimeOutput", () => {
  it("maps FocusTime blocks to snake_case", () => {
    const focusTime: FocusTime = {
      blocks: [{ day: 1, startTime: "09:00", endTime: "12:00" }],
      minimumBlockMinutes: 45,
    };
    const result = mapFocusTimeOutput(focusTime);

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toEqual({ day: 1, start_time: "09:00", end_time: "12:00" });
    expect(result.minimum_block_minutes).toBe(45);
  });
});

describe("mapPreferencesOutput", () => {
  it("maps Preferences to snake_case", () => {
    const prefs: Preferences = {
      bufferTimeMinutes: 15,
      defaultPriority: "P3",
      defaultDuration: 60,
      schedulingHorizonWeeks: 4,
      minimumBlockMinutes: 30,
    };
    const result = mapPreferencesOutput(prefs);

    expect(result.buffer_time_minutes).toBe(15);
    expect(result.default_priority).toBe("P3");
    expect(result.default_duration).toBe(60);
    expect(result.scheduling_horizon_weeks).toBe(4);
    expect(result.minimum_block_minutes).toBe(30);
  });
});

// ── Validation Tests ─────────────────────────────────────────────────

describe("validateCreateTaskInput", () => {
  it("throws for missing title", () => {
    expect(() => validateCreateTaskInput({ estimated_duration: 30 } as never)).toThrow(
      ValidationError,
    );
    expect(() => validateCreateTaskInput({ estimated_duration: 30 } as never)).toThrow(
      "title is required",
    );
  });

  it("throws for empty title after trim", () => {
    expect(() => validateCreateTaskInput({ title: "   ", estimated_duration: 30 })).toThrow(
      "title is required",
    );
  });

  it("throws for missing estimated_duration", () => {
    expect(() => validateCreateTaskInput({ title: "Task" } as never)).toThrow(
      "estimated_duration is required",
    );
  });

  it("throws for zero duration", () => {
    expect(() => validateCreateTaskInput({ title: "Task", estimated_duration: 0 })).toThrow(
      "duration must be a positive number of minutes",
    );
  });

  it("throws for negative duration", () => {
    expect(() => validateCreateTaskInput({ title: "Task", estimated_duration: -5 })).toThrow(
      "duration must be a positive number of minutes",
    );
  });

  it("throws for invalid priority", () => {
    expect(() =>
      validateCreateTaskInput({ title: "Task", estimated_duration: 30, priority: "P5" }),
    ).toThrow("invalid priority: must be P1, P2, P3, or P4");
  });

  it("throws for invalid deadline format", () => {
    expect(() =>
      validateCreateTaskInput({ title: "Task", estimated_duration: 30, deadline: "not-a-date" }),
    ).toThrow("deadline must be a valid ISO 8601 date");
  });

  it("does not throw for valid input", () => {
    expect(() => validateCreateTaskInput({ title: "Task", estimated_duration: 30 })).not.toThrow();
  });
});

describe("validateUpdateTaskInput", () => {
  it("throws for missing task_id", () => {
    expect(() => validateUpdateTaskInput({ title: "New" } as never)).toThrow("task_id is required");
  });

  it("throws when no update fields provided", () => {
    expect(() => validateUpdateTaskInput({ task_id: "abc" })).toThrow(
      "at least one update field is required",
    );
  });

  it("does not throw when at least one update field present", () => {
    expect(() => validateUpdateTaskInput({ task_id: "abc", title: "New" })).not.toThrow();
  });
});

describe("validateCompleteTaskInput", () => {
  it("throws for missing task_id", () => {
    expect(() => validateCompleteTaskInput({} as never)).toThrow("task_id is required");
  });

  it("throws for zero actual_duration_minutes", () => {
    expect(() => validateCompleteTaskInput({ task_id: "abc", actual_duration_minutes: 0 })).toThrow(
      "actual_duration_minutes must be a positive number",
    );
  });

  it("throws for negative actual_duration_minutes", () => {
    expect(() =>
      validateCompleteTaskInput({ task_id: "abc", actual_duration_minutes: -10 }),
    ).toThrow("actual_duration_minutes must be a positive number");
  });

  it("does not throw with valid input", () => {
    expect(() =>
      validateCompleteTaskInput({ task_id: "abc", actual_duration_minutes: 30 }),
    ).not.toThrow();
  });
});

describe("validateCreateEventInput", () => {
  it("throws for missing title", () => {
    expect(() =>
      validateCreateEventInput({
        start_time: "2026-04-10T09:00:00.000Z",
        end_time: "2026-04-10T10:00:00.000Z",
      } as never),
    ).toThrow("title is required");
  });

  it("throws for timed event without start_time", () => {
    expect(() =>
      validateCreateEventInput({ title: "Mtg", end_time: "2026-04-10T10:00:00.000Z" }),
    ).toThrow("start_time is required for timed events");
  });

  it("throws for end_time before start_time", () => {
    expect(() =>
      validateCreateEventInput({
        title: "Mtg",
        start_time: "2026-04-10T10:00:00.000Z",
        end_time: "2026-04-10T09:00:00.000Z",
      }),
    ).toThrow("end time must be after start time");
  });

  it("throws for all-day event without date", () => {
    expect(() => validateCreateEventInput({ title: "Holiday", is_all_day: true })).toThrow(
      "date is required for all-day events",
    );
  });

  it("does not throw for valid timed event", () => {
    expect(() =>
      validateCreateEventInput({
        title: "Mtg",
        start_time: "2026-04-10T09:00:00.000Z",
        end_time: "2026-04-10T10:00:00.000Z",
      }),
    ).not.toThrow();
  });
});

describe("validateListEventsInput", () => {
  it("throws for end_date before start_date", () => {
    expect(() =>
      validateListEventsInput({ start_date: "2026-04-10", end_date: "2026-04-09" }),
    ).toThrow("end_date must not be before start_date");
  });

  it("accepts same-day date range", () => {
    expect(() =>
      validateListEventsInput({ start_date: "2026-04-10", end_date: "2026-04-10" }),
    ).not.toThrow();
  });
});

describe("validateGetScheduleInput", () => {
  it("throws for end_date before start_date", () => {
    expect(() =>
      validateGetScheduleInput({ start_date: "2026-04-10", end_date: "2026-04-09" }),
    ).toThrow("end_date must not be before start_date");
  });

  it("accepts same-day date range", () => {
    expect(() =>
      validateGetScheduleInput({ start_date: "2026-04-10", end_date: "2026-04-10" }),
    ).not.toThrow();
  });
});

describe("validatePeriodInput", () => {
  it("throws for invalid period", () => {
    expect(() => validatePeriodInput("century")).toThrow(
      "invalid period: must be day, week, or month",
    );
  });

  it("does not throw for valid periods", () => {
    expect(() => validatePeriodInput("day")).not.toThrow();
    expect(() => validatePeriodInput("week")).not.toThrow();
    expect(() => validatePeriodInput("month")).not.toThrow();
  });
});

describe("validateSetAvailabilityInput", () => {
  it("throws for empty windows", () => {
    expect(() => validateSetAvailabilityInput({ windows: [] })).toThrow(
      "windows must not be empty",
    );
  });

  it("throws for invalid day (7)", () => {
    expect(() =>
      validateSetAvailabilityInput({
        windows: [{ day: 7, start_time: "09:00", end_time: "17:00" }],
      }),
    ).toThrow("invalid day of week");
  });

  it("throws for end_time before start_time", () => {
    expect(() =>
      validateSetAvailabilityInput({
        windows: [{ day: 1, start_time: "17:00", end_time: "09:00" }],
      }),
    ).toThrow("end time must be after start time");
  });
});

describe("validateSetFocusTimeInput", () => {
  it("throws for minimum_block_minutes out of range (too low)", () => {
    expect(() =>
      validateSetFocusTimeInput({
        blocks: [{ day: 1, start_time: "09:00", end_time: "12:00" }],
        minimum_block_minutes: 10,
      }),
    ).toThrow("minimum_block_minutes must be between 15 and 120");
  });

  it("throws for minimum_block_minutes out of range (too high)", () => {
    expect(() =>
      validateSetFocusTimeInput({
        blocks: [{ day: 1, start_time: "09:00", end_time: "12:00" }],
        minimum_block_minutes: 200,
      }),
    ).toThrow("minimum_block_minutes must be between 15 and 120");
  });
});

describe("validateSetPreferencesInput", () => {
  it("throws when no fields provided", () => {
    expect(() => validateSetPreferencesInput({})).toThrow(
      "at least one preference field is required",
    );
  });

  it("throws for scheduling_horizon_weeks out of range", () => {
    expect(() => validateSetPreferencesInput({ scheduling_horizon_weeks: 13 })).toThrow(
      "scheduling_horizon_weeks must be between 1 and 12",
    );
  });

  it("throws for scheduling_horizon_weeks too low", () => {
    expect(() => validateSetPreferencesInput({ scheduling_horizon_weeks: 0 })).toThrow(
      "scheduling_horizon_weeks must be between 1 and 12",
    );
  });

  it("throws for negative buffer_time_minutes", () => {
    expect(() => validateSetPreferencesInput({ buffer_time_minutes: -1 })).toThrow(
      "buffer_time_minutes must be non-negative",
    );
  });

  it("throws for zero default_duration", () => {
    expect(() => validateSetPreferencesInput({ default_duration: 0 })).toThrow(
      "default_duration must be a positive number",
    );
  });

  it("throws for invalid default_priority", () => {
    expect(() => validateSetPreferencesInput({ default_priority: "P5" })).toThrow(
      "invalid priority: must be P1, P2, P3, or P4",
    );
  });

  it("throws for minimum_block_minutes out of range", () => {
    expect(() => validateSetPreferencesInput({ minimum_block_minutes: 10 })).toThrow(
      "minimum_block_minutes must be between 15 and 120",
    );
  });

  it("does not throw for valid input", () => {
    expect(() => validateSetPreferencesInput({ buffer_time_minutes: 10 })).not.toThrow();
  });
});
