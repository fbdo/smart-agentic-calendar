import { describe, it, expect, vi } from "vitest";
import { TaskTools } from "../../../src/mcp/tools/task-tools.js";
import type { TaskRepository } from "../../../src/storage/task-repository.js";
import type { RecurrenceManager } from "../../../src/engine/recurrence-manager.js";
import type { DependencyResolver } from "../../../src/engine/dependency-resolver.js";
import type { ReplanCoordinator } from "../../../src/engine/replan-coordinator.js";
import type { Task } from "../../../src/models/task.js";
import {
  NotFoundError,
  CircularDependencyError,
  InvalidStateError,
} from "../../../src/models/errors.js";
import { createNoOpLogger } from "../../../src/common/logger.js";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Test Task",
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
  const taskRepo = {
    create: vi.fn().mockImplementation((input) => makeTask({ ...input, id: "new-task-1" })),
    findById: vi.fn().mockReturnValue(makeTask()),
    findAll: vi.fn().mockReturnValue([makeTask()]),
    update: vi.fn().mockImplementation((_id, updates) => makeTask(updates)),
    updateStatus: vi.fn().mockImplementation((id, status) => makeTask({ id, status })),
    addDependency: vi.fn(),
    removeDependency: vi.fn(),
    getDependencies: vi.fn().mockReturnValue([]),
    getDependents: vi.fn().mockReturnValue([]),
    getAllDependencyEdges: vi.fn().mockReturnValue([]),
    recordActualDuration: vi.fn(),
  } as unknown as TaskRepository;

  const recurrenceManager = {
    createRecurringTask: vi.fn().mockReturnValue({
      template: { id: "tmpl-1" },
      instances: [
        { id: "inst-1", taskId: "rtask-1", scheduledDate: "2026-04-11" },
        { id: "inst-2", taskId: "rtask-2", scheduledDate: "2026-04-12" },
      ],
    }),
    deleteTemplate: vi.fn(),
  } as unknown as RecurrenceManager;

  const dependencyResolver = {
    validateNoCycles: vi.fn().mockReturnValue(true),
  } as unknown as DependencyResolver;

  const replanCoordinator = {
    requestReplan: vi.fn(),
  } as unknown as ReplanCoordinator;

  const tools = new TaskTools(
    taskRepo,
    recurrenceManager,
    dependencyResolver,
    replanCoordinator,
    createNoOpLogger(),
  );

  return { tools, taskRepo, recurrenceManager, dependencyResolver, replanCoordinator };
}

