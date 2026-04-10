import { describe, it, expect } from "vitest";
import { DependencyResolver } from "../../src/engine/dependency-resolver.js";
import type { Task } from "../../src/models/task.js";
import type { DependencyEdge } from "../../src/models/dependency.js";

function makeTask(id: string): Task {
  return {
    id,
    title: `Task ${id}`,
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
  };
}

/**
 * Generate a random DAG with n nodes.
 * For each pair (i, j) where i < j, add edge j→i with probability p.
 */
function randomDAG(
  n: number,
  edgeProbability: number,
  seed: number,
): { tasks: Task[]; edges: DependencyEdge[] } {
  // Simple seeded PRNG (mulberry32)
  let s = seed;
  function random(): number {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const tasks: Task[] = [];
  const edges: DependencyEdge[] = [];

  for (let i = 0; i < n; i++) {
    tasks.push(makeTask(`T${i}`));
  }

  for (let j = 1; j < n; j++) {
    for (let i = 0; i < j; i++) {
      if (random() < edgeProbability) {
        edges.push({ taskId: `T${j}`, dependsOnId: `T${i}` });
      }
    }
  }

  return { tasks, edges };
}

describe("DependencyResolver PBT", () => {
  const resolver = new DependencyResolver();

  describe("topological sort property: every edge (A→B) has A before B", () => {
    const seeds = [
      42, 123, 456, 789, 1001, 2023, 3141, 5926, 7777, 9999, 11111, 22222, 33333, 44444, 55555,
      66666, 77777, 88888, 99999, 10101,
    ];

    for (const seed of seeds) {
      it(`random DAG (seed=${seed}): all dependency edges respected in output`, () => {
        const { tasks, edges } = randomDAG(15, 0.3, seed);
        const sorted = resolver.topologicalSort(tasks, edges);
        const indexMap = new Map<string, number>();
        sorted.forEach((t, i) => indexMap.set(t.id, i));

        for (const edge of edges) {
          const depIndex = indexMap.get(edge.dependsOnId);
          const taskIndex = indexMap.get(edge.taskId);
          if (depIndex !== undefined && taskIndex !== undefined) {
            expect(depIndex).toBeLessThan(taskIndex);
          }
        }
      });
    }
  });

  describe("topological sort property: output contains all input tasks", () => {
    const sizes = [0, 1, 2, 5, 10, 20, 50];

    for (const size of sizes) {
      it(`all ${size} tasks appear in output`, () => {
        const { tasks, edges } = randomDAG(size, 0.2, size * 37);
        const sorted = resolver.topologicalSort(tasks, edges);
        expect(sorted).toHaveLength(tasks.length);
        const ids = new Set(sorted.map((t) => t.id));
        for (const task of tasks) {
          expect(ids.has(task.id)).toBe(true);
        }
      });
    }
  });
});
