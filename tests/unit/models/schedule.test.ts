import { describe, it, expect } from "vitest";
import { type TimeBlock, type ScheduleStatus } from "../../../src/models/schedule.js";

describe("Schedule types", () => {
  it("allows constructing a TimeBlock", () => {
    const block: TimeBlock = {
      id: "tb-1",
      taskId: "task-1",
      startTime: "2026-01-15T09:00:00Z",
      endTime: "2026-01-15T10:00:00Z",
      date: "2026-01-15",
      blockIndex: 0,
      totalBlocks: 1,
    };
    expect(block.blockIndex).toBe(0);
    expect(block.totalBlocks).toBe(1);
  });

  it("allows split task blocks", () => {
    const blocks: TimeBlock[] = [
      {
        id: "tb-1",
        taskId: "task-1",
        startTime: "2026-01-15T09:00:00Z",
        endTime: "2026-01-15T09:30:00Z",
        date: "2026-01-15",
        blockIndex: 0,
        totalBlocks: 2,
      },
      {
        id: "tb-2",
        taskId: "task-1",
        startTime: "2026-01-15T14:00:00Z",
        endTime: "2026-01-15T14:30:00Z",
        date: "2026-01-15",
        blockIndex: 1,
        totalBlocks: 2,
      },
    ];
    expect(blocks).toHaveLength(2);
    expect(blocks[0].totalBlocks).toBe(2);
  });

  it("defines valid ScheduleStatus values", () => {
    const statuses: ScheduleStatus[] = ["up_to_date", "replan_in_progress"];
    expect(statuses).toHaveLength(2);
  });
});
