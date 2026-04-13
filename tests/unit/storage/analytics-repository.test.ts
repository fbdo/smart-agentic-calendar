import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Database } from "../../../src/storage/database.js";
import { AnalyticsRepository } from "../../../src/storage/analytics-repository.js";
import { createNoOpLogger } from "../../../src/common/logger.js";

let insertTaskCounter = 0;

function insertTask(
  db: Database,
  overrides: Partial<{
    id: string;
    title: string;
    duration: number;
    deadline: string | null;
    priority: string;
    status: string;
    category: string | null;
    actual_duration: number | null;
    updated_at: string;
  }> = {},
): void {
  const id = overrides.id ?? `task-${++insertTaskCounter}`;
  db.prepare(
    `INSERT INTO tasks (id, title, duration, deadline, priority, status, category, tags, is_recurring, actual_duration, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '[]', 0, ?, ?, ?)`,
  ).run(
    id,
    overrides.title ?? "Task",
    overrides.duration ?? 60,
    overrides.deadline ?? null,
    overrides.priority ?? "P3",
    overrides.status ?? "pending",
    overrides.category ?? null,
    overrides.actual_duration ?? null,
    "2026-04-01T00:00:00.000Z",
    overrides.updated_at ?? "2026-04-10T12:00:00.000Z",
  );
}

