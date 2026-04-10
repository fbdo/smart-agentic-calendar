import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Database } from "../../../src/storage/database.js";
import { ScheduleRepository } from "../../../src/storage/schedule-repository.js";
import { generateId } from "../../../src/common/id.js";

describe("ScheduleRepository", () => {
  let db: Database;
  let repo: ScheduleRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    repo = new ScheduleRepository(db);
    // Insert a task so FK constraint is satisfied
    db.prepare(
      "INSERT INTO tasks (id, title, duration, priority, status, tags, is_recurring, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "task-1",
      "Test task",
      60,
      "P3",
      "pending",
      "[]",
      0,
      "2026-04-10T00:00:00.000Z",
      "2026-04-10T00:00:00.000Z",
    );
    db.prepare(
      "INSERT INTO tasks (id, title, duration, priority, status, tags, is_recurring, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "task-2",
      "Test task 2",
      30,
      "P1",
      "pending",
      "[]",
      0,
      "2026-04-10T00:00:00.000Z",
      "2026-04-10T00:00:00.000Z",
    );
  });

  afterEach(() => {
    db.close();
  });

  describe("saveSchedule", () => {
    it("saves time blocks", () => {
      repo.saveSchedule([
        {
          id: generateId(),
          taskId: "task-1",
          startTime: "2026-04-10T09:00:00.000Z",
          endTime: "2026-04-10T10:00:00.000Z",
          date: "2026-04-10",
          blockIndex: 0,
          totalBlocks: 1,
        },
      ]);

      const blocks = repo.getSchedule("2026-04-10T00:00:00.000Z", "2026-04-11T00:00:00.000Z");
      expect(blocks).toHaveLength(1);
      expect(blocks[0].taskId).toBe("task-1");
    });

    it("replaces existing schedule", () => {
      repo.saveSchedule([
        {
          id: generateId(),
          taskId: "task-1",
          startTime: "2026-04-10T09:00:00.000Z",
          endTime: "2026-04-10T10:00:00.000Z",
          date: "2026-04-10",
          blockIndex: 0,
          totalBlocks: 1,
        },
      ]);
      repo.saveSchedule([
        {
          id: generateId(),
          taskId: "task-2",
          startTime: "2026-04-10T10:00:00.000Z",
          endTime: "2026-04-10T10:30:00.000Z",
          date: "2026-04-10",
          blockIndex: 0,
          totalBlocks: 1,
        },
      ]);

      const blocks = repo.getSchedule("2026-04-10T00:00:00.000Z", "2026-04-11T00:00:00.000Z");
      expect(blocks).toHaveLength(1);
      expect(blocks[0].taskId).toBe("task-2");
    });

    it("handles empty schedule", () => {
      repo.saveSchedule([]);
      const blocks = repo.getSchedule("2026-04-10T00:00:00.000Z", "2026-04-11T00:00:00.000Z");
      expect(blocks).toEqual([]);
    });
  });

  describe("getSchedule", () => {
    it("filters by date range", () => {
      repo.saveSchedule([
        {
          id: generateId(),
          taskId: "task-1",
          startTime: "2026-04-10T09:00:00.000Z",
          endTime: "2026-04-10T10:00:00.000Z",
          date: "2026-04-10",
          blockIndex: 0,
          totalBlocks: 1,
        },
        {
          id: generateId(),
          taskId: "task-2",
          startTime: "2026-04-12T09:00:00.000Z",
          endTime: "2026-04-12T10:00:00.000Z",
          date: "2026-04-12",
          blockIndex: 0,
          totalBlocks: 1,
        },
      ]);

      const blocks = repo.getSchedule("2026-04-10T00:00:00.000Z", "2026-04-11T00:00:00.000Z");
      expect(blocks).toHaveLength(1);
      expect(blocks[0].taskId).toBe("task-1");
    });

    it("orders by start time", () => {
      repo.saveSchedule([
        {
          id: generateId(),
          taskId: "task-2",
          startTime: "2026-04-10T14:00:00.000Z",
          endTime: "2026-04-10T15:00:00.000Z",
          date: "2026-04-10",
          blockIndex: 0,
          totalBlocks: 1,
        },
        {
          id: generateId(),
          taskId: "task-1",
          startTime: "2026-04-10T09:00:00.000Z",
          endTime: "2026-04-10T10:00:00.000Z",
          date: "2026-04-10",
          blockIndex: 0,
          totalBlocks: 1,
        },
      ]);

      const blocks = repo.getSchedule("2026-04-10T00:00:00.000Z", "2026-04-11T00:00:00.000Z");
      expect(blocks[0].taskId).toBe("task-1");
      expect(blocks[1].taskId).toBe("task-2");
    });
  });

  describe("getScheduleStatus", () => {
    it("returns up_to_date by default", () => {
      expect(repo.getScheduleStatus()).toBe("up_to_date");
    });
  });

  describe("setScheduleStatus", () => {
    it("sets status to replan_in_progress", () => {
      repo.setScheduleStatus("replan_in_progress");
      expect(repo.getScheduleStatus()).toBe("replan_in_progress");
    });

    it("sets status to up_to_date with timestamp", () => {
      repo.setScheduleStatus("replan_in_progress");
      repo.setScheduleStatus("up_to_date");
      expect(repo.getScheduleStatus()).toBe("up_to_date");
    });
  });

  describe("clearSchedule", () => {
    it("removes all time blocks", () => {
      repo.saveSchedule([
        {
          id: generateId(),
          taskId: "task-1",
          startTime: "2026-04-10T09:00:00.000Z",
          endTime: "2026-04-10T10:00:00.000Z",
          date: "2026-04-10",
          blockIndex: 0,
          totalBlocks: 1,
        },
      ]);

      repo.clearSchedule();

      const blocks = repo.getSchedule("2026-04-10T00:00:00.000Z", "2026-04-11T00:00:00.000Z");
      expect(blocks).toEqual([]);
    });
  });
});
