import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Database } from "../../../src/storage/database.js";
import { RecurrenceRepository } from "../../../src/storage/recurrence-repository.js";
import { NotFoundError } from "../../../src/models/errors.js";

describe("RecurrenceRepository", () => {
  let db: Database;
  let repo: RecurrenceRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    repo = new RecurrenceRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  const sampleTaskData = {
    title: "Weekly review",
    description: "Review the week",
    duration: 60,
    deadline: null,
    priority: "P2" as const,
    category: "planning",
    tags: ["recurring"],
  };

  describe("createTemplate", () => {
    it("creates a recurrence template", () => {
      const template = repo.createTemplate({
        taskData: sampleTaskData,
        rrule: "FREQ=WEEKLY;BYDAY=FR",
      });

      expect(template.id).toBeDefined();
      expect(template.taskData.title).toBe("Weekly review");
      expect(template.taskData.duration).toBe(60);
      expect(template.taskData.tags).toEqual(["recurring"]);
      expect(template.rrule).toBe("FREQ=WEEKLY;BYDAY=FR");
      expect(template.isActive).toBe(true);
      expect(template.createdAt).toBeDefined();
    });

    it("serializes and deserializes taskData correctly", () => {
      const template = repo.createTemplate({
        taskData: sampleTaskData,
        rrule: "FREQ=DAILY",
      });

      const found = repo.getTemplate(template.id);
      expect(found).toBeDefined();
      expect(found!.taskData).toEqual(sampleTaskData);
    });
  });

  describe("getTemplate", () => {
    it("returns template when found", () => {
      const created = repo.createTemplate({
        taskData: sampleTaskData,
        rrule: "FREQ=DAILY",
      });

      const found = repo.getTemplate(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it("returns undefined when not found", () => {
      expect(repo.getTemplate("nonexistent")).toBeUndefined();
    });
  });

  describe("getActiveTemplates", () => {
    it("returns only active templates", () => {
      repo.createTemplate({ taskData: sampleTaskData, rrule: "FREQ=DAILY" });
      const toDelete = repo.createTemplate({ taskData: sampleTaskData, rrule: "FREQ=WEEKLY" });
      repo.deleteTemplate(toDelete.id);

      const active = repo.getActiveTemplates();
      expect(active).toHaveLength(1);
    });

    it("returns empty array when no active templates", () => {
      expect(repo.getActiveTemplates()).toEqual([]);
    });
  });

  describe("deleteTemplate", () => {
    it("soft-deletes a template", () => {
      const template = repo.createTemplate({
        taskData: sampleTaskData,
        rrule: "FREQ=DAILY",
      });

      repo.deleteTemplate(template.id);

      const found = repo.getTemplate(template.id);
      expect(found).toBeDefined();
      expect(found!.isActive).toBe(false);
    });

    it("throws NotFoundError for nonexistent template", () => {
      expect(() => repo.deleteTemplate("nonexistent")).toThrow(NotFoundError);
    });
  });

  describe("createInstance", () => {
    it("creates a recurrence instance", () => {
      const template = repo.createTemplate({
        taskData: sampleTaskData,
        rrule: "FREQ=WEEKLY;BYDAY=FR",
      });

      // Insert a task for the FK constraint
      db.prepare(
        "INSERT INTO tasks (id, title, duration, priority, status, tags, is_recurring, recurrence_template_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        "task-inst-1",
        "Weekly review",
        60,
        "P2",
        "pending",
        '["recurring"]',
        1,
        template.id,
        "2026-04-10T00:00:00.000Z",
        "2026-04-10T00:00:00.000Z",
      );

      const instance = repo.createInstance({
        templateId: template.id,
        taskId: "task-inst-1",
        scheduledDate: "2026-04-11",
        isException: false,
      });

      expect(instance.id).toBeDefined();
      expect(instance.templateId).toBe(template.id);
      expect(instance.taskId).toBe("task-inst-1");
      expect(instance.scheduledDate).toBe("2026-04-11");
      expect(instance.isException).toBe(false);
    });
  });

  describe("getInstances", () => {
    it("returns instances within date range", () => {
      const template = repo.createTemplate({
        taskData: sampleTaskData,
        rrule: "FREQ=WEEKLY",
      });

      // Insert tasks for FK
      for (let i = 1; i <= 3; i++) {
        db.prepare(
          "INSERT INTO tasks (id, title, duration, priority, status, tags, is_recurring, recurrence_template_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(
          `task-${i}`,
          "Weekly review",
          60,
          "P2",
          "pending",
          "[]",
          1,
          template.id,
          "2026-04-10T00:00:00.000Z",
          "2026-04-10T00:00:00.000Z",
        );
      }

      repo.createInstance({
        templateId: template.id,
        taskId: "task-1",
        scheduledDate: "2026-04-04",
        isException: false,
      });
      repo.createInstance({
        templateId: template.id,
        taskId: "task-2",
        scheduledDate: "2026-04-11",
        isException: false,
      });
      repo.createInstance({
        templateId: template.id,
        taskId: "task-3",
        scheduledDate: "2026-04-18",
        isException: false,
      });

      const instances = repo.getInstances(template.id, "2026-04-10", "2026-04-15");
      expect(instances).toHaveLength(1);
      expect(instances[0].scheduledDate).toBe("2026-04-11");
    });

    it("orders by scheduled date", () => {
      const template = repo.createTemplate({
        taskData: sampleTaskData,
        rrule: "FREQ=DAILY",
      });

      for (let i = 1; i <= 2; i++) {
        db.prepare(
          "INSERT INTO tasks (id, title, duration, priority, status, tags, is_recurring, recurrence_template_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(
          `task-${i}`,
          "Task",
          60,
          "P3",
          "pending",
          "[]",
          1,
          template.id,
          "2026-04-10T00:00:00.000Z",
          "2026-04-10T00:00:00.000Z",
        );
      }

      repo.createInstance({
        templateId: template.id,
        taskId: "task-2",
        scheduledDate: "2026-04-12",
        isException: false,
      });
      repo.createInstance({
        templateId: template.id,
        taskId: "task-1",
        scheduledDate: "2026-04-11",
        isException: false,
      });

      const instances = repo.getInstances(template.id, "2026-04-10", "2026-04-13");
      expect(instances[0].scheduledDate).toBe("2026-04-11");
      expect(instances[1].scheduledDate).toBe("2026-04-12");
    });
  });

  describe("addException", () => {
    it("adds a skip exception", () => {
      const template = repo.createTemplate({
        taskData: sampleTaskData,
        rrule: "FREQ=WEEKLY",
      });

      repo.addException(template.id, "2026-04-11", { type: "skip", overrides: null });

      const exceptions = repo.getExceptions(template.id);
      expect(exceptions).toHaveLength(1);
      expect(exceptions[0].type).toBe("skip");
      expect(exceptions[0].date).toBe("2026-04-11");
      expect(exceptions[0].overrides).toBeNull();
    });

    it("adds a modify exception", () => {
      const template = repo.createTemplate({
        taskData: sampleTaskData,
        rrule: "FREQ=WEEKLY",
      });

      repo.addException(template.id, "2026-04-11", {
        type: "modify",
        overrides: { title: "Modified review", duration: 90 } as Partial<
          import("../../../src/models/task.js").Task
        >,
      });

      const exceptions = repo.getExceptions(template.id);
      expect(exceptions).toHaveLength(1);
      expect(exceptions[0].type).toBe("modify");
      expect(exceptions[0].overrides).toEqual({ title: "Modified review", duration: 90 });
    });

    it("overwrites existing exception for same template+date", () => {
      const template = repo.createTemplate({
        taskData: sampleTaskData,
        rrule: "FREQ=WEEKLY",
      });

      repo.addException(template.id, "2026-04-11", { type: "skip", overrides: null });
      repo.addException(template.id, "2026-04-11", {
        type: "modify",
        overrides: { title: "Changed" } as Partial<import("../../../src/models/task.js").Task>,
      });

      const exceptions = repo.getExceptions(template.id);
      expect(exceptions).toHaveLength(1);
      expect(exceptions[0].type).toBe("modify");
    });
  });

  describe("getExceptions", () => {
    it("returns exceptions ordered by date", () => {
      const template = repo.createTemplate({
        taskData: sampleTaskData,
        rrule: "FREQ=WEEKLY",
      });

      repo.addException(template.id, "2026-04-18", { type: "skip", overrides: null });
      repo.addException(template.id, "2026-04-11", { type: "skip", overrides: null });

      const exceptions = repo.getExceptions(template.id);
      expect(exceptions[0].date).toBe("2026-04-11");
      expect(exceptions[1].date).toBe("2026-04-18");
    });

    it("returns empty array when no exceptions", () => {
      const template = repo.createTemplate({
        taskData: sampleTaskData,
        rrule: "FREQ=WEEKLY",
      });

      expect(repo.getExceptions(template.id)).toEqual([]);
    });
  });
});