describe("AnalyticsRepository", () => {
  let db: Database;
  let repo: AnalyticsRepository;

  beforeEach(() => {
    db = new Database(":memory:", createNoOpLogger());
    repo = new AnalyticsRepository(db, createNoOpLogger());
  });

  afterEach(() => {
    db.close();
  });

  describe("getCompletedTasks", () => {
    it("returns completed tasks in date range", () => {
      insertTask(db, {
        id: "t1",
        status: "completed",
        duration: 60,
        actual_duration: 50,
        category: "engineering",
        deadline: "2026-04-15T00:00:00.000Z",
        updated_at: "2026-04-10T12:00:00.000Z",
      });
      insertTask(db, {
        id: "t2",
        status: "completed",
        updated_at: "2026-04-20T12:00:00.000Z",
      });
      insertTask(db, {
        id: "t3",
        status: "pending",
        updated_at: "2026-04-10T12:00:00.000Z",
      });

      const records = repo.getCompletedTasks(
        "2026-04-10T00:00:00.000Z",
        "2026-04-11T00:00:00.000Z",
      );

      expect(records).toHaveLength(1);
      expect(records[0].taskId).toBe("t1");
      expect(records[0].estimatedDuration).toBe(60);
      expect(records[0].actualDuration).toBe(50);
      expect(records[0].category).toBe("engineering");
      expect(records[0].wasOnTime).toBe(true);
    });

    it("marks task as not on time when completed after deadline", () => {
      insertTask(db, {
        id: "t1",
        status: "completed",
        deadline: "2026-04-09T00:00:00.000Z",
        updated_at: "2026-04-10T12:00:00.000Z",
      });

      const records = repo.getCompletedTasks(
        "2026-04-10T00:00:00.000Z",
        "2026-04-11T00:00:00.000Z",
      );

      expect(records[0].wasOnTime).toBe(false);
    });

    it("marks task without deadline as on time", () => {
      insertTask(db, {
        id: "t1",
        status: "completed",
        deadline: null,
        updated_at: "2026-04-10T12:00:00.000Z",
      });

      const records = repo.getCompletedTasks(
        "2026-04-10T00:00:00.000Z",
        "2026-04-11T00:00:00.000Z",
      );

      // No deadline means it can't be late
      expect(records[0].wasOnTime).toBe(false);
    });

    it("returns empty array when no completed tasks in range", () => {
      const records = repo.getCompletedTasks(
        "2026-04-10T00:00:00.000Z",
        "2026-04-11T00:00:00.000Z",
      );
      expect(records).toEqual([]);
    });
  });

  describe("getOverdueTasks", () => {
    it("returns tasks with past deadline that are not completed or cancelled", () => {
      insertTask(db, {
        id: "overdue",
        status: "pending",
        deadline: "2026-04-09T00:00:00.000Z",
      });
      insertTask(db, {
        id: "completed",
        status: "completed",
        deadline: "2026-04-09T00:00:00.000Z",
      });
      insertTask(db, {
        id: "future",
        status: "pending",
        deadline: "2026-04-20T00:00:00.000Z",
      });
      insertTask(db, {
        id: "no-deadline",
        status: "pending",
      });

      const overdue = repo.getOverdueTasks("2026-04-10T00:00:00.000Z");
      expect(overdue).toHaveLength(1);
      expect(overdue[0].id).toBe("overdue");
    });

    it("excludes cancelled tasks", () => {
      insertTask(db, {
        id: "cancelled",
        status: "cancelled",
        deadline: "2026-04-09T00:00:00.000Z",
      });

      const overdue = repo.getOverdueTasks("2026-04-10T00:00:00.000Z");
      expect(overdue).toEqual([]);
    });
  });

  describe("getCancelledTasks", () => {
    it("returns cancelled tasks in date range", () => {
      insertTask(db, {
        id: "c1",
        status: "cancelled",
        updated_at: "2026-04-10T12:00:00.000Z",
      });
      insertTask(db, {
        id: "c2",
        status: "cancelled",
        updated_at: "2026-04-20T12:00:00.000Z",
      });

      const cancelled = repo.getCancelledTasks(
        "2026-04-10T00:00:00.000Z",
        "2026-04-11T00:00:00.000Z",
      );
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0].id).toBe("c1");
    });
  });

  describe("getTasksByCategory", () => {
    it("groups completed tasks by category", () => {
      insertTask(db, {
        id: "e1",
        status: "completed",
        category: "engineering",
        duration: 60,
        actual_duration: 50,
        updated_at: "2026-04-10T12:00:00.000Z",
      });
      insertTask(db, {
        id: "e2",
        status: "completed",
        category: "engineering",
        duration: 30,
        actual_duration: 40,
        updated_at: "2026-04-10T13:00:00.000Z",
      });
      insertTask(db, {
        id: "p1",
        status: "completed",
        category: "personal",
        duration: 120,
        updated_at: "2026-04-10T14:00:00.000Z",
      });

      const categories = repo.getTasksByCategory(
        "2026-04-10T00:00:00.000Z",
        "2026-04-11T00:00:00.000Z",
      );
      expect(categories).toHaveLength(2);
      // Sorted by total_minutes DESC: personal (120), engineering (50+40=90)
      expect(categories[0].category).toBe("personal");
      expect(categories[0].totalMinutes).toBe(120);
      expect(categories[1].category).toBe("engineering");
      expect(categories[1].totalMinutes).toBe(90);
    });

    it("uses 'uncategorized' for null category", () => {
      insertTask(db, {
        id: "n1",
        status: "completed",
        category: null,
        duration: 60,
        updated_at: "2026-04-10T12:00:00.000Z",
      });

      const categories = repo.getTasksByCategory(
        "2026-04-10T00:00:00.000Z",
        "2026-04-11T00:00:00.000Z",
      );
      expect(categories).toHaveLength(1);
      expect(categories[0].category).toBe("uncategorized");
    });
  });

  describe("getDurationRecords", () => {
    it("returns records where both estimated and actual duration exist", () => {
      insertTask(db, {
        id: "t1",
        status: "completed",
        duration: 60,
        actual_duration: 45,
        category: "engineering",
        updated_at: "2026-04-10T12:00:00.000Z",
      });
      insertTask(db, {
        id: "t2",
        status: "completed",
        duration: 30,
        actual_duration: null,
        updated_at: "2026-04-10T12:00:00.000Z",
      });

      const records = repo.getDurationRecords(
        "2026-04-10T00:00:00.000Z",
        "2026-04-11T00:00:00.000Z",
      );
      expect(records).toHaveLength(1);
      expect(records[0].taskId).toBe("t1");
      expect(records[0].estimatedMinutes).toBe(60);
      expect(records[0].actualMinutes).toBe(45);
      expect(records[0].category).toBe("engineering");
    });

    it("returns empty array when no matching records", () => {
      const records = repo.getDurationRecords(
        "2026-04-10T00:00:00.000Z",
        "2026-04-11T00:00:00.000Z",
      );
      expect(records).toEqual([]);
    });
  });
});
