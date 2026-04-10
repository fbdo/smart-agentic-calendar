import type { Task } from "../models/task.js";
import type { DependencyEdge } from "../models/dependency.js";
import { CircularDependencyError, ValidationError } from "../models/errors.js";

const PRIORITY_RANK: Record<string, number> = {
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
};

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

export class DependencyResolver {
  validateNoCycles(taskId: string, dependsOnId: string, existingDeps: DependencyEdge[]): boolean {
    if (taskId === dependsOnId) {
      throw new ValidationError("a task cannot depend on itself");
    }

    // Check: can we reach taskId starting from dependsOnId via existing edges?
    // Edges go: dependsOnId → taskId (dependsOn direction)
    // We need to traverse: from dependsOnId, follow "who depends on this node" edges
    // If we can reach taskId, then adding taskId→dependsOnId creates a cycle.
    //
    // Actually, rethink: edges represent "taskId depends on dependsOnId".
    // To check if adding (taskId depends on dependsOnId) creates a cycle,
    // we need to check: can we reach dependsOnId from taskId via existing dependency chains?
    // i.e., does taskId have a path TO dependsOnId through existing edges?
    // An edge { taskId: X, dependsOnId: Y } means X depends on Y, so X comes after Y.
    // Following "depends on" from taskId: taskId → its dependencies → their dependencies → ...
    // If we find dependsOnId in that chain, adding dependsOnId as another dependency of taskId
    // doesn't create a cycle (it's just adding a redundant path).
    //
    // The cycle occurs if dependsOnId can reach taskId via "depends on" edges.
    // i.e., dependsOnId depends on ... depends on taskId. Then adding taskId depends on dependsOnId
    // closes the loop.
    //
    // Build reverse lookup: for each node, what does it depend on?
    const dependsOnMap = new Map<string, string[]>();
    for (const edge of existingDeps) {
      const deps = dependsOnMap.get(edge.taskId) ?? [];
      deps.push(edge.dependsOnId);
      dependsOnMap.set(edge.taskId, deps);
    }

    // DFS from dependsOnId, following "dependsOn" edges, looking for taskId
    const visited = new Set<string>();
    const stack = [dependsOnId];
    const path: string[] = [];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === taskId) {
        throw new CircularDependencyError([taskId, ...path, current]);
      }
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);
      path.push(current);
      const neighbors = dependsOnMap.get(current) ?? [];
      for (const neighbor of neighbors) {
        stack.push(neighbor);
      }
    }

    return true;
  }

  topologicalSort(tasks: Task[], dependencies: DependencyEdge[]): Task[] {
    if (tasks.length === 0) return [];

    const taskMap = new Map<string, Task>();
    for (const task of tasks) {
      taskMap.set(task.id, task);
    }

    // Build in-degree count and adjacency (dependsOnId → [taskIds that depend on it])
    const inDegree = new Map<string, number>();
    const adj = buildAdjacencyMap(dependencies);

    for (const task of tasks) {
      inDegree.set(task.id, 0);
    }
    for (const edge of dependencies) {
      if (taskMap.has(edge.taskId)) {
        inDegree.set(edge.taskId, (inDegree.get(edge.taskId) ?? 0) + 1);
      }
    }

    // Collect zero-in-degree tasks, sorted by priority/deadline/duration
    const queue: Task[] = [];
    for (const task of tasks) {
      if ((inDegree.get(task.id) ?? 0) === 0) {
        queue.push(task);
      }
    }
    queue.sort((a, b) => {
      const [ap, ad, adur] = taskSortKey(a);
      const [bp, bd, bdur] = taskSortKey(b);
      return ap - bp || ad - bd || adur - bdur;
    });

    const result: Task[] = [];

    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);

      const dependents = adj.get(node.id) ?? [];
      const newlyReady: Task[] = [];

      for (const depId of dependents) {
        if (!taskMap.has(depId)) continue;
        const newDegree = (inDegree.get(depId) ?? 1) - 1;
        inDegree.set(depId, newDegree);
        if (newDegree === 0) {
          newlyReady.push(taskMap.get(depId)!);
        }
      }

      // Insert newly ready tasks in sorted order
      newlyReady.sort((a, b) => {
        const [ap, ad, adur] = taskSortKey(a);
        const [bp, bd, bdur] = taskSortKey(b);
        return ap - bp || ad - bd || adur - bdur;
      });

      for (const task of newlyReady) {
        // Insert into queue maintaining sort order
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
    }

    if (result.length < tasks.length) {
      const remainingIds = tasks.filter((t) => !result.includes(t)).map((t) => t.id);
      throw new CircularDependencyError(remainingIds);
    }

    return result;
  }

  getBlockedTasks(tasks: Task[], dependencies: DependencyEdge[]): Task[] {
    const taskMap = new Map<string, Task>();
    for (const task of tasks) {
      taskMap.set(task.id, task);
    }

    const blocked: Task[] = [];

    for (const task of tasks) {
      const deps = dependencies.filter((d) => d.taskId === task.id);
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
