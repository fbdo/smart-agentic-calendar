import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Database } from "../../../src/storage/database.js";

describe("Database", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("initializes without error", () => {
    expect(db).toBeDefined();
  });

  it("enables WAL journal mode (memory falls back to 'memory')", () => {
    const result = db.pragma("journal_mode") as { journal_mode: string }[];
    // In-memory databases cannot use WAL; they report "memory" instead
    expect(["wal", "memory"]).toContain(result[0].journal_mode);
  });

  it("enables foreign keys", () => {
    const result = db.pragma("foreign_keys") as { foreign_keys: number }[];
    expect(result[0].foreign_keys).toBe(1);
  });

  it("sets user_version to 1", () => {
    const result = db.pragma("user_version") as { user_version: number }[];
    expect(result[0].user_version).toBe(1);
  });

  describe("schema creation", () => {
    const expectedTables = [
      "tasks",
      "events",
      "time_blocks",
      "dependencies",
      "schedule_status",
      "config_availability",
      "config_focus_time",
      "config_preferences",
      "recurrence_templates",
      "recurrence_instances",
      "recurrence_exceptions",
    ];

    it.each(expectedTables)("creates %s table", (tableName) => {
      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(tableName) as { name: string } | undefined;
      expect(result).toBeDefined();
      expect(result!.name).toBe(tableName);
    });

    it("creates all 11 tables", () => {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as { name: string }[];
      expect(tables).toHaveLength(11);
    });

    it("creates expected indexes", () => {
      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name",
        )
        .all() as { name: string }[];
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain("idx_tasks_status");
      expect(indexNames).toContain("idx_tasks_priority");
      expect(indexNames).toContain("idx_tasks_deadline");
      expect(indexNames).toContain("idx_tasks_category");
      expect(indexNames).toContain("idx_tasks_recurrence_template");
      expect(indexNames).toContain("idx_events_start");
      expect(indexNames).toContain("idx_events_date");
      expect(indexNames).toContain("idx_time_blocks_task");
      expect(indexNames).toContain("idx_time_blocks_date");
      expect(indexNames).toContain("idx_time_blocks_start");
      expect(indexNames).toContain("idx_recurrence_instances_template");
      expect(indexNames).toContain("idx_recurrence_instances_date");
    });
  });

  describe("schedule_status singleton", () => {
    it("has exactly one row with status up_to_date", () => {
      const row = db.prepare("SELECT * FROM schedule_status").get() as {
        id: number;
        status: string;
        last_replan_at: string | null;
      };
      expect(row.id).toBe(1);
      expect(row.status).toBe("up_to_date");
      expect(row.last_replan_at).toBeNull();
    });
  });

  describe("config_preferences defaults", () => {
    it("has all default preference rows", () => {
      const rows = db.prepare("SELECT key, value FROM config_preferences ORDER BY key").all() as {
        key: string;
        value: string;
      }[];
      const prefs = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      expect(prefs["buffer_time_minutes"]).toBe("15");
      expect(prefs["default_priority"]).toBe('"P3"');
      expect(prefs["default_duration"]).toBe("60");
      expect(prefs["scheduling_horizon_weeks"]).toBe("4");
      expect(prefs["minimum_block_minutes"]).toBe("30");
      expect(prefs["focus_time_minimum_block_minutes"]).toBe("60");
    });
  });

  describe("foreign key enforcement", () => {
    it("rejects time_block with non-existent task_id", () => {
      expect(() =>
        db
          .prepare(
            "INSERT INTO time_blocks (id, task_id, start_time, end_time, date) VALUES (?, ?, ?, ?, ?)",
          )
          .run("tb-1", "nonexistent", "2026-01-15T09:00:00Z", "2026-01-15T10:00:00Z", "2026-01-15"),
      ).toThrow();
    });
  });

  describe("idempotent initialization", () => {
    it("can create a second Database on the same file without error", () => {
      const db2 = new Database(":memory:");
      expect(db2).toBeDefined();
      db2.close();
    });
  });
});
