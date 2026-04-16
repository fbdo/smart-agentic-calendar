import { describe, it, expect } from "vitest";
import { DependencyResolver } from "../../../src/engine/dependency-resolver.js";
import { createNoOpLogger } from "../../../src/common/logger.js";
import type { Task } from "../../../src/models/task.js";
import type { DependencyEdge } from "../../../src/models/dependency.js";
import { CircularDependencyError, ValidationError } from "../../../src/models/errors.js";

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

describe("DependencyResolver", () => {
  const resolver = new DependencyResolver(createNoOpLogger());

  describe("validateNoCycles", () => {
    it("returns true when adding a valid dependency with no cycle", () => {
      const edges: DependencyEdge[] = [];
      expect(resolver.validateNoCycles("B", "A", edges)).toBe(true);
    });

    it("returns true for a valid chain A→B→C (adding C depends on B)", () => {
      const edges: DependencyEdge[] = [{ taskId: "B", dependsOnId: "A" }];
      expect(resolver.validateNoCycles("C", "B", edges)).toBe(true);
    });

    it("throws CircularDependencyError for direct cycle A→B→A", () => {
      const edges: DependencyEdge[] = [{ taskId: "B", dependsOnId: "A" }];
      expect(() => resolver.validateNoCycles("A", "B", edges)).toThrow(CircularDependencyError);
    });

    it("throws CircularDependencyError for indirect cycle A→B→C→A", () => {
      const edges: DependencyEdge[] = [
        { taskId: "B", dependsOnId: "A" },
        { taskId: "C", dependsOnId: "B" },
      ];
      expect(() => resolver.validateNoCycles("A", "C", edges)).toThrow(CircularDependencyError);
    });

    it("throws ValidationError for self-dependency", () => {
      expect(() => resolver.validateNoCycles("A", "A", [])).toThrow(ValidationError);
    });

    it("returns true with empty graph and no existing edges", () => {
      expect(resolver.validateNoCycles("X", "Y", [])).toBe(true);
    });

    it("returns true when graph has unrelated edges", () => {
      const edges: DependencyEdge[] = [
        { taskId: "C", dependsOnId: "D" },
        { taskId: "E", dependsOnId: "F" },
      ];
      expect(resolver.validateNoCycles("A", "B", edges)).toBe(true);
    });

    it("handles diamond graph without false positive", () => {
      // A → B, A → C, B → D, C → D — adding E depends on D is fine
      const edges: DependencyEdge[] = [
        { taskId: "B", dependsOnId: "A" },
        { taskId: "C", dependsOnId: "A" },
        { taskId: "D", dependsOnId: "B" },
        { taskId: "D", dependsOnId: "C" },
      ];
      expect(resolver.validateNoCycles("E", "D", edges)).toBe(true);
    });

    it("detects cycle in diamond graph when closing the loop", () => {
      const edges: DependencyEdge[] = [
        { taskId: "B", dependsOnId: "A" },
        { taskId: "C", dependsOnId: "A" },
        { taskId: "D", dependsOnId: "B" },
        { taskId: "D", dependsOnId: "C" },
      ];
      // Adding A depends on D would create a cycle
      expect(() => resolver.validateNoCycles("A", "D", edges)).toThrow(CircularDependencyError);
    });

    it("reports only nodes in the actual cycle path, not unrelated branches", () => {
      // dependsOnMap for W: W depends on [Z, Y]
      // dependsOnMap for Z: Z depends on [X]
      // dependsOnMap for X: X depends on [A]
      // dependsOnMap for Y: Y depends on [DEAD_END]
      // DFS from W looking for A: stack starts [W]
      // pop W → push Z, Y → stack [Z, Y]
      // pop Y → push DEAD_END → stack [Z, DEAD_END]
      // pop DEAD_END → no neighbors → stack [Z]
      // pop Z → push X → stack [X]
      // pop X → push A → found!
      // With the bug, path = [W, Y, DEAD_END, Z, X] — includes Y and DEAD_END
      // Correct path should only be: A → W → Z → X → A
      const edges: DependencyEdge[] = [
        { taskId: "W", dependsOnId: "Z" },
        { taskId: "W", dependsOnId: "Y" },
        { taskId: "Z", dependsOnId: "X" },
        { taskId: "X", dependsOnId: "A" },
        { taskId: "Y", dependsOnId: "DEAD_END" },
      ];
      try {
        resolver.validateNoCycles("A", "W", edges);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(CircularDependencyError);
        const msg = (e as CircularDependencyError).message;
        // DEAD_END and Y are on a different branch — must not appear in cycle
        expect(msg).not.toContain("DEAD_END");
        expect(msg).not.toContain("Y");
      }
    });
  });

  describe("topologicalSort", () => {
    it("returns tasks in dependency order for a linear chain", () => {
      const tasks = [
        makeTask({ id: "C", priority: "P3" }),
        makeTask({ id: "B", priority: "P3" }),
        makeTask({ id: "A", priority: "P3" }),
      ];
      const deps: DependencyEdge[] = [
        { taskId: "B", dependsOnId: "A" },
        { taskId: "C", dependsOnId: "B" },
      ];
      const result = resolver.topologicalSort(tasks, deps);
      const ids = result.map((t) => t.id);
      expect(ids.indexOf("A")).toBeLessThan(ids.indexOf("B"));
      expect(ids.indexOf("B")).toBeLessThan(ids.indexOf("C"));
    });

    it("handles diamond dependency graph", () => {
      const tasks = [
        makeTask({ id: "D" }),
        makeTask({ id: "C" }),
        makeTask({ id: "B" }),
        makeTask({ id: "A" }),
      ];
      const deps: DependencyEdge[] = [
        { taskId: "B", dependsOnId: "A" },
        { taskId: "C", dependsOnId: "A" },
        { taskId: "D", dependsOnId: "B" },
        { taskId: "D", dependsOnId: "C" },
      ];
      const result = resolver.topologicalSort(tasks, deps);
      const ids = result.map((t) => t.id);
      expect(ids.indexOf("A")).toBeLessThan(ids.indexOf("B"));
      expect(ids.indexOf("A")).toBeLessThan(ids.indexOf("C"));
      expect(ids.indexOf("B")).toBeLessThan(ids.indexOf("D"));
      expect(ids.indexOf("C")).toBeLessThan(ids.indexOf("D"));
    });

    it("handles multiple independent chains", () => {
      const tasks = [
        makeTask({ id: "A1", priority: "P1" }),
        makeTask({ id: "A2", priority: "P1" }),
        makeTask({ id: "B1", priority: "P2" }),
        makeTask({ id: "B2", priority: "P2" }),
      ];
      const deps: DependencyEdge[] = [
        { taskId: "A2", dependsOnId: "A1" },
        { taskId: "B2", dependsOnId: "B1" },
      ];
      const result = resolver.topologicalSort(tasks, deps);
      const ids = result.map((t) => t.id);
      expect(ids.indexOf("A1")).toBeLessThan(ids.indexOf("A2"));
      expect(ids.indexOf("B1")).toBeLessThan(ids.indexOf("B2"));
    });

    it("returns empty array for empty input", () => {
      expect(resolver.topologicalSort([], [])).toEqual([]);
    });

    it("returns single task when no dependencies exist", () => {
      const tasks = [makeTask({ id: "A" })];
      expect(resolver.topologicalSort(tasks, [])).toEqual(tasks);
    });

    it("returns tasks with no dependencies in priority then deadline order", () => {
      const tasks = [
        makeTask({ id: "low", priority: "P4", deadline: "2026-04-15T00:00:00.000Z" }),
        makeTask({ id: "urgent", priority: "P1", deadline: "2026-04-12T00:00:00.000Z" }),
        makeTask({ id: "medium", priority: "P2", deadline: "2026-04-14T00:00:00.000Z" }),
      ];
      const result = resolver.topologicalSort(tasks, []);
      const ids = result.map((t) => t.id);
      expect(ids).toEqual(["urgent", "medium", "low"]);
    });

    it("breaks priority ties with deadline (soonest first)", () => {
      const tasks = [
        makeTask({ id: "far", priority: "P2", deadline: "2026-04-20T00:00:00.000Z" }),
        makeTask({ id: "near", priority: "P2", deadline: "2026-04-11T00:00:00.000Z" }),
        makeTask({ id: "none", priority: "P2", deadline: null }),
      ];
      const result = resolver.topologicalSort(tasks, []);
      const ids = result.map((t) => t.id);
      expect(ids.indexOf("near")).toBeLessThan(ids.indexOf("far"));
    });

    it("breaks priority+deadline ties with duration (shortest first)", () => {
      const tasks = [
        makeTask({
          id: "long",
          priority: "P2",
          deadline: "2026-04-15T00:00:00.000Z",
          duration: 180,
        }),
        makeTask({
          id: "short",
          priority: "P2",
          deadline: "2026-04-15T00:00:00.000Z",
          duration: 30,
        }),
      ];
      const result = resolver.topologicalSort(tasks, []);
      expect(result[0].id).toBe("short");
    });
  });

  describe("getBlockedTasks", () => {
    it("returns empty when all dependencies are completed", () => {
      const tasks = [
        makeTask({ id: "A", status: "completed" }),
        makeTask({ id: "B", status: "pending" }),
      ];
      const deps: DependencyEdge[] = [{ taskId: "B", dependsOnId: "A" }];
      expect(resolver.getBlockedTasks(tasks, deps)).toEqual([]);
    });

    it("returns blocked task when dependency is not completed", () => {
      const tasks = [
        makeTask({ id: "A", status: "pending" }),
        makeTask({ id: "B", status: "pending" }),
      ];
      const deps: DependencyEdge[] = [{ taskId: "B", dependsOnId: "A" }];
      const blocked = resolver.getBlockedTasks(tasks, deps);
      expect(blocked).toHaveLength(1);
      expect(blocked[0].id).toBe("B");
    });

    it("returns empty when task has no dependencies", () => {
      const tasks = [makeTask({ id: "A", status: "pending" })];
      expect(resolver.getBlockedTasks(tasks, [])).toEqual([]);
    });

    it("detects blocked task in multi-level chain", () => {
      const tasks = [
        makeTask({ id: "A", status: "completed" }),
        makeTask({ id: "B", status: "pending" }),
        makeTask({ id: "C", status: "pending" }),
      ];
      const deps: DependencyEdge[] = [
        { taskId: "B", dependsOnId: "A" },
        { taskId: "C", dependsOnId: "B" },
      ];
      const blocked = resolver.getBlockedTasks(tasks, deps);
      // B is not blocked (A is completed), but C is blocked (B is pending)
      expect(blocked).toHaveLength(1);
      expect(blocked[0].id).toBe("C");
    });

    it("handles task with multiple dependencies where one is incomplete", () => {
      const tasks = [
        makeTask({ id: "A", status: "completed" }),
        makeTask({ id: "B", status: "pending" }),
        makeTask({ id: "C", status: "pending" }),
      ];
      const deps: DependencyEdge[] = [
        { taskId: "C", dependsOnId: "A" },
        { taskId: "C", dependsOnId: "B" },
      ];
      const blocked = resolver.getBlockedTasks(tasks, deps);
      expect(blocked).toHaveLength(1);
      expect(blocked[0].id).toBe("C");
    });
  });
});
