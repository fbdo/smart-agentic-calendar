import type { TaskRepository } from "../../storage/task-repository.js";
import type { RecurrenceManager } from "../../engine/recurrence-manager.js";
import type { DependencyResolver } from "../../engine/dependency-resolver.js";
import type { ReplanCoordinator } from "../../engine/replan-coordinator.js";
import type { DependencyEdge } from "../../models/dependency.js";
import { NotFoundError, InvalidStateError } from "../../models/errors.js";
import {
  validateCreateTaskInput,
  validateUpdateTaskInput,
  validateCompleteTaskInput,
  mapCreateTaskInput,
  mapUpdateTaskInput,
  mapListTasksInput,
  mapTaskOutput,
  type CreateTaskMcpInput,
  type UpdateTaskMcpInput,
  type CompleteTaskMcpInput,
  type DeleteTaskMcpInput,
  type ListTasksMcpInput,
} from "../validators.js";

export class TaskTools {
  private readonly taskRepo: TaskRepository;
  private readonly recurrenceManager: RecurrenceManager;
  private readonly dependencyResolver: DependencyResolver;
  private readonly replanCoordinator: ReplanCoordinator;

  constructor(
    taskRepo: TaskRepository,
    recurrenceManager: RecurrenceManager,
    dependencyResolver: DependencyResolver,
    replanCoordinator: ReplanCoordinator,
  ) {
    this.taskRepo = taskRepo;
    this.recurrenceManager = recurrenceManager;
    this.dependencyResolver = dependencyResolver;
    this.replanCoordinator = replanCoordinator;
  }

  createTask(input: CreateTaskMcpInput) {
    validateCreateTaskInput(input);
    const { taskData, recurrenceRule, blockedBy } = mapCreateTaskInput(input);

    if (recurrenceRule) {
      const now = new Date();
      const horizonEnd = new Date();
      horizonEnd.setDate(horizonEnd.getDate() + 28); // 4 weeks default
      const result = this.recurrenceManager.createRecurringTask(
        taskData,
        recurrenceRule,
        now,
        horizonEnd,
      );

      if (blockedBy) {
        this.processDependencies(result.template.id, blockedBy);
      }

      this.replanCoordinator.requestReplan();

      return {
        template_id: result.template.id,
        instances: result.instances.map((inst) => ({
          instance_id: inst.id,
          task_id: inst.taskId,
          scheduled_date: inst.scheduledDate,
        })),
        message: `Recurring task created with ${result.instances.length} instances within scheduling horizon`,
      };
    }

    const task = this.taskRepo.create(taskData);

    if (blockedBy) {
      this.processDependencies(task.id, blockedBy);
    }

    this.replanCoordinator.requestReplan();
    return { task: mapTaskOutput(task) };
  }

  updateTask(input: UpdateTaskMcpInput) {
    validateUpdateTaskInput(input);
    const { id, updates, blockedBy } = mapUpdateTaskInput(input);

    const task = this.taskRepo.findById(id);
    if (!task) {
      throw new NotFoundError("task", id);
    }

    if (task.status === "completed" && task.isRecurring) {
      throw new InvalidStateError("cannot modify completed instance");
    }

    if (blockedBy) {
      // Validate all targets exist
      for (const depId of blockedBy) {
        const depTask = this.taskRepo.findById(depId);
        if (!depTask) {
          throw new NotFoundError("dependency target task", depId);
        }
      }

      // Remove existing dependencies
      const existingDeps = this.taskRepo.getDependencies(id);
      for (const dep of existingDeps) {
        this.taskRepo.removeDependency(id, dep.id);
      }

      // Build current edges for cycle check
      const allEdges = this.buildDependencyEdges();

      // Add new dependencies with cycle validation
      for (const depId of blockedBy) {
        this.dependencyResolver.validateNoCycles(id, depId, allEdges);
        this.taskRepo.addDependency(id, depId);
      }
    }

    const hasFieldUpdates = Object.keys(updates).length > 0;
    const updated = hasFieldUpdates ? this.taskRepo.update(id, updates) : task;

    this.replanCoordinator.requestReplan();
    return { task: mapTaskOutput(updated) };
  }

  completeTask(input: CompleteTaskMcpInput) {
    validateCompleteTaskInput(input);
    const taskId = input.task_id as string; // validated above

    const task = this.taskRepo.findById(taskId);
    if (!task) {
      throw new NotFoundError("task", taskId);
    }

    // Idempotency
    if (task.status === "completed") {
      return { task: mapTaskOutput(task) };
    }

    const actualDuration = input.actual_duration_minutes ?? task.duration;
    this.taskRepo.recordActualDuration(task.id, actualDuration);
    const completed = this.taskRepo.updateStatus(task.id, "completed");

    this.replanCoordinator.requestReplan();
    return { task: mapTaskOutput(completed) };
  }

  deleteTask(input: DeleteTaskMcpInput) {
    const task = this.taskRepo.findById(input.task_id);
    if (!task) {
      throw new NotFoundError("task", input.task_id);
    }

    const dependents = this.taskRepo.getDependents(task.id);
    const affectedDependentIds = dependents.map((d) => d.id);

    this.taskRepo.updateStatus(task.id, "cancelled");

    if (task.isRecurring && task.recurrenceTemplateId) {
      this.recurrenceManager.deleteTemplate(task.recurrenceTemplateId, new Date());
    }

    this.replanCoordinator.requestReplan();

    return {
      task_id: task.id,
      status: "cancelled" as const,
      affected_dependents: affectedDependentIds,
      message:
        "Task cancelled." +
        (affectedDependentIds.length > 0
          ? ` Warning: ${affectedDependentIds.length} dependent task(s) may be affected.`
          : ""),
    };
  }

  listTasks(input: ListTasksMcpInput) {
    const filters = mapListTasksInput(input);

    // Default: exclude cancelled when no status filter
    if (!input.status) {
      const allTasks = this.taskRepo.findAll(filters);
      const filtered = allTasks.filter((t) => t.status !== "cancelled");
      return {
        tasks: filtered.map(mapTaskOutput),
        count: filtered.length,
      };
    }

    const tasks = this.taskRepo.findAll(filters);
    return {
      tasks: tasks.map(mapTaskOutput),
      count: tasks.length,
    };
  }

  private processDependencies(taskId: string, blockedBy: string[]): void {
    for (const depId of blockedBy) {
      const depTask = this.taskRepo.findById(depId);
      if (!depTask) {
        throw new NotFoundError("dependency target task", depId);
      }
    }

    const allEdges = this.buildDependencyEdges();

    for (const depId of blockedBy) {
      this.dependencyResolver.validateNoCycles(taskId, depId, allEdges);
      this.taskRepo.addDependency(taskId, depId);
    }
  }

  private buildDependencyEdges(): DependencyEdge[] {
    // Build dependency edges by iterating all tasks
    const tasks = this.taskRepo.findAll();
    const edges: DependencyEdge[] = [];
    for (const task of tasks) {
      const deps = this.taskRepo.getDependencies(task.id);
      for (const dep of deps) {
        edges.push({ taskId: task.id, dependsOnId: dep.id });
      }
    }
    return edges;
  }
}
