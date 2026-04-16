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

describe("MCP Tools → Storage Round-Trip", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = setup();
  });

  it("create task → list tasks returns it", () => {
    const created = app.taskTools.createTask({
      title: "Write tests",
      estimated_duration: 60,
      priority: "P2",
      category: "dev",
      tags: ["testing"],
    });

    const listed = app.taskTools.listTasks({});
    expect(listed.count).toBe(1);
    expect(listed.tasks[0].title).toBe("Write tests");
    expect(listed.tasks[0].priority).toBe("P2");
    expect(listed.tasks[0].category).toBe("dev");
    expect(listed.tasks[0].tags).toEqual(["testing"]);
    expect(listed.tasks[0].estimated_duration).toBe(60);
    expect(listed.tasks[0].id).toBe(getTaskId(created));
  });

  it("create task → update task → list shows updated fields", () => {
    const taskId = getTaskId(
      app.taskTools.createTask({
        title: "Original title",
        estimated_duration: 30,
      }),
    );

    app.taskTools.updateTask({
      task_id: taskId,
      title: "Updated title",
      priority: "P1",
      estimated_duration: 45,
    });

    const listed = app.taskTools.listTasks({});
    expect(listed.count).toBe(1);
    expect(listed.tasks[0].title).toBe("Updated title");
    expect(listed.tasks[0].priority).toBe("P1");
    expect(listed.tasks[0].estimated_duration).toBe(45);
  });

  it("create task → complete task → list shows completed status", async () => {
    const taskId = getTaskId(
      app.taskTools.createTask({
        title: "Completable task",
        estimated_duration: 30,
      }),
    );

    // Replan to transition pending → scheduled
    await app.scheduleTools.replan();

    app.taskTools.completeTask({
      task_id: taskId,
      actual_duration_minutes: 25,
    });

    const listed = app.taskTools.listTasks({ status: "completed" });
    expect(listed.count).toBe(1);
    expect(listed.tasks[0].status).toBe("completed");
    expect(listed.tasks[0].actual_duration).toBe(25);
  });

  it("create task → delete task → list excludes cancelled", () => {
    const taskId = getTaskId(
      app.taskTools.createTask({
        title: "To be deleted",
        estimated_duration: 30,
      }),
    );

    app.taskTools.deleteTask({ task_id: taskId });

    // Default list excludes cancelled
    const listed = app.taskTools.listTasks({});
    expect(listed.count).toBe(0);

    // Explicit cancelled filter shows it
    const cancelled = app.taskTools.listTasks({ status: "cancelled" });
    expect(cancelled.count).toBe(1);
    expect(cancelled.tasks[0].id).toBe(taskId);
  });

  it("create event → list events returns it", () => {
    const created = app.eventTools.createEvent({
      title: "Team meeting",
      start_time: "2026-04-15T10:00:00Z",
      end_time: "2026-04-15T11:00:00Z",
    });
    const eventId = created.event.id;

    const listed = app.eventTools.listEvents({
      start_date: "2026-04-15",
      end_date: "2026-04-15",
    });
    expect(listed.count).toBe(1);
    expect(listed.events[0].id).toBe(eventId);
    expect(listed.events[0].title).toBe("Team meeting");
  });

  it("create all-day event → list events in range returns it", () => {
    app.eventTools.createEvent({
      title: "Company holiday",
      is_all_day: true,
      date: "2026-04-20",
    });

    const listed = app.eventTools.listEvents({
      start_date: "2026-04-19",
      end_date: "2026-04-21",
    });
    expect(listed.count).toBe(1);
    expect(listed.events[0].title).toBe("Company holiday");
    expect(listed.events[0].is_all_day).toBe(true);
    expect(listed.events[0].date).toBe("2026-04-20");
  });

  it("set availability → get_preferences returns it", () => {
    const windows = [
      { day: 1, start_time: "08:00", end_time: "16:00" },
      { day: 3, start_time: "10:00", end_time: "18:00" },
    ];
    app.configTools.setAvailability({ windows });

    const config = app.configTools.getPreferences();
    // mapAvailabilityOutput returns an array
    expect(config.availability).toHaveLength(2);
    expect(config.availability[0].start_time).toBe("08:00");
    expect(config.availability[1].day).toBe(3);
  });

  it("set focus time → get_preferences returns focus config", () => {
    app.configTools.setFocusTime({
      blocks: [
        { day: 1, start_time: "09:00", end_time: "11:00" },
        { day: 3, start_time: "09:00", end_time: "11:00" },
      ],
      minimum_block_minutes: 45,
    });

    const config = app.configTools.getPreferences();
    expect(config.focus_time.blocks).toHaveLength(2);
    expect(config.focus_time.minimum_block_minutes).toBe(45);
  });

  it("set preferences → get_preferences returns merged result", () => {
    app.configTools.setPreferences({
      buffer_time_minutes: 10,
      scheduling_horizon_weeks: 6,
    });

    const config = app.configTools.getPreferences();
    expect(config.preferences.buffer_time_minutes).toBe(10);
    expect(config.preferences.scheduling_horizon_weeks).toBe(6);
    // Defaults remain for unset fields
    expect(config.preferences.default_priority).toBe("P3");
    expect(config.preferences.default_duration).toBe(60);
  });
});
