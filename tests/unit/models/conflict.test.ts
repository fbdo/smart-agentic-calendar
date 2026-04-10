import { describe, it, expect } from "vitest";
import {
  type Conflict,
  type AtRiskTask,
  type ConflictReason,
} from "../../../src/models/conflict.js";

describe("Conflict types", () => {
  it("allows constructing a Conflict", () => {
    const conflict: Conflict = {
      taskId: "task-1",
      reason: "insufficient_time",
      deadline: "2026-01-20T17:00:00Z",
      requiredMinutes: 120,
      availableMinutes: 60,
      competingTaskIds: ["task-2", "task-3"],
      suggestions: [{ taskId: "task-2", currentPriority: "P3", freedMinutes: 45 }],
    };
    expect(conflict.reason).toBe("insufficient_time");
    expect(conflict.suggestions).toHaveLength(1);
  });

  it("supports all conflict reasons", () => {
    const reasons: ConflictReason[] = ["insufficient_time", "dependency_chain", "overdue"];
    expect(reasons).toHaveLength(3);
  });

  it("allows constructing an AtRiskTask", () => {
    const atRisk: AtRiskTask = {
      taskId: "task-1",
      reason: "Not enough time before deadline",
    };
    expect(atRisk.taskId).toBe("task-1");
  });
});
