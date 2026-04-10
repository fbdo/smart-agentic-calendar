import { describe, it, expect } from "vitest";
import {
  type RecurrenceTemplate,
  type RecurrenceInstance,
  type RecurrenceException,
} from "../../../src/models/recurrence.js";

describe("Recurrence types", () => {
  it("allows constructing a RecurrenceTemplate", () => {
    const template: RecurrenceTemplate = {
      id: "rt-1",
      taskData: {
        title: "Weekly review",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P2",
        category: "meetings",
        tags: [],
      },
      rrule: "FREQ=WEEKLY;BYDAY=FR",
      isActive: true,
      createdAt: "2026-01-01T00:00:00Z",
    };
    expect(template.rrule).toBe("FREQ=WEEKLY;BYDAY=FR");
    expect(template.isActive).toBe(true);
  });

  it("allows constructing a RecurrenceInstance", () => {
    const instance: RecurrenceInstance = {
      id: "ri-1",
      templateId: "rt-1",
      taskId: "task-10",
      scheduledDate: "2026-01-17",
      isException: false,
    };
    expect(instance.isException).toBe(false);
  });

  it("allows constructing a skip RecurrenceException", () => {
    const exception: RecurrenceException = {
      templateId: "rt-1",
      date: "2026-01-24",
      type: "skip",
      overrides: null,
    };
    expect(exception.type).toBe("skip");
    expect(exception.overrides).toBeNull();
  });

  it("allows constructing a modify RecurrenceException", () => {
    const exception: RecurrenceException = {
      templateId: "rt-1",
      date: "2026-01-31",
      type: "modify",
      overrides: { title: "Extended review", duration: 60 },
    };
    expect(exception.type).toBe("modify");
    expect(exception.overrides?.title).toBe("Extended review");
  });
});
