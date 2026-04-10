import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../../src/index.js";

function setup() {
  const app = createApp(":memory:");

  // Very limited availability: only 2 hours/day to force conflicts
  app.configTools.setAvailability({
    windows: [
      { day: 1, start_time: "09:00", end_time: "11:00" },
      { day: 2, start_time: "09:00", end_time: "11:00" },
      { day: 3, start_time: "09:00", end_time: "11:00" },
      { day: 4, start_time: "09:00", end_time: "11:00" },
      { day: 5, start_time: "09:00", end_time: "11:00" },
    ],
  });

  return app;
}

function getTaskId(result: unknown): string {
  return (result as { task: { id: string } }).task.id;
}

// Helper: a deadline in the past (triggers "overdue" conflict detection)
function pastDeadline(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(17, 0, 0, 0);
  return d.toISOString();
}

describe("Conflict Detection Pipeline", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = setup();
  });

  it("tasks with past deadlines → replan → get_conflicts returns overdue conflicts", async () => {
    // Create tasks with deadlines already past → triggers "overdue" detection
    app.taskTools.createTask({
      title: "Overdue task 1",
      estimated_duration: 60,
      priority: "P1",
      deadline: pastDeadline(1),
    });

    app.taskTools.createTask({
      title: "Overdue task 2",
      estimated_duration: 60,
      priority: "P2",
      deadline: pastDeadline(2),
    });

    await app.scheduleTools.replan();

    const conflictResult = app.scheduleTools.getConflicts();
    expect(conflictResult.conflicts.length).toBeGreaterThan(0);

    // All conflicts should be "overdue"
    for (const conflict of conflictResult.conflicts) {
      expect(conflict.reason).toBe("overdue");
      expect(conflict.task_id).toBeDefined();
      expect(conflict.deadline).toBeDefined();
    }

    expect(conflictResult.schedule_status).toBeDefined();
  });

  it("overdue task with conflict details populated correctly", async () => {
    app.taskTools.createTask({
      title: "Detailed overdue task",
      estimated_duration: 120,
      priority: "P1",
      deadline: pastDeadline(1),
    });

    await app.scheduleTools.replan();

    const conflictResult = app.scheduleTools.getConflicts();
    expect(conflictResult.conflicts.length).toBeGreaterThan(0);

    const conflict = conflictResult.conflicts[0];
    expect(conflict.task_id).toBeDefined();
    expect(conflict.reason).toBe("overdue");
    expect(conflict.required_minutes).toBe(120);
    expect(conflict.deadline).toBeDefined();
  });

  it("resolve overdue conflict by completing task → replan → conflict cleared", async () => {
    const taskId = getTaskId(
      app.taskTools.createTask({
        title: "Will be completed",
        estimated_duration: 60,
        priority: "P1",
        deadline: pastDeadline(1),
      }),
    );

    // Also create a non-overdue task for comparison
    app.taskTools.createTask({
      title: "Future task",
      estimated_duration: 30,
      priority: "P3",
    });

    await app.scheduleTools.replan();

    const before = app.scheduleTools.getConflicts();
    expect(before.conflicts.length).toBeGreaterThan(0);

    // Complete the overdue task (it should be "scheduled" after replan)
    app.taskTools.completeTask({ task_id: taskId, actual_duration_minutes: 60 });

    await app.scheduleTools.replan();

    const after = app.scheduleTools.getConflicts();
    // The overdue conflict for this specific task should be gone
    const remaining = after.conflicts.filter((c) => c.task_id === taskId);
    expect(remaining).toHaveLength(0);
  });
});