describe("TaskTools", () => {
  describe("createTask", () => {
    it("creates task via taskRepo.create, triggers requestReplan, returns mapped output", () => {
      const { tools, taskRepo, replanCoordinator } = createMocks();
      const result = tools.createTask({
        title: "New Task",
        estimated_duration: 60,
        priority: "P1",
      });

      expect(taskRepo.create).toHaveBeenCalled();
      expect(replanCoordinator.requestReplan).toHaveBeenCalled();
      expect(result.task.title).toBe("New Task");
      expect(result.task.estimated_duration).toBe(60);
    });

    it("with recurrence_rule: delegates to recurrenceManager, returns RecurringTaskOutput", () => {
      const { tools, recurrenceManager, replanCoordinator } = createMocks();
      const result = tools.createTask({
        title: "Daily Task",
        estimated_duration: 30,
        recurrence_rule: "FREQ=DAILY",
      });

      expect(recurrenceManager.createRecurringTask).toHaveBeenCalled();
      expect(replanCoordinator.requestReplan).toHaveBeenCalled();
      expect(result.template_id).toBe("tmpl-1");
      expect(result.instances).toHaveLength(2);
    });

    it("with blocked_by: validates deps exist, calls validateNoCycles, adds dependencies", () => {
      const { tools, taskRepo, dependencyResolver } = createMocks();
      (taskRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(makeTask({ id: "dep-1" }));

      tools.createTask({
        title: "Task with deps",
        estimated_duration: 30,
        blocked_by: ["dep-1"],
      });

      expect(dependencyResolver.validateNoCycles).toHaveBeenCalled();
      expect(taskRepo.addDependency).toHaveBeenCalled();
    });

    it("with blocked_by containing circular dep: throws CircularDependencyError", () => {
      const { tools, dependencyResolver } = createMocks();
      (dependencyResolver.validateNoCycles as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new CircularDependencyError(["a", "b", "a"]);
      });

      expect(() =>
        tools.createTask({
          title: "Circular",
          estimated_duration: 30,
          blocked_by: ["dep-1"],
        }),
      ).toThrow(CircularDependencyError);
    });

    it("with blocked_by referencing non-existent task: throws NotFoundError", () => {
      const { tools, taskRepo } = createMocks();
      // First call creates task, second call for dep lookup returns undefined
      let callCount = 0;
      (taskRepo.findById as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        if (callCount === 1) return undefined; // dep not found
        return makeTask();
      });

      expect(() =>
        tools.createTask({
          title: "Bad deps",
          estimated_duration: 30,
          blocked_by: ["nonexistent"],
        }),
      ).toThrow(NotFoundError);
    });
  });

  describe("updateTask", () => {
    it("updates task fields via taskRepo.update, triggers requestReplan", () => {
      const { tools, taskRepo, replanCoordinator } = createMocks();
      const result = tools.updateTask({
        task_id: "task-1",
        title: "Updated",
      });

      expect(taskRepo.update).toHaveBeenCalledWith("task-1", { title: "Updated" });
      expect(replanCoordinator.requestReplan).toHaveBeenCalled();
      expect(result.task).toBeDefined();
    });

    it("task not found: throws NotFoundError", () => {
      const { tools, taskRepo } = createMocks();
      (taskRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      expect(() => tools.updateTask({ task_id: "missing", title: "X" })).toThrow(NotFoundError);
    });

    it("with blocked_by: uses single query for all dependency edges instead of N+1", () => {
      const { tools, taskRepo } = createMocks();
      const tasks = [makeTask({ id: "t-1" }), makeTask({ id: "t-2" }), makeTask({ id: "t-3" })];
      (taskRepo.findAll as ReturnType<typeof vi.fn>).mockReturnValue(tasks);
      (taskRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(makeTask());
      (taskRepo.getDependencies as ReturnType<typeof vi.fn>).mockReturnValue([]);
      (taskRepo.getAllDependencyEdges as ReturnType<typeof vi.fn>).mockReturnValue([]);

      tools.updateTask({ task_id: "t-1", blocked_by: ["t-2"] });

      // Should use getAllDependencyEdges (single query) instead of getDependencies per task
      expect(taskRepo.getAllDependencyEdges).toHaveBeenCalledTimes(1);
    });

    it("with blocked_by: replaces dependencies, validates no cycles", () => {
      const { tools, taskRepo, dependencyResolver } = createMocks();
      (taskRepo.getDependencies as ReturnType<typeof vi.fn>).mockReturnValue([
        makeTask({ id: "old-dep" }),
      ]);

      tools.updateTask({
        task_id: "task-1",
        blocked_by: ["new-dep"],
      });

      expect(taskRepo.removeDependency).toHaveBeenCalledWith("task-1", "old-dep");
      expect(dependencyResolver.validateNoCycles).toHaveBeenCalled();
      expect(taskRepo.addDependency).toHaveBeenCalledWith("task-1", "new-dep");
    });

    it("completed recurring instance: throws InvalidStateError", () => {
      const { tools, taskRepo } = createMocks();
      (taskRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        makeTask({ status: "completed", isRecurring: true }),
      );

      expect(() => tools.updateTask({ task_id: "task-1", title: "X" })).toThrow(InvalidStateError);
    });
  });

  describe("completeTask", () => {
    it("records actual_duration, updates status, unblocks dependents, triggers replan", () => {
      const { tools, taskRepo, replanCoordinator } = createMocks();
      const result = tools.completeTask({
        task_id: "task-1",
        actual_duration_minutes: 45,
      });

      expect(taskRepo.recordActualDuration).toHaveBeenCalledWith("task-1", 45);
      expect(taskRepo.updateStatus).toHaveBeenCalledWith("task-1", "completed");
      expect(replanCoordinator.requestReplan).toHaveBeenCalled();
      expect(result.task).toBeDefined();
    });

    it("default actual duration: uses task.duration when actual_duration_minutes omitted", () => {
      const { tools, taskRepo } = createMocks();
      tools.completeTask({ task_id: "task-1" });

      expect(taskRepo.recordActualDuration).toHaveBeenCalledWith("task-1", 60);
    });

    it("already completed: returns current state, no replan triggered (idempotent)", () => {
      const { tools, taskRepo, replanCoordinator } = createMocks();
      (taskRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        makeTask({ status: "completed" }),
      );

      const result = tools.completeTask({ task_id: "task-1" });

      expect(taskRepo.recordActualDuration).not.toHaveBeenCalled();
      expect(replanCoordinator.requestReplan).not.toHaveBeenCalled();
      expect(result.task.status).toBe("completed");
    });

    it("task not found: throws NotFoundError", () => {
      const { tools, taskRepo } = createMocks();
      (taskRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      expect(() => tools.completeTask({ task_id: "missing" })).toThrow(NotFoundError);
    });
  });

  describe("deleteTask", () => {
    it("updates status to cancelled, identifies dependents, triggers replan", () => {
      const { tools, taskRepo, replanCoordinator } = createMocks();
      (taskRepo.getDependents as ReturnType<typeof vi.fn>).mockReturnValue([
        makeTask({ id: "dep-1" }),
      ]);

      const result = tools.deleteTask({ task_id: "task-1" });

      expect(taskRepo.updateStatus).toHaveBeenCalledWith("task-1", "cancelled");
      expect(replanCoordinator.requestReplan).toHaveBeenCalled();
      expect(result.task_id).toBe("task-1");
      expect(result.status).toBe("cancelled");
      expect(result.affected_dependents).toEqual(["dep-1"]);
    });

    it("task not found: throws NotFoundError", () => {
      const { tools, taskRepo } = createMocks();
      (taskRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      expect(() => tools.deleteTask({ task_id: "missing" })).toThrow(NotFoundError);
    });

    it("recurring template: delegates to recurrenceManager.deleteTemplate", () => {
      const { tools, taskRepo, recurrenceManager } = createMocks();
      (taskRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(
        makeTask({ isRecurring: true, recurrenceTemplateId: "tmpl-1" }),
      );

      tools.deleteTask({ task_id: "task-1" });

      expect(recurrenceManager.deleteTemplate).toHaveBeenCalledWith("tmpl-1", expect.any(Date));
    });
  });

  describe("listTasks", () => {
    it("no filters: calls taskRepo.findAll with excludeStatus cancelled", () => {
      const { tools, taskRepo } = createMocks();
      tools.listTasks({});

      // Should add default status exclusion
      expect(taskRepo.findAll).toHaveBeenCalled();
    });

    it("with status filter: passes through, no default exclusion", () => {
      const { tools, taskRepo } = createMocks();
      tools.listTasks({ status: "completed" });

      const call = (taskRepo.findAll as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.status).toBe("completed");
    });

    it("empty results: returns empty array with count 0", () => {
      const { tools, taskRepo } = createMocks();
      (taskRepo.findAll as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const result = tools.listTasks({});
      expect(result.tasks).toEqual([]);
      expect(result.count).toBe(0);
    });

    it("no replan triggered", () => {
      const { tools, replanCoordinator } = createMocks();
      tools.listTasks({});
      expect(replanCoordinator.requestReplan).not.toHaveBeenCalled();
    });
  });
});
