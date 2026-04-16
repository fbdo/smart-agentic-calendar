import { describe, it, expect, beforeAll } from "vitest";
import { createApp } from "../../src/index.js";

const PRIORITIES = ["P1", "P2", "P3", "P4"] as const;
const CI_MULTIPLIER = process.env.CI ? 2 : 1;

function categoryForIndex(i: number): string {
  if (i % 3 === 0) return "dev";
  if (i % 3 === 1) return "meetings";
  return "admin";
}

let app: ReturnType<typeof createApp>;
const existingTaskIds: string[] = [];

beforeAll(async () => {
  app = createApp(":memory:");

  // Configure availability
  app.configTools.setAvailability({
    windows: [
      { day: 1, start_time: "09:00", end_time: "17:00" },
      { day: 2, start_time: "09:00", end_time: "17:00" },
      { day: 3, start_time: "09:00", end_time: "17:00" },
      { day: 4, start_time: "09:00", end_time: "17:00" },
      { day: 5, start_time: "09:00", end_time: "17:00" },
    ],
  });

  // Seed 200 tasks
  const now = new Date();
  for (let i = 0; i < 200; i++) {
    const deadlineDate = new Date(now);
    deadlineDate.setUTCDate(deadlineDate.getUTCDate() + 1 + (i % 21));

    const result = app.taskTools.createTask({
      title: `Seed task ${i + 1}`,
      estimated_duration: 30 + (i % 4) * 15,
      priority: PRIORITIES[i % PRIORITIES.length],
      deadline: deadlineDate.toISOString(),
      category: categoryForIndex(i),
    });
    existingTaskIds.push((result as { task: { id: string } }).task.id);
  }

  // Seed 20 events
  for (let i = 0; i < 20; i++) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() + 1 + (i % 14));
    while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
      date.setUTCDate(date.getUTCDate() + 1);
    }
    const hour = 12 + (i % 4);
    const ds = date.toISOString().split("T")[0];
    app.eventTools.createEvent({
      title: `Event ${i + 1}`,
      start_time: `${ds}T${String(hour).padStart(2, "0")}:00:00Z`,
      end_time: `${ds}T${String(hour + 1).padStart(2, "0")}:00:00Z`,
    });
  }

  // Generate schedule
  await app.scheduleTools.replan();

  // Complete some tasks for analytics data
  for (let i = 0; i < 50; i++) {
    app.taskTools.completeTask({
      task_id: existingTaskIds[i],
      actual_duration_minutes: 25 + (i % 20),
    });
  }
});

describe("CRUD Response Time (NFR-1.2)", () => {
  it("create task with 200 existing tasks completes within 100ms", () => {
    const start = performance.now();
    app.taskTools.createTask({
      title: "Timed create",
      estimated_duration: 60,
      priority: "P2",
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100 * CI_MULTIPLIER);
  });

  it("update task with 200 existing tasks completes within 100ms", () => {
    const targetId = existingTaskIds[100]; // pick a non-completed task
    const start = performance.now();
    app.taskTools.updateTask({
      task_id: targetId,
      title: "Updated title",
      priority: "P1",
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100 * CI_MULTIPLIER);
  });

  it("list tasks with filters (200 tasks) completes within 100ms", () => {
    const start = performance.now();
    app.taskTools.listTasks({ priority: "P1", category: "dev" });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100 * CI_MULTIPLIER);
  });

  it("create event completes within 100ms", () => {
    const start = performance.now();
    app.eventTools.createEvent({
      title: "Timed event",
      start_time: "2026-05-01T14:00:00Z",
      end_time: "2026-05-01T15:00:00Z",
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100 * CI_MULTIPLIER);
  });

  it("get schedule (2-week range) completes within 100ms", () => {
    const now = new Date();
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() + 14);

    const start = performance.now();
    app.scheduleTools.getSchedule({
      start_date: now.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100 * CI_MULTIPLIER);
  });

  it("get analytics (with completed tasks) completes within 100ms", () => {
    const start = performance.now();
    app.analyticsTools.getProductivityStats({ period: "week" });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100 * CI_MULTIPLIER);
  });
});
