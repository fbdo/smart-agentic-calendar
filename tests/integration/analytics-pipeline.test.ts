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

function getTaskId(result: unknown): string {
  return (result as { task: { id: string } }).task.id;
}

describe("Analytics Pipeline", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = setup();
  });

  it("complete tasks → get_productivity_stats returns correct rates", async () => {
    const task1Id = getTaskId(
      app.taskTools.createTask({
        title: "Task A",
        estimated_duration: 30,
        priority: "P2",
      }),
    );

    const task2Id = getTaskId(
      app.taskTools.createTask({
        title: "Task B",
        estimated_duration: 45,
        priority: "P3",
      }),
    );

    // Leave a third task incomplete
    app.taskTools.createTask({
      title: "Task C (incomplete)",
      estimated_duration: 60,
      priority: "P4",
    });

    // Replan to transition tasks to "scheduled" status
    await app.scheduleTools.replan();

    app.taskTools.completeTask({ task_id: task1Id, actual_duration_minutes: 30 });
    app.taskTools.completeTask({ task_id: task2Id, actual_duration_minutes: 40 });

    const stats = app.analyticsTools.getProductivityStats({ period: "week" });
    expect(stats).toBeDefined();
    expect(stats.tasks_completed).toBeGreaterThanOrEqual(2);
    expect(stats.completion_rate).toBeGreaterThan(0);
  });

  it("create + schedule tasks → get_schedule_health returns valid score", async () => {
    app.taskTools.createTask({
      title: "Healthy task",
      estimated_duration: 60,
      priority: "P2",
    });

    await app.scheduleTools.replan();

    const health = app.analyticsTools.getScheduleHealth();
    expect(health).toBeDefined();
    expect(health.health_score).toBeGreaterThanOrEqual(0);
    expect(health.health_score).toBeLessThanOrEqual(100);
  });

  it("complete tasks with actual durations → get_estimation_accuracy", async () => {
    const task1Id = getTaskId(
      app.taskTools.createTask({
        title: "Estimate test 1",
        estimated_duration: 60,
      }),
    );

    const task2Id = getTaskId(
      app.taskTools.createTask({
        title: "Estimate test 2",
        estimated_duration: 30,
      }),
    );

    // Replan to transition to "scheduled"
    await app.scheduleTools.replan();

    // Complete with different actual durations to get measurable accuracy
    app.taskTools.completeTask({ task_id: task1Id, actual_duration_minutes: 55 });
    app.taskTools.completeTask({ task_id: task2Id, actual_duration_minutes: 45 });

    const accuracy = app.analyticsTools.getEstimationAccuracy({ period: "week" });
    expect(accuracy).toBeDefined();
    expect(accuracy.average_accuracy_percentage).toBeGreaterThanOrEqual(0);
    expect(accuracy.average_accuracy_percentage).toBeLessThanOrEqual(100);
  });

  it("create categorized tasks → get_time_allocation", async () => {
    const task1Id = getTaskId(
      app.taskTools.createTask({
        title: "Dev work",
        estimated_duration: 60,
        category: "development",
      }),
    );

    const task2Id = getTaskId(
      app.taskTools.createTask({
        title: "Meeting prep",
        estimated_duration: 30,
        category: "meetings",
      }),
    );

    // Replan to transition to "scheduled"
    await app.scheduleTools.replan();

    app.taskTools.completeTask({ task_id: task1Id, actual_duration_minutes: 60 });
    app.taskTools.completeTask({ task_id: task2Id, actual_duration_minutes: 30 });

    const allocation = app.analyticsTools.getTimeAllocation({ period: "week" });
    expect(allocation).toBeDefined();
    expect(allocation.categories).toBeDefined();

    // Should have entries for both categories
    const categoryNames = allocation.categories.map((c: { category: string }) => c.category);
    expect(categoryNames).toContain("development");
    expect(categoryNames).toContain("meetings");
  });
});
