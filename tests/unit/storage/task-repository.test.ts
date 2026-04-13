import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Database } from "../../../src/storage/database.js";
import { TaskRepository } from "../../../src/storage/task-repository.js";
import type { Task, TaskStatus } from "../../../src/models/task.js";
import { NotFoundError, InvalidStateError, ValidationError } from "../../../src/models/errors.js";
import { createNoOpLogger } from "../../../src/common/logger.js";

describe("TaskRepository", () => {
  let db: Database;
  let repo: TaskRepository;

  beforeEach(() => {
    db = new Database(":memory:", createNoOpLogger());
    repo = new TaskRepository(db, createNoOpLogger());
  });

  afterEach(() => {
    db.close();
  });

  describe("create", () => {
    it("creates a task with all fields", () => {
      const task = repo.create({
        title: "Write tests",
        description: "Unit tests for task repo",
        duration: 120,
        deadline: "2026-04-15T17:00:00.000Z",
        priority: "P1",
        category: "engineering",
        tags: ["deep-work", "testing"],
        isRecurring: false,
        recurrenceTemplateId: null,
      });

      expect(task.id).toBeDefined();
      expect(task.title).toBe("Write tests");
      expect(task.description).toBe("Unit tests for task repo");
      expect(task.duration).toBe(120);
      expect(task.deadline).toBe("2026-04-15T17:00:00.000Z");
      expect(task.priority).toBe("P1");
      expect(task.status).toBe("pending");
      expect(task.category).toBe("engineering");
      expect(task.tags).toEqual(["deep-work", "testing"]);
      expect(task.isRecurring).toBe(false);
      expect(task.recurrenceTemplateId).toBeNull();
      expect(task.actualDuration).toBeNull();
      expect(task.createdAt).toBeDefined();
      expect(task.updatedAt).toBeDefined();
    });

    it("creates a task with minimal fields and defaults", () => {
      const task = repo.create({
        title: "Simple task",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });

      expect(task.title).toBe("Simple task");
      expect(task.description).toBeNull();
      expect(task.deadline).toBeNull();
      expect(task.priority).toBe("P3");
      expect(task.status).toBe("pending");
      expect(task.category).toBeNull();
      expect(task.tags).toEqual([]);
    });

    it("generates unique IDs for each task", () => {
      const task1 = repo.create({
        title: "Task 1",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      const task2 = repo.create({
        title: "Task 2",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });

      expect(task1.id).not.toBe(task2.id);
    });

    it("trims whitespace from title", () => {
      const task = repo.create({
        title: "  Trimmed title  ",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });

      expect(task.title).toBe("Trimmed title");
    });

    it("throws ValidationError for empty title", () => {
      expect(() =>
        repo.create({
          title: "",
          description: null,
          duration: 30,
          deadline: null,
          priority: "P3",
          category: null,
          tags: [],
          isRecurring: false,
          recurrenceTemplateId: null,
        }),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError for whitespace-only title", () => {
      expect(() =>
        repo.create({
          title: "   ",
          description: null,
          duration: 30,
          deadline: null,
          priority: "P3",
          category: null,
          tags: [],
          isRecurring: false,
          recurrenceTemplateId: null,
        }),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError for zero duration", () => {
      expect(() =>
        repo.create({
          title: "Task",
          description: null,
          duration: 0,
          deadline: null,
          priority: "P3",
          category: null,
          tags: [],
          isRecurring: false,
          recurrenceTemplateId: null,
        }),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError for negative duration", () => {
      expect(() =>
        repo.create({
          title: "Task",
          description: null,
          duration: -10,
          deadline: null,
          priority: "P3",
          category: null,
          tags: [],
          isRecurring: false,
          recurrenceTemplateId: null,
        }),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError for invalid deadline format", () => {
      expect(() =>
        repo.create({
          title: "Task",
          description: null,
          duration: 30,
          deadline: "not-a-date",
          priority: "P3",
          category: null,
          tags: [],
          isRecurring: false,
          recurrenceTemplateId: null,
        }),
      ).toThrow(ValidationError);
    });
  });

  describe("findById", () => {
    it("returns the task when found", () => {
      const created = repo.create({
        title: "Find me",
        description: null,
        duration: 60,
        deadline: null,
        priority: "P2",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });

      const found = repo.findById(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.title).toBe("Find me");
      expect(found!.priority).toBe("P2");
    });

    it("returns undefined when not found", () => {
      const found = repo.findById("nonexistent-id");
      expect(found).toBeUndefined();
    });
  });

  describe("findAll", () => {
    function createTask(
      overrides: Partial<{
        title: string;
        duration: number;
        deadline: string | null;
        priority: "P1" | "P2" | "P3" | "P4";
        category: string | null;
        status: TaskStatus;
      }> = {},
    ): Task {
      const task = repo.create({
        title: overrides.title ?? "Task",
        description: null,
        duration: overrides.duration ?? 60,
        deadline: overrides.deadline ?? null,
        priority: overrides.priority ?? "P3",
        category: overrides.category ?? null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      if (overrides.status && overrides.status !== "pending") {
        repo.updateStatus(task.id, overrides.status);
        return repo.findById(task.id)!;
      }
      return task;
    }

    it("returns all tasks when no filters", () => {
      createTask({ title: "A" });
      createTask({ title: "B" });
      createTask({ title: "C" });

      const all = repo.findAll();
      expect(all).toHaveLength(3);
    });

    it("returns empty array when no tasks exist", () => {
      const all = repo.findAll();
      expect(all).toEqual([]);
    });

    it("filters by status", () => {
      createTask({ title: "Pending" });
      createTask({ title: "Scheduled", status: "scheduled" });

      const pending = repo.findAll({ status: "pending" });
      expect(pending).toHaveLength(1);
      expect(pending[0].title).toBe("Pending");
    });

    it("filters by priority", () => {
      createTask({ title: "High", priority: "P1" });
      createTask({ title: "Low", priority: "P4" });

      const high = repo.findAll({ priority: "P1" });
      expect(high).toHaveLength(1);
      expect(high[0].title).toBe("High");
    });

    it("filters by deadlineBefore", () => {
      createTask({ title: "Soon", deadline: "2026-04-10T00:00:00.000Z" });
      createTask({ title: "Later", deadline: "2026-05-01T00:00:00.000Z" });
      createTask({ title: "No deadline" });

      const before = repo.findAll({ deadlineBefore: "2026-04-15T00:00:00.000Z" });
      expect(before).toHaveLength(1);
      expect(before[0].title).toBe("Soon");
    });

    it("filters by deadlineAfter", () => {
      createTask({ title: "Soon", deadline: "2026-04-10T00:00:00.000Z" });
      createTask({ title: "Later", deadline: "2026-05-01T00:00:00.000Z" });

      const after = repo.findAll({ deadlineAfter: "2026-04-15T00:00:00.000Z" });
      expect(after).toHaveLength(1);
      expect(after[0].title).toBe("Later");
    });

    it("filters by category", () => {
      createTask({ title: "Work", category: "engineering" });
      createTask({ title: "Personal", category: "personal" });

      const eng = repo.findAll({ category: "engineering" });
      expect(eng).toHaveLength(1);
      expect(eng[0].title).toBe("Work");
    });

    it("combines multiple filters", () => {
      createTask({ title: "Match", priority: "P1", category: "engineering" });
      createTask({ title: "Wrong priority", priority: "P4", category: "engineering" });
      createTask({ title: "Wrong category", priority: "P1", category: "personal" });

      const results = repo.findAll({ priority: "P1", category: "engineering" });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Match");
    });

    it("orders by priority ASC, deadline ASC NULLS LAST, createdAt ASC", () => {
      createTask({ title: "P3 no deadline", priority: "P3" });
      createTask({
        title: "P1 late deadline",
        priority: "P1",
        deadline: "2026-06-01T00:00:00.000Z",
      });
      createTask({
        title: "P1 early deadline",
        priority: "P1",
        deadline: "2026-04-01T00:00:00.000Z",
      });
      createTask({ title: "P2 no deadline", priority: "P2" });

      const all = repo.findAll();
      expect(all[0].title).toBe("P1 early deadline");
      expect(all[1].title).toBe("P1 late deadline");
      expect(all[2].title).toBe("P2 no deadline");
      expect(all[3].title).toBe("P3 no deadline");
    });
  });

  describe("update", () => {
    it("updates provided fields only", () => {
      const task = repo.create({
        title: "Original",
        description: "Original desc",
        duration: 60,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });

      const updated = repo.update(task.id, { title: "Updated", priority: "P1" });
      expect(updated.title).toBe("Updated");
      expect(updated.priority).toBe("P1");
      expect(updated.description).toBe("Original desc");
      expect(updated.duration).toBe(60);
      expect(updated.updatedAt >= task.updatedAt).toBe(true);
    });

    it("updates tags", () => {
      const task = repo.create({
        title: "Task",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });

      const updated = repo.update(task.id, { tags: ["deep-work"] });
      expect(updated.tags).toEqual(["deep-work"]);
    });

    it("throws NotFoundError for nonexistent task", () => {
      expect(() => repo.update("nonexistent", { title: "Nope" })).toThrow(NotFoundError);
    });

    it("throws InvalidStateError for completed task", () => {
      const task = repo.create({
        title: "Done",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      repo.updateStatus(task.id, "scheduled");
      repo.updateStatus(task.id, "completed");

      expect(() => repo.update(task.id, { title: "Changed" })).toThrow(InvalidStateError);
    });

    it("throws InvalidStateError for cancelled task", () => {
      const task = repo.create({
        title: "Cancelled",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      repo.updateStatus(task.id, "cancelled");

      expect(() => repo.update(task.id, { title: "Changed" })).toThrow(InvalidStateError);
    });
  });

  describe("updateStatus", () => {
    it("transitions pending → scheduled", () => {
      const task = repo.create({
        title: "Task",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });

      const updated = repo.updateStatus(task.id, "scheduled");
      expect(updated.status).toBe("scheduled");
    });

    it("transitions pending → cancelled", () => {
      const task = repo.create({
        title: "Task",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });

      const updated = repo.updateStatus(task.id, "cancelled");
      expect(updated.status).toBe("cancelled");
    });

    it("transitions pending → at_risk", () => {
      const task = repo.create({
        title: "Task",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });

      const updated = repo.updateStatus(task.id, "at_risk");
      expect(updated.status).toBe("at_risk");
    });

    it("transitions scheduled → completed", () => {
      const task = repo.create({
        title: "Task",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      repo.updateStatus(task.id, "scheduled");

      const updated = repo.updateStatus(task.id, "completed");
      expect(updated.status).toBe("completed");
    });

    it("transitions at_risk → scheduled", () => {
      const task = repo.create({
        title: "Task",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      repo.updateStatus(task.id, "at_risk");

      const updated = repo.updateStatus(task.id, "scheduled");
      expect(updated.status).toBe("scheduled");
    });

    it("transitions at_risk → completed", () => {
      const task = repo.create({
        title: "Task",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      repo.updateStatus(task.id, "at_risk");

      const updated = repo.updateStatus(task.id, "completed");
      expect(updated.status).toBe("completed");
    });

    it("allows idempotent completed → completed", () => {
      const task = repo.create({
        title: "Task",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      repo.updateStatus(task.id, "scheduled");
      repo.updateStatus(task.id, "completed");

      const updated = repo.updateStatus(task.id, "completed");
      expect(updated.status).toBe("completed");
    });

    it("transitions scheduled → pending (replan removes blocks)", () => {
      const task = repo.create({
        title: "Task",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      repo.updateStatus(task.id, "scheduled");

      const updated = repo.updateStatus(task.id, "pending");
      expect(updated.status).toBe("pending");
    });

    it("throws InvalidStateError for completed → pending", () => {
      const task = repo.create({
        title: "Task",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      repo.updateStatus(task.id, "scheduled");
      repo.updateStatus(task.id, "completed");

      expect(() => repo.updateStatus(task.id, "pending")).toThrow(InvalidStateError);
    });

    it("throws InvalidStateError for cancelled → any other", () => {
      const task = repo.create({
        title: "Task",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      repo.updateStatus(task.id, "cancelled");

      expect(() => repo.updateStatus(task.id, "pending")).toThrow(InvalidStateError);
    });

    it("throws NotFoundError for nonexistent task", () => {
      expect(() => repo.updateStatus("nonexistent", "scheduled")).toThrow(NotFoundError);
    });
  });

  // --- Step 2: Dependencies & Completion ---

  describe("delete", () => {
    it("soft-deletes a pending task", () => {
      const task = repo.create({
        title: "To delete",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });

      repo.delete(task.id);

      const found = repo.findById(task.id);
      expect(found).toBeDefined();
      expect(found!.status).toBe("cancelled");
    });

    it("removes dependencies when deleting a task", () => {
      const taskA = repo.create({
        title: "A",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      const taskB = repo.create({
        title: "B",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      repo.addDependency(taskB.id, taskA.id);

      repo.delete(taskA.id);

      const deps = repo.getDependencies(taskB.id);
      expect(deps).toHaveLength(0);
    });

    it("throws NotFoundError for nonexistent task", () => {
      expect(() => repo.delete("nonexistent")).toThrow(NotFoundError);
    });

    it("throws InvalidStateError for completed task", () => {
      const task = repo.create({
        title: "Done",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      repo.updateStatus(task.id, "scheduled");
      repo.updateStatus(task.id, "completed");

      expect(() => repo.delete(task.id)).toThrow(InvalidStateError);
    });

    it("throws InvalidStateError for already cancelled task", () => {
      const task = repo.create({
        title: "Already cancelled",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      repo.updateStatus(task.id, "cancelled");

      expect(() => repo.delete(task.id)).toThrow(InvalidStateError);
    });
  });

  describe("addDependency", () => {
    it("adds a dependency between two tasks", () => {
      const taskA = repo.create({
        title: "A",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      const taskB = repo.create({
        title: "B",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });

      repo.addDependency(taskB.id, taskA.id);

      const deps = repo.getDependencies(taskB.id);
      expect(deps).toHaveLength(1);
      expect(deps[0].id).toBe(taskA.id);
    });

    it("throws NotFoundError when task does not exist", () => {
      const task = repo.create({
        title: "A",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });

      expect(() => repo.addDependency(task.id, "nonexistent")).toThrow(NotFoundError);
    });

    it("throws NotFoundError when dependsOn does not exist", () => {
      const task = repo.create({
        title: "A",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });

      expect(() => repo.addDependency("nonexistent", task.id)).toThrow(NotFoundError);
    });
  });

  describe("removeDependency", () => {
    it("removes an existing dependency", () => {
      const taskA = repo.create({
        title: "A",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      const taskB = repo.create({
        title: "B",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      repo.addDependency(taskB.id, taskA.id);

      repo.removeDependency(taskB.id, taskA.id);

      const deps = repo.getDependencies(taskB.id);
      expect(deps).toHaveLength(0);
    });

    it("throws NotFoundError when dependency does not exist", () => {
      expect(() => repo.removeDependency("a", "b")).toThrow(NotFoundError);
    });
  });

  describe("getDependencies", () => {
    it("returns tasks that this task depends on", () => {
      const taskA = repo.create({
        title: "Blocker 1",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      const taskB = repo.create({
        title: "Blocker 2",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      const taskC = repo.create({
        title: "Blocked",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      repo.addDependency(taskC.id, taskA.id);
      repo.addDependency(taskC.id, taskB.id);

      const deps = repo.getDependencies(taskC.id);
      expect(deps).toHaveLength(2);
      const titles = deps.map((d) => d.title).sort((a, b) => a.localeCompare(b));
      expect(titles).toEqual(["Blocker 1", "Blocker 2"]);
    });

    it("returns empty array when no dependencies", () => {
      const task = repo.create({
        title: "Independent",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });

      const deps = repo.getDependencies(task.id);
      expect(deps).toEqual([]);
    });
  });

  describe("getDependents", () => {
    it("returns tasks that depend on this task", () => {
      const taskA = repo.create({
        title: "Blocker",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      const taskB = repo.create({
        title: "Dependent 1",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      const taskC = repo.create({
        title: "Dependent 2",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });
      repo.addDependency(taskB.id, taskA.id);
      repo.addDependency(taskC.id, taskA.id);

      const dependents = repo.getDependents(taskA.id);
      expect(dependents).toHaveLength(2);
      const titles = dependents.map((d) => d.title).sort((a, b) => a.localeCompare(b));
      expect(titles).toEqual(["Dependent 1", "Dependent 2"]);
    });
  });

  describe("recordActualDuration", () => {
    it("records actual duration on a task", () => {
      const task = repo.create({
        title: "Task",
        description: null,
        duration: 60,
        deadline: null,
        priority: "P3",
        category: null,
        tags: [],
        isRecurring: false,
        recurrenceTemplateId: null,
      });

      repo.recordActualDuration(task.id, 45);

      const found = repo.findById(task.id);
      expect(found!.actualDuration).toBe(45);
    });

    it("throws NotFoundError for nonexistent task", () => {
      expect(() => repo.recordActualDuration("nonexistent", 30)).toThrow(NotFoundError);
    });
  });
});
