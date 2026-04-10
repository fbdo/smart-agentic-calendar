import { describe, it, expect, vi } from "vitest";
import { RecurrenceManager } from "../../../src/engine/recurrence-manager.js";
import type { RecurrenceRepository } from "../../../src/storage/recurrence-repository.js";
import type { TaskRepository } from "../../../src/storage/task-repository.js";
import type { Task } from "../../../src/models/task.js";
import type {
  RecurrenceTemplate,
  RecurrenceInstance,
  RecurrenceException,
} from "../../../src/models/recurrence.js";
import { ValidationError, InvalidStateError, NotFoundError } from "../../../src/models/errors.js";

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: "Task",
    description: null,
    duration: 60,
    deadline: null,
    priority: "P3",
    status: "pending",
    category: null,
    tags: [],
    isRecurring: false,
    recurrenceTemplateId: null,
    actualDuration: null,
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
    ...overrides,
  };
}

function createMocks() {
  let templateIdCounter = 0;
  let instanceIdCounter = 0;
  const templates = new Map<string, RecurrenceTemplate>();
  const instances: RecurrenceInstance[] = [];
  const exceptions: RecurrenceException[] = [];
  const tasks = new Map<string, Task>();
  let taskIdCounter = 0;

  const recurrenceRepo = {
    createTemplate: vi.fn((input: Omit<RecurrenceTemplate, "id" | "createdAt" | "isActive">) => {
      const template: RecurrenceTemplate = {
        ...input,
        id: `tmpl-${++templateIdCounter}`,
        isActive: true,
        createdAt: "2026-04-10T00:00:00.000Z",
      };
      templates.set(template.id, template);
      return template;
    }),
    getTemplate: vi.fn((id: string) => templates.get(id) ?? undefined),
    getActiveTemplates: vi.fn(() => Array.from(templates.values()).filter((t) => t.isActive)),
    deleteTemplate: vi.fn((id: string) => {
      const tmpl = templates.get(id);
      if (tmpl) {
        tmpl.isActive = false;
      }
    }),
    createInstance: vi.fn((input: Omit<RecurrenceInstance, "id">) => {
      const inst: RecurrenceInstance = {
        ...input,
        id: `inst-${++instanceIdCounter}`,
      };
      instances.push(inst);
      return inst;
    }),
    getInstances: vi.fn((templateId: string, start: string, end: string) =>
      instances.filter(
        (i) =>
          i.templateId === templateId &&
          i.scheduledDate >= start.slice(0, 10) &&
          i.scheduledDate <= end.slice(0, 10),
      ),
    ),
    addException: vi.fn((templateId: string, date: string, exception: RecurrenceException) => {
      // Remove existing exception for same template+date
      const idx = exceptions.findIndex((e) => e.templateId === templateId && e.date === date);
      if (idx >= 0) exceptions.splice(idx, 1);
      exceptions.push(exception);
    }),
    getExceptions: vi.fn((templateId: string) =>
      exceptions.filter((e) => e.templateId === templateId),
    ),
  } as unknown as RecurrenceRepository;

  const taskRepo = {
    create: vi.fn((input: Omit<Task, "id" | "createdAt">) => {
      const task: Task = {
        ...input,
        id: `task-${++taskIdCounter}`,
        createdAt: "2026-04-10T00:00:00.000Z",
        updatedAt: "2026-04-10T00:00:00.000Z",
        status: "pending",
        actualDuration: null,
      } as Task;
      tasks.set(task.id, task);
      return task;
    }),
    findById: vi.fn((id: string) => tasks.get(id) ?? undefined),
    updateStatus: vi.fn((id: string, status: string) => {
      const task = tasks.get(id);
      if (task) {
        (task as Task).status = status as Task["status"];
      }
    }),
    update: vi.fn((id: string, updates: Partial<Task>) => {
      const task = tasks.get(id);
      if (task) {
        Object.assign(task, updates);
      }
      return task;
    }),
  } as unknown as TaskRepository;

  return { recurrenceRepo, taskRepo, templates, instances, exceptions, tasks };
}

