import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../../src/index.js";

const PRIORITIES = ["P1", "P2", "P3", "P4"] as const;
const DURATIONS = [15, 30, 45, 60, 90, 120];

function categoryForIndex(i: number): string {
  if (i % 3 === 0) return "dev";
  if (i % 3 === 1) return "meetings";
  return "admin";
}

// CI environments are slower — use a multiplier
const CI_MULTIPLIER = process.env.CI ? 2 : 1;

function setup() {
  const app = createApp(":memory:");

  // Mon-Fri 09:00-17:00 availability
  app.configTools.setAvailability({
    windows: [
      { day: 1, start_time: "09:00", end_time: "17:00" },
      { day: 2, start_time: "09:00", end_time: "17:00" },
      { day: 3, start_time: "09:00", end_time: "17:00" },
      { day: 4, start_time: "09:00", end_time: "17:00" },
      { day: 5, start_time: "09:00", end_time: "17:00" },
    ],
  });

  // Focus time Mon-Fri 09:00-11:00
  app.configTools.setFocusTime({
    blocks: [
      { day: 1, start_time: "09:00", end_time: "11:00" },
      { day: 2, start_time: "09:00", end_time: "11:00" },
      { day: 3, start_time: "09:00", end_time: "11:00" },
      { day: 4, start_time: "09:00", end_time: "11:00" },
      { day: 5, start_time: "09:00", end_time: "11:00" },
    ],
  });

  return app;
}

function seedTasks(app: ReturnType<typeof createApp>, count: number) {
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const priority = PRIORITIES[i % PRIORITIES.length];
    const duration = DURATIONS[i % DURATIONS.length];
    const deadlineDate = new Date(now);
    deadlineDate.setUTCDate(deadlineDate.getUTCDate() + 1 + (i % 21)); // spread across 3 weeks

    app.taskTools.createTask({
      title: `Task ${i + 1}`,
      estimated_duration: duration,
      priority,
      deadline: deadlineDate.toISOString(),
      category: categoryForIndex(i),
    });
  }
}

function seedEvents(app: ReturnType<typeof createApp>, count: number) {
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const dayOffset = 1 + (i % 14);
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() + dayOffset);
    // Skip weekends
    while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
      date.setUTCDate(date.getUTCDate() + 1);
    }
    const hour = 12 + (i % 4); // 12:00-15:00
    const startTime = `${date.toISOString().split("T")[0]}T${String(hour).padStart(2, "0")}:00:00Z`;
    const endTime = `${date.toISOString().split("T")[0]}T${String(hour + 1).padStart(2, "0")}:00:00Z`;

    app.eventTools.createEvent({
      title: `Event ${i + 1}`,
      start_time: startTime,
      end_time: endTime,
    });
  }
}

function seedDependencyChains(
  app: ReturnType<typeof createApp>,
  count: number,
  chainLength: number,
) {
  const now = new Date();
  const taskIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const priority = PRIORITIES[i % PRIORITIES.length];
    const deadlineDate = new Date(now);
    deadlineDate.setUTCDate(deadlineDate.getUTCDate() + 7 + (i % 14));

    const result = app.taskTools.createTask({
      title: `Dep task ${i + 1}`,
      estimated_duration: 30,
      priority,
      deadline: deadlineDate.toISOString(),
      blocked_by: i > 0 && i % chainLength !== 0 ? [taskIds[i - 1]] : undefined,
    });
    taskIds.push((result as { task: { id: string } }).task.id);
  }
}

async function measureMedian(fn: () => Promise<void>, iterations: number): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

describe("Replan Latency (NFR-1.1)", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = setup();
  });

  it("replan with 50 active tasks completes within 200ms", async () => {
    seedTasks(app, 50);

    // Warm up
    await app.scheduleTools.replan();

    const median = await measureMedian(() => app.scheduleTools.replan(), 5);
    expect(median).toBeLessThan(200 * CI_MULTIPLIER);
  });

  it("replan with 100 active tasks completes within 350ms", async () => {
    seedTasks(app, 100);

    await app.scheduleTools.replan();

    const median = await measureMedian(() => app.scheduleTools.replan(), 5);
    expect(median).toBeLessThan(350 * CI_MULTIPLIER);
  });

  it("replan with 200 active tasks completes within 500ms", async () => {
    seedTasks(app, 200);

    await app.scheduleTools.replan();

    const median = await measureMedian(() => app.scheduleTools.replan(), 5);
    expect(median).toBeLessThan(500 * CI_MULTIPLIER);
  });

  it("replan with 200 tasks + 20 events completes within 500ms", async () => {
    seedTasks(app, 200);
    seedEvents(app, 20);

    await app.scheduleTools.replan();

    const median = await measureMedian(() => app.scheduleTools.replan(), 5);
    expect(median).toBeLessThan(500 * CI_MULTIPLIER);
  });

  it("replan with 200 tasks including dependency chains completes within 500ms", async () => {
    seedDependencyChains(app, 200, 5); // 40 chains of 5

    await app.scheduleTools.replan();

    const median = await measureMedian(() => app.scheduleTools.replan(), 5);
    expect(median).toBeLessThan(500 * CI_MULTIPLIER);
  });
});
