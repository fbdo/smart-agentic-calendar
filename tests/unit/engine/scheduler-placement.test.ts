import { describe, it, expect } from "vitest";
import { placeTask, type AvailableSlot } from "../../../src/engine/scheduler.js";
import type { Task } from "../../../src/models/task.js";
import type { FocusTime } from "../../../src/models/config.js";

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

function makeSlot(date: string, startHH: string, endHH: string): AvailableSlot {
  const startTime = `${date}T${startHH}:00.000Z`;
  const endTime = `${date}T${endHH}:00.000Z`;
  const durationMinutes = (new Date(endTime).getTime() - new Date(startTime).getTime()) / 60_000;
  return { date, startTime, endTime, durationMinutes };
}

const noFocus: FocusTime = { blocks: [], minimumBlockMinutes: 60 };
const now = new Date("2026-04-10T08:00:00.000Z");

describe("placeTask", () => {
  it("places task in a single slot when it fits", () => {
    const task = makeTask({ id: "t1", duration: 60 });
    const slots = [makeSlot("2026-04-13", "09:00", "17:00")];
    const result = placeTask(task, slots, [], now, noFocus, null, 15, 30, 60);
    expect(result.blocks).toHaveLength(1);
    expect(result.unscheduledMinutes).toBe(0);
    expect(result.blocks[0].taskId).toBe("t1");
    expect(result.blocks[0].blockIndex).toBe(0);
    expect(result.blocks[0].totalBlocks).toBe(1);
  });

  it("splits task across two slots when it exceeds first slot", () => {
    const task = makeTask({ id: "t1", duration: 180 }); // 3 hours
    const slots = [
      makeSlot("2026-04-13", "09:00", "11:00"), // 2h
      makeSlot("2026-04-13", "13:00", "17:00"), // 4h
    ];
    const result = placeTask(task, slots, [], now, noFocus, null, 15, 30, 60);
    expect(result.blocks).toHaveLength(2);
    expect(result.unscheduledMinutes).toBe(0);
    expect(result.blocks[0].totalBlocks).toBe(2);
    expect(result.blocks[1].totalBlocks).toBe(2);
    expect(result.blocks[0].blockIndex).toBe(0);
    expect(result.blocks[1].blockIndex).toBe(1);
  });

  it("skips slots below minimum block minutes", () => {
    const task = makeTask({ id: "t1", duration: 60 });
    const slots = [
      makeSlot("2026-04-13", "09:00", "09:20"), // 20 min — below 30 min minimum
      makeSlot("2026-04-13", "10:00", "12:00"), // 120 min
    ];
    const result = placeTask(task, slots, [], now, noFocus, null, 15, 30, 60);
    expect(result.blocks).toHaveLength(1);
    // Should use the 10:00-12:00 slot, not the 09:00-09:20 one
    expect(result.blocks[0].startTime).toContain("10:00");
  });

  it("adjusts trailing block to prevent micro-blocks", () => {
    const task = makeTask({ id: "t1", duration: 100 }); // 100 min
    const slots = [
      makeSlot("2026-04-13", "09:00", "10:30"), // 90 min
      makeSlot("2026-04-13", "11:00", "13:00"), // 120 min
    ];
    // Without adjustment: block1=90min, remaining=10min (< 30min minimum)
    // With adjustment: block1 should be 70min (leaving 30min for block2), or take all 100
    const result = placeTask(task, slots, [], now, noFocus, null, 15, 30, 60);
    expect(result.unscheduledMinutes).toBe(0);
    for (const block of result.blocks) {
      // Each block should be >= minimumBlockMinutes (30) or be the only block
      if (result.blocks.length > 1) {
        const duration =
          (new Date(block.endTime).getTime() - new Date(block.startTime).getTime()) / 60_000;
        expect(duration).toBeGreaterThanOrEqual(30);
      }
    }
  });

  it("marks task partially schedulable when not enough slot space", () => {
    const task = makeTask({ id: "t1", duration: 300 }); // 5 hours
    const slots = [makeSlot("2026-04-13", "09:00", "11:00")]; // 2 hours only
    const result = placeTask(task, slots, [], now, noFocus, null, 15, 30, 60);
    expect(result.blocks).toHaveLength(1);
    expect(result.unscheduledMinutes).toBe(180); // 300 - 120 = 180
  });

  it("returns no blocks when no valid slots exist", () => {
    const task = makeTask({ id: "t1", duration: 60 });
    const result = placeTask(task, [], [], now, noFocus, null, 15, 30, 60);
    expect(result.blocks).toHaveLength(0);
    expect(result.unscheduledMinutes).toBe(60);
  });

  it("sets correct blockIndex and totalBlocks for multi-block tasks", () => {
    const task = makeTask({ id: "t1", duration: 180 });
    const slots = [
      makeSlot("2026-04-13", "09:00", "10:00"), // 60 min
      makeSlot("2026-04-13", "11:00", "12:00"), // 60 min
      makeSlot("2026-04-13", "13:00", "14:00"), // 60 min
    ];
    const result = placeTask(task, slots, [], now, noFocus, null, 15, 30, 60);
    expect(result.blocks).toHaveLength(3);
    expect(result.blocks[0].blockIndex).toBe(0);
    expect(result.blocks[1].blockIndex).toBe(1);
    expect(result.blocks[2].blockIndex).toBe(2);
    for (const block of result.blocks) {
      expect(block.totalBlocks).toBe(3);
    }
  });
});