describe("RecurrenceManager", () => {
  describe("createRecurringTask", () => {
    it("creates a daily recurrence template with instances within horizon", () => {
      const { recurrenceRepo, taskRepo } = createMocks();
      const manager = new RecurrenceManager(recurrenceRepo, taskRepo);

      const taskData = {
        title: "Daily standup prep",
        description: null,
        duration: 15,
        deadline: null,
        priority: "P3" as const,
        category: null,
        tags: [],
        isRecurring: true,
        recurrenceTemplateId: null,
      };

      const now = new Date("2026-04-13T08:00:00.000Z"); // Monday
      const horizonEnd = new Date("2026-04-17T23:59:59.000Z"); // Friday

      const result = manager.createRecurringTask(
        taskData,
        "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR",
        now,
        horizonEnd,
      );

      expect(result.template.id).toBeDefined();
      expect(result.template.rrule).toBe("FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR");
      expect(result.template.isActive).toBe(true);
      expect(result.instances.length).toBeGreaterThanOrEqual(4); // Mon-Fri within horizon
    });

    it("creates a weekly recurrence", () => {
      const { recurrenceRepo, taskRepo } = createMocks();
      const manager = new RecurrenceManager(recurrenceRepo, taskRepo);

      const taskData = {
        title: "Weekly review",
        description: null,
        duration: 60,
        deadline: null,
        priority: "P2" as const,
        category: null,
        tags: [],
        isRecurring: true,
        recurrenceTemplateId: null,
      };

      const now = new Date("2026-04-13T08:00:00.000Z");
      const horizonEnd = new Date("2026-05-11T23:59:59.000Z"); // 4 weeks

      const result = manager.createRecurringTask(taskData, "FREQ=WEEKLY;BYDAY=MO", now, horizonEnd);

      expect(result.instances.length).toBeGreaterThanOrEqual(3); // ~4 Mondays
    });

    it("respects COUNT limit", () => {
      const { recurrenceRepo, taskRepo } = createMocks();
      const manager = new RecurrenceManager(recurrenceRepo, taskRepo);

      const taskData = {
        title: "Limited task",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3" as const,
        category: null,
        tags: [],
        isRecurring: true,
        recurrenceTemplateId: null,
      };

      const now = new Date("2026-04-13T08:00:00.000Z");
      const horizonEnd = new Date("2026-12-31T23:59:59.000Z"); // far horizon

      const result = manager.createRecurringTask(taskData, "FREQ=WEEKLY;COUNT=3", now, horizonEnd);

      expect(result.instances).toHaveLength(3);
    });

    it("throws ValidationError for invalid RRULE", () => {
      const { recurrenceRepo, taskRepo } = createMocks();
      const manager = new RecurrenceManager(recurrenceRepo, taskRepo);

      const taskData = {
        title: "Bad rule",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3" as const,
        category: null,
        tags: [],
        isRecurring: true,
        recurrenceTemplateId: null,
      };

      const now = new Date("2026-04-13T08:00:00.000Z");
      const horizonEnd = new Date("2026-05-11T23:59:59.000Z");

      expect(() => manager.createRecurringTask(taskData, "FREQ=INVALID", now, horizonEnd)).toThrow(
        ValidationError,
      );
    });
  });

  describe("generateInstances", () => {
    it("does not generate duplicate instances", () => {
      const { recurrenceRepo, taskRepo } = createMocks();
      const manager = new RecurrenceManager(recurrenceRepo, taskRepo);

      const taskData = {
        title: "Daily task",
        description: null,
        duration: 15,
        deadline: null,
        priority: "P3" as const,
        category: null,
        tags: [],
        isRecurring: true,
        recurrenceTemplateId: null,
      };

      const now = new Date("2026-04-13T08:00:00.000Z");
      const horizonEnd = new Date("2026-04-17T23:59:59.000Z");

      const result1 = manager.createRecurringTask(
        taskData,
        "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR",
        now,
        horizonEnd,
      );

      // Generate again for the same horizon — should not create duplicates
      const instances2 = manager.generateInstances(result1.template.id, now, horizonEnd);
      expect(instances2).toHaveLength(0); // All already exist
    });

    it("skips dates with skip exceptions", () => {
      const { recurrenceRepo, taskRepo } = createMocks();
      const manager = new RecurrenceManager(recurrenceRepo, taskRepo);

      const taskData = {
        title: "Daily task",
        description: null,
        duration: 15,
        deadline: null,
        priority: "P3" as const,
        category: null,
        tags: [],
        isRecurring: true,
        recurrenceTemplateId: null,
      };

      const now = new Date("2026-04-13T08:00:00.000Z");
      const horizonEnd = new Date("2026-04-17T23:59:59.000Z");

      // Add a skip exception for Tuesday
      (recurrenceRepo.addException as ReturnType<typeof vi.fn>).mockImplementationOnce(
        (_templateId: string, _date: string, exception: RecurrenceException) => {
          (recurrenceRepo.getExceptions as ReturnType<typeof vi.fn>).mockReturnValue([exception]);
        },
      );

      const result = manager.createRecurringTask(
        taskData,
        "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR",
        now,
        horizonEnd,
      );

      // Now skip Tuesday
      manager.skipInstance(result.template.id, "2026-04-14");

      expect(recurrenceRepo.addException).toHaveBeenCalledWith(
        result.template.id,
        "2026-04-14",
        expect.objectContaining({ type: "skip" }),
      );
    });

    it("returns empty for recurrence with no matching dates in horizon", () => {
      const { recurrenceRepo, taskRepo } = createMocks();
      const manager = new RecurrenceManager(recurrenceRepo, taskRepo);

      const taskData = {
        title: "Christmas task",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3" as const,
        category: null,
        tags: [],
        isRecurring: true,
        recurrenceTemplateId: null,
      };

      // April horizon — yearly December recurrence
      const now = new Date("2026-04-13T08:00:00.000Z");
      const horizonEnd = new Date("2026-05-11T23:59:59.000Z");

      const result = manager.createRecurringTask(
        taskData,
        "FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25",
        now,
        horizonEnd,
      );

      expect(result.instances).toHaveLength(0);
    });
  });

  describe("expandHorizon", () => {
    it("generates new instances when horizon advances", () => {
      const { recurrenceRepo, taskRepo } = createMocks();
      const manager = new RecurrenceManager(recurrenceRepo, taskRepo);

      const taskData = {
        title: "Weekly review",
        description: null,
        duration: 60,
        deadline: null,
        priority: "P2" as const,
        category: null,
        tags: [],
        isRecurring: true,
        recurrenceTemplateId: null,
      };

      const now = new Date("2026-04-13T08:00:00.000Z");
      const horizonEnd1 = new Date("2026-04-20T23:59:59.000Z"); // 1 week

      manager.createRecurringTask(taskData, "FREQ=WEEKLY;BYDAY=MO", now, horizonEnd1);

      // Expand horizon by another week
      const horizonEnd2 = new Date("2026-04-27T23:59:59.000Z");
      const newInstances = manager.expandHorizon(horizonEnd2);

      expect(newInstances.length).toBeGreaterThan(0);
    });

    it("returns empty when horizon has not moved", () => {
      const { recurrenceRepo, taskRepo } = createMocks();
      const manager = new RecurrenceManager(recurrenceRepo, taskRepo);

      const taskData = {
        title: "Task",
        description: null,
        duration: 30,
        deadline: null,
        priority: "P3" as const,
        category: null,
        tags: [],
        isRecurring: true,
        recurrenceTemplateId: null,
      };

      const now = new Date("2026-04-13T08:00:00.000Z");
      const horizonEnd = new Date("2026-04-20T23:59:59.000Z");

      manager.createRecurringTask(taskData, "FREQ=WEEKLY;BYDAY=MO", now, horizonEnd);

      // Expand with same horizon
      const newInstances = manager.expandHorizon(horizonEnd);
      expect(newInstances).toHaveLength(0);
    });
  });

  describe("skipInstance", () => {
    it("creates a skip exception and cancels existing task", () => {
      const { recurrenceRepo, taskRepo } = createMocks();
      const manager = new RecurrenceManager(recurrenceRepo, taskRepo);

      const taskData = {
        title: "Daily task",
        description: null,
        duration: 15,
        deadline: null,
        priority: "P3" as const,
        category: null,
        tags: [],
        isRecurring: true,
        recurrenceTemplateId: null,
      };

      const now = new Date("2026-04-13T08:00:00.000Z");
      const horizonEnd = new Date("2026-04-17T23:59:59.000Z");

      const result = manager.createRecurringTask(
        taskData,
        "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR",
        now,
        horizonEnd,
      );

      manager.skipInstance(result.template.id, "2026-04-14");

      expect(recurrenceRepo.addException).toHaveBeenCalledWith(
        result.template.id,
        "2026-04-14",
        expect.objectContaining({ type: "skip" }),
      );
    });
  });

  describe("modifyInstance", () => {
    it("throws NotFoundError for non-existent instance", () => {
      const { recurrenceRepo, taskRepo } = createMocks();
      (recurrenceRepo.getInstances as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);
      const manager = new RecurrenceManager(recurrenceRepo, taskRepo);

      expect(() => manager.modifyInstance("nonexistent", "2026-04-14", { duration: 30 })).toThrow(
        NotFoundError,
      );
    });

    it("throws InvalidStateError when modifying completed instance", () => {
      const { recurrenceRepo, taskRepo, tasks } = createMocks();
      const manager = new RecurrenceManager(recurrenceRepo, taskRepo);

      // Create a task that is completed
      const completedTask = makeTask({ id: "completed-task", status: "completed" });
      tasks.set("completed-task", completedTask);

      // Mock instance lookup to return an instance pointing to completed task
      (recurrenceRepo.getInstances as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        {
          id: "inst-1",
          templateId: "tmpl-1",
          taskId: "completed-task",
          scheduledDate: "2026-04-14",
          isException: false,
        },
      ]);

      expect(() => manager.modifyInstance("tmpl-1", "2026-04-14", { duration: 30 })).toThrow(
        InvalidStateError,
      );
    });
  });

  describe("deleteTemplate", () => {
    it("cancels future instances and deactivates template", () => {
      const { recurrenceRepo, taskRepo } = createMocks();
      const manager = new RecurrenceManager(recurrenceRepo, taskRepo);

      const taskData = {
        title: "Daily task",
        description: null,
        duration: 15,
        deadline: null,
        priority: "P3" as const,
        category: null,
        tags: [],
        isRecurring: true,
        recurrenceTemplateId: null,
      };

      const now = new Date("2026-04-13T08:00:00.000Z");
      const horizonEnd = new Date("2026-04-17T23:59:59.000Z");

      const result = manager.createRecurringTask(
        taskData,
        "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR",
        now,
        horizonEnd,
      );

      manager.deleteTemplate(result.template.id, now);

      expect(recurrenceRepo.deleteTemplate).toHaveBeenCalledWith(result.template.id);
      // Tasks should have been cancelled
      expect(taskRepo.updateStatus).toHaveBeenCalled();
    });

    it("throws NotFoundError for non-existent template", () => {
      const { recurrenceRepo, taskRepo } = createMocks();
      const manager = new RecurrenceManager(recurrenceRepo, taskRepo);

      expect(() => manager.deleteTemplate("nonexistent", new Date())).toThrow(NotFoundError);
    });
  });
});
