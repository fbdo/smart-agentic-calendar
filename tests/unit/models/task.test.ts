import { describe, it, expect } from "vitest";
import {
  VALID_TASK_PRIORITIES,
  VALID_TASK_STATUSES,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "../../../src/models/task.js";

describe("Task types", () => {
  it("defines all valid priorities", () => {
    expect(VALID_TASK_PRIORITIES).toEqual(["P1", "P2", "P3", "P4"]);
  });

  it("defines all valid statuses", () => {
    expect(VALID_TASK_STATUSES).toEqual([
      "pending",
      "scheduled",
      "completed",
      "cancelled",
      "at_risk",
    ]);
  });

  it("allows constructing a valid Task object", () => {
    const task: Task = {
      id: "test-id",
      title: "Test task",
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
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(task.priority satisfies TaskPriority).toBe("P3");
    expect(task.status satisfies TaskStatus).toBe("pending");
  });
});
