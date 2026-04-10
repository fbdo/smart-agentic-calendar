import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../../src/index.js";

function setup() {
  const app = createApp(":memory:");

  // Configure Mon-Fri 09:00-17:00 availability
  app.configTools.setAvailability({
    windows: [
      { day: 1, start_time: "09:00", end_time: "17:00" },
      { day: 2, start_time: "09:00", end_time: "17:00" },
      { day: 3, start_time: "09:00", end_time: "17:00" },
      { day: 4, start_time: "09:00", end_time: "17:00" },
      { day: 5, start_time: "09:00", end_time: "17:00" },
    ],
  });

  return app;
}

describe("Recurring Tasks Pipeline", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = setup();
  });

  it("create recurring task (weekly) → replan → schedule shows instances", async () => {
    const result = app.taskTools.createTask({
      title: "Weekly standup prep",
      estimated_duration: 30,
      priority: "P2",
      recurrence_rule: "FREQ=WEEKLY;COUNT=4",
    });

    // Should return template + instances
    const recurringResult = result as {
      template_id: string;
      instances: { instance_id: string; task_id: string; scheduled_date: string }[];
      message: string;
    };
    expect(recurringResult.template_id).toBeDefined();
    expect(recurringResult.instances.length).toBeGreaterThan(0);
    expect(recurringResult.instances.length).toBeLessThanOrEqual(4);

    const replanResult = await app.scheduleTools.replan();

    // The instances should appear in the schedule
    const instanceTaskIds = new Set(recurringResult.instances.map((i) => i.task_id));
    const scheduledInstances = replanResult.schedule.filter((b) => instanceTaskIds.has(b.task_id));
    expect(scheduledInstances.length).toBeGreaterThan(0);

    // All scheduled instances should reference the same title
    for (const block of scheduledInstances) {
      expect(block.task_title).toBe("Weekly standup prep");
    }
  });

  it("complete one instance → replan → remaining instances still scheduled", async () => {
    const result = app.taskTools.createTask({
      title: "Recurring review",
      estimated_duration: 30,
      priority: "P2",
      recurrence_rule: "FREQ=WEEKLY;COUNT=3",
    });

    const recurringResult = result as {
      template_id: string;
      instances: { instance_id: string; task_id: string }[];
    };
    expect(recurringResult.instances.length).toBeGreaterThanOrEqual(2);

    // Replan first so instances get "scheduled" status
    await app.scheduleTools.replan();

    // Complete the first instance
    const firstTaskId = recurringResult.instances[0].task_id;
    app.taskTools.completeTask({ task_id: firstTaskId });

    const replanResult = await app.scheduleTools.replan();

    // Completed instance should not appear in schedule
    const completedBlocks = replanResult.schedule.filter((b) => b.task_id === firstTaskId);
    expect(completedBlocks).toHaveLength(0);

    // Remaining instances should still be scheduled
    const remainingIds = recurringResult.instances.slice(1).map((i) => i.task_id);
    const remainingBlocks = replanResult.schedule.filter((b) => remainingIds.includes(b.task_id));
    expect(remainingBlocks.length).toBeGreaterThan(0);
  });

  it("delete recurring template → replan → all future instances removed", async () => {
    const result = app.taskTools.createTask({
      title: "To be deleted recurring",
      estimated_duration: 30,
      priority: "P3",
      recurrence_rule: "FREQ=WEEKLY;COUNT=4",
    });

    const recurringResult = result as {
      template_id: string;
      instances: { instance_id: string; task_id: string }[];
    };

    // Replan to get instances scheduled
    await app.scheduleTools.replan();

    // Delete the first instance (which has the template ID) — this triggers template deletion
    const firstTaskId = recurringResult.instances[0].task_id;
    app.taskTools.deleteTask({ task_id: firstTaskId });

    const replanResult = await app.scheduleTools.replan();

    // All instances from this recurring task should be gone from schedule
    const allInstanceIds = new Set(recurringResult.instances.map((i) => i.task_id));
    const remainingBlocks = replanResult.schedule.filter((b) => allInstanceIds.has(b.task_id));
    expect(remainingBlocks).toHaveLength(0);
  });
});
