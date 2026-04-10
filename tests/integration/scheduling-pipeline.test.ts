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

// Helper to find a future Monday date string for deterministic scheduling
function nextMonday(): string {
  const now = new Date();
  const day = now.getUTCDay();
  let diff: number;
  if (day === 0) {
    diff = 1;
  } else if (day === 1) {
    diff = 7;
  } else {
    diff = 8 - day;
  }
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().split("T")[0];
}

describe("Scheduling Pipeline", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = setup();
  });

  it("create task → replan → get_schedule returns time blocks with task details", async () => {
    const taskId = getTaskId(
      app.taskTools.createTask({
        title: "Design review",
        estimated_duration: 60,
        priority: "P2",
        category: "design",
      }),
    );

    const result = await app.scheduleTools.replan();
    expect(result.schedule_status).toBe("up_to_date");
    expect(result.schedule.length).toBeGreaterThan(0);

    // Find blocks for our task
    const taskBlocks = result.schedule.filter((b) => b.task_id === taskId);
    expect(taskBlocks.length).toBeGreaterThan(0);
    expect(taskBlocks[0].task_title).toBe("Design review");
    expect(taskBlocks[0].task_priority).toBe("P2");
    expect(taskBlocks[0].task_category).toBe("design");
  });

  it("create 2 tasks (P1, P3) → replan → P1 gets earlier/better slot", async () => {
    // Create P3 first, then P1 — scheduler should still prioritize P1
    app.taskTools.createTask({
      title: "Low priority task",
      estimated_duration: 60,
      priority: "P3",
    });

    app.taskTools.createTask({
      title: "Critical task",
      estimated_duration: 60,
      priority: "P1",
    });

    const result = await app.scheduleTools.replan();
    expect(result.schedule.length).toBeGreaterThanOrEqual(2);

    const p1Block = result.schedule.find((b) => b.task_priority === "P1");
    const p3Block = result.schedule.find((b) => b.task_priority === "P3");
    expect(p1Block).toBeDefined();
    expect(p3Block).toBeDefined();

    // P1 should be scheduled at the same time or earlier than P3
    if (p1Block && p3Block) {
      const p1Start = new Date(p1Block.start_time).getTime();
      const p3Start = new Date(p3Block.start_time).getTime();
      expect(p1Start).toBeLessThanOrEqual(p3Start);
    }
  });

  it("create event + task → replan → task scheduled around event", async () => {
    const monday = nextMonday();

    // Block 09:00-12:00 with an event
    app.eventTools.createEvent({
      title: "Morning meeting",
      start_time: `${monday}T09:00:00Z`,
      end_time: `${monday}T12:00:00Z`,
    });

    app.taskTools.createTask({
      title: "Code review",
      estimated_duration: 60,
      priority: "P1",
    });

    const result = await app.scheduleTools.replan();
    const taskBlocks = result.schedule.filter((b) => b.task_title === "Code review");
    expect(taskBlocks.length).toBeGreaterThan(0);

    // Task should not overlap with event 09:00-12:00 on that Monday
    for (const block of taskBlocks) {
      if (block.date === monday) {
        const blockStart = new Date(block.start_time);
        const blockEnd = new Date(block.end_time);
        const eventStart = new Date(`${monday}T09:00:00Z`);
        const eventEnd = new Date(`${monday}T12:00:00Z`);

        const overlaps =
          blockStart.getTime() < eventEnd.getTime() && blockEnd.getTime() > eventStart.getTime();
        expect(overlaps).toBe(false);
      }
    }
  });

  it("create task → complete task → replan → schedule no longer includes it", async () => {
    const taskId = getTaskId(
      app.taskTools.createTask({
        title: "One-off task",
        estimated_duration: 30,
      }),
    );

    // First replan — task should be scheduled
    const before = await app.scheduleTools.replan();
    const beforeBlocks = before.schedule.filter((b) => b.task_id === taskId);
    expect(beforeBlocks.length).toBeGreaterThan(0);

    // Complete the task (now "scheduled" status after replan)
    app.taskTools.completeTask({ task_id: taskId });

    // Replan — completed task should no longer appear
    const after = await app.scheduleTools.replan();
    const afterBlocks = after.schedule.filter((b) => b.task_id === taskId);
    expect(afterBlocks).toHaveLength(0);
  });

  it("create task with deadline → replan → task scheduled before deadline", async () => {
    const monday = nextMonday();
    const deadlineDate = new Date(monday);
    deadlineDate.setUTCDate(deadlineDate.getUTCDate() + 4); // Friday
    const deadline = deadlineDate.toISOString();

    const taskId = getTaskId(
      app.taskTools.createTask({
        title: "Deadline task",
        estimated_duration: 60,
        priority: "P1",
        deadline,
      }),
    );

    const result = await app.scheduleTools.replan();
    const taskBlocks = result.schedule.filter((b) => b.task_id === taskId);
    expect(taskBlocks.length).toBeGreaterThan(0);

    // All blocks should end before or at deadline
    for (const block of taskBlocks) {
      const blockEnd = new Date(block.end_time);
      expect(blockEnd.getTime()).toBeLessThanOrEqual(deadlineDate.getTime());
    }
  });

  it("create 2 tasks with dependency → complete blocker → replan → dependent gets scheduled", async () => {
    const blockerId = getTaskId(
      app.taskTools.createTask({
        title: "Blocker task",
        estimated_duration: 60,
        priority: "P2",
      }),
    );

    const dependentId = getTaskId(
      app.taskTools.createTask({
        title: "Dependent task",
        estimated_duration: 60,
        priority: "P2",
        blocked_by: [blockerId],
      }),
    );

    // First replan: blocker gets scheduled, dependent is blocked (at_risk)
    const firstResult = await app.scheduleTools.replan();
    const blockerBlocks = firstResult.schedule.filter((b) => b.task_id === blockerId);
    const dependentBlocks = firstResult.schedule.filter((b) => b.task_id === dependentId);
    expect(blockerBlocks.length).toBeGreaterThan(0);
    expect(dependentBlocks).toHaveLength(0); // blocked — not scheduled

    // Complete the blocker
    app.taskTools.completeTask({ task_id: blockerId });

    // Second replan: dependent should now be unblocked and scheduled
    const secondResult = await app.scheduleTools.replan();
    const newDependentBlocks = secondResult.schedule.filter((b) => b.task_id === dependentId);
    expect(newDependentBlocks.length).toBeGreaterThan(0);
    expect(newDependentBlocks[0].task_title).toBe("Dependent task");
  });
});
