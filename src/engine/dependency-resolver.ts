import type { Task } from "../models/task.js";
import type { DependencyEdge } from "../models/dependency.js";
import type { Logger } from "../common/logger.js";
import { CircularDependencyError, ValidationError } from "../models/errors.js";
import { PRIORITY_RANK } from "../common/constants.js";

function buildAdjacencyMap(edges: DependencyEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    const deps = adj.get(edge.dependsOnId) ?? [];
    deps.push(edge.taskId);
    adj.set(edge.dependsOnId, deps);
  }
  return adj;
}

function taskSortKey(task: Task): [number, number, number] {
  const priority = PRIORITY_RANK[task.priority] ?? 99;
  const deadline = task.deadline ? new Date(task.deadline).getTime() : Number.MAX_SAFE_INTEGER;
  return [priority, deadline, task.duration];
}

function compareTasks(a: Task, b: Task): number {
  const [ap, ad, adur] = taskSortKey(a);
  const [bp, bd, bdur] = taskSortKey(b);
  return ap - bp || ad - bd || adur - bdur;
}

function buildInDegreeAndQueue(
  tasks: Task[],
  dependencies: DependencyEdge[],
  taskMap: Map<string, Task>,
): { inDegree: Map<string, number>; queue: Task[] } {
  const inDegree = new Map<string, number>();
  for (const task of tasks) {
    inDegree.set(task.id, 0);
  }
  for (const edge of dependencies) {
    if (taskMap.has(edge.taskId)) {
      inDegree.set(edge.taskId, (inDegree.get(edge.taskId) ?? 0) + 1);
    }
  }

  const queue: Task[] = [];
  for (const task of tasks) {
    if ((inDegree.get(task.id) ?? 0) === 0) {
      queue.push(task);
    }
  }
  queue.sort(compareTasks);

  return { inDegree, queue };
}

function insertSorted(queue: Task[], task: Task): void {
  const key = taskSortKey(task);
  let insertIdx = queue.length;
  for (let i = 0; i < queue.length; i++) {
    const qKey = taskSortKey(queue[i]);
    if (
      key[0] < qKey[0] ||
      (key[0] === qKey[0] && key[1] < qKey[1]) ||
      (key[0] === qKey[0] && key[1] === qKey[1] && key[2] < qKey[2])
    ) {
      insertIdx = i;
      break;
    }
  }
  queue.splice(insertIdx, 0, task);
}

export class DependencyResolver {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  validateNoCycles(taskId: string, dependsOnId: string, existingDeps: DependencyEdge[]): boolean {
    if (taskId === dependsOnId) {
      throw new ValidationError("a task cannot depend on itself");
    }

    // A cycle would form if dependsOnId already (transitively) depends on taskId,
    // since adding taskId → dependsOnId would close the loop. DFS from dependsOnId
    // following "depends on" edges; if we reach taskId, reject.
    const dependsOnMap = new Map<string, string[]>();
    for (const edge of existingDeps) {
      const deps = dependsOnMap.get(edge.taskId) ?? [];
      deps.push(edge.dependsOnId);
      dependsOnMap.set(edge.taskId, deps);
    }

    // DFS from dependsOnId, following "dependsOn" edges, looking for taskId
    const visited = new Set<string>();
    const parent = new Map<string, string | null>();
    const stack = [dependsOnId];
    parent.set(dependsOnId, null);

    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (current === taskId) {
        const cyclePath = this.reconstructCyclePath(current, parent, taskId);
        this.logger.warning("dependencies", { event: "cycle_detected", cycle: cyclePath });
        throw new CircularDependencyError(cyclePath);
      }
      if (visited.has(current)) continue;
      visited.add(current);
      for (const neighbor of dependsOnMap.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          parent.set(neighbor, current);
          stack.push(neighbor);
        }
      }
    }

    return true;
  }

  private reconstructCyclePath(
    current: string,
    parent: Map<string, string | null>,
    taskId: string,
  ): string[] {
    const path: string[] = [current];
    let node = parent.get(current) ?? null;
    while (node != null) {
      path.push(node);
      node = parent.get(node) ?? null;
    }
    path.push(taskId);
    path.reverse();
    return path;
  }

  topologicalSort(tasks: Task[], dependencies: DependencyEdge[]): Task[] {
    if (tasks.length === 0) return [];

    const taskMap = new Map<string, Task>();
    for (const task of tasks) {
      taskMap.set(task.id, task);
    }

    const adj = buildAdjacencyMap(dependencies);
    const { inDegree, queue } = buildInDegreeAndQueue(tasks, dependencies, taskMap);

    const result: Task[] = [];

    while (queue.length > 0) {
      const node = queue.shift() as Task;
      result.push(node);

      for (const depId of adj.get(node.id) ?? []) {
        const depTask = taskMap.get(depId);
        if (!depTask) continue;
        const newDegree = (inDegree.get(depId) ?? 1) - 1;
        inDegree.set(depId, newDegree);
        if (newDegree === 0) {
          insertSorted(queue, depTask);
        }
      }
    }

    if (result.length < tasks.length) {
      const remainingIds = tasks.filter((t) => !result.includes(t)).map((t) => t.id);
      this.logger.warning("dependencies", { event: "cycle_detected", cycle: remainingIds });
      throw new CircularDependencyError(remainingIds);
    }

    return result;
  }

  getBlockedTasks(tasks: Task[], dependencies: DependencyEdge[]): Task[] {
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const depsByTaskId = new Map<string, DependencyEdge[]>();
    for (const edge of dependencies) {
      const list = depsByTaskId.get(edge.taskId);
      if (list) list.push(edge);
      else depsByTaskId.set(edge.taskId, [edge]);
    }

    const blocked: Task[] = [];
    for (const task of tasks) {
      const deps = depsByTaskId.get(task.id);
      if (!deps) continue;
      for (const dep of deps) {
        const depTask = taskMap.get(dep.dependsOnId);
        if (depTask && depTask.status !== "completed") {
          blocked.push(task);
          break;
        }
      }
    }
    return blocked;
  }
}
