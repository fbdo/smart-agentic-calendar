import { describe, it, expect } from "vitest";
import {
  buildAvailabilityMap,
  deadlineProximityScore,
  priorityScore,
  focusTimeScore,
  energyScore,
  bufferScore,
  scoreSlot,
  type AvailableSlot,
  DEFAULT_WEIGHTS,
} from "../../../src/engine/scheduler.js";
import type { Task } from "../../../src/models/task.js";
import type { TimeBlock } from "../../../src/models/schedule.js";
import type { Event } from "../../../src/models/event.js";
import type { Availability, FocusTime } from "../../../src/models/config.js";

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

function makeSlot(date: string, start: string, end: string): AvailableSlot {
  const startTime = `${date}T${start}:00.000Z`;
  const endTime = `${date}T${end}:00.000Z`;
  const durationMinutes = (new Date(endTime).getTime() - new Date(startTime).getTime()) / 60_000;
  return { date, startTime, endTime, durationMinutes };
}

function makeEvent(
  id: string,
  start: string,
  end: string,
  isAllDay = false,
  date: string | null = null,
): Event {
  return {
    id,
    title: "Event",
    startTime: isAllDay ? null : start,
    endTime: isAllDay ? null : end,
    isAllDay,
    date: isAllDay ? date : null,
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
  };
}

const mondayAvailability: Availability = {
  windows: [{ day: 1, startTime: "09:00", endTime: "17:00" }],
};

const defaultFocusTime: FocusTime = {
  blocks: [{ day: 1, startTime: "09:00", endTime: "11:00" }],
  minimumBlockMinutes: 60,
};

describe("Scheduler - Availability Map", () => {
  describe("buildAvailabilityMap", () => {
    it("creates slots for a single day with availability", () => {
      // 2026-04-13 is a Monday (day 1)
      const slots = buildAvailabilityMap(
        new Date("2026-04-13T00:00:00.000Z"),
        new Date("2026-04-14T00:00:00.000Z"),
        mondayAvailability,
        [],
        [],
      );
      expect(slots).toHaveLength(1);
      expect(slots[0].date).toBe("2026-04-13");
      expect(slots[0].startTime).toBe("2026-04-13T09:00:00.000Z");
      expect(slots[0].endTime).toBe("2026-04-13T17:00:00.000Z");
      expect(slots[0].durationMinutes).toBe(480);
    });

    it("returns empty for days without availability", () => {
      // 2026-04-12 is a Sunday (day 0) — no window for day 0
      const slots = buildAvailabilityMap(
        new Date("2026-04-12T00:00:00.000Z"),
        new Date("2026-04-13T00:00:00.000Z"),
        mondayAvailability,
        [],
        [],
      );
      expect(slots).toHaveLength(0);
    });

    it("subtracts timed events from availability", () => {
      const events: Event[] = [
        makeEvent("e1", "2026-04-13T10:00:00.000Z", "2026-04-13T11:00:00.000Z"),
      ];
      const slots = buildAvailabilityMap(
        new Date("2026-04-13T00:00:00.000Z"),
        new Date("2026-04-14T00:00:00.000Z"),
        mondayAvailability,
        events,
        [],
      );
      // 09:00-10:00 and 11:00-17:00
      expect(slots).toHaveLength(2);
      expect(slots[0].startTime).toBe("2026-04-13T09:00:00.000Z");
      expect(slots[0].endTime).toBe("2026-04-13T10:00:00.000Z");
      expect(slots[1].startTime).toBe("2026-04-13T11:00:00.000Z");
      expect(slots[1].endTime).toBe("2026-04-13T17:00:00.000Z");
    });

    it("handles all-day events blocking the entire day", () => {
      const events: Event[] = [makeEvent("e1", null, null, true, "2026-04-13")];
      const slots = buildAvailabilityMap(
        new Date("2026-04-13T00:00:00.000Z"),
        new Date("2026-04-14T00:00:00.000Z"),
        mondayAvailability,
        events,
        [],
      );
      expect(slots).toHaveLength(0);
    });

    it("subtracts pinned blocks from availability", () => {
      const pinnedBlocks: TimeBlock[] = [
        {
          id: "b1",
          taskId: "pinned",
          startTime: "2026-04-13T12:00:00.000Z",
          endTime: "2026-04-13T13:00:00.000Z",
          date: "2026-04-13",
          blockIndex: 0,
          totalBlocks: 1,
        },
      ];
      const slots = buildAvailabilityMap(
        new Date("2026-04-13T00:00:00.000Z"),
        new Date("2026-04-14T00:00:00.000Z"),
        mondayAvailability,
        [],
        pinnedBlocks,
      );
      // 09:00-12:00 and 13:00-17:00
      expect(slots).toHaveLength(2);
      expect(slots[0].endTime).toBe("2026-04-13T12:00:00.000Z");
      expect(slots[1].startTime).toBe("2026-04-13T13:00:00.000Z");
    });

    it("handles multiple events splitting a single slot", () => {
      const events: Event[] = [
        makeEvent("e1", "2026-04-13T10:00:00.000Z", "2026-04-13T10:30:00.000Z"),
        makeEvent("e2", "2026-04-13T14:00:00.000Z", "2026-04-13T15:00:00.000Z"),
      ];
      const slots = buildAvailabilityMap(
        new Date("2026-04-13T00:00:00.000Z"),
        new Date("2026-04-14T00:00:00.000Z"),
        mondayAvailability,
        events,
        [],
      );
      // 09:00-10:00, 10:30-14:00, 15:00-17:00
      expect(slots).toHaveLength(3);
      expect(slots[0].durationMinutes).toBe(60);
      expect(slots[1].durationMinutes).toBe(210);
      expect(slots[2].durationMinutes).toBe(120);
    });

    it("returns empty when availability is completely filled by events", () => {
      const events: Event[] = [
        makeEvent("e1", "2026-04-13T09:00:00.000Z", "2026-04-13T17:00:00.000Z"),
      ];
      const slots = buildAvailabilityMap(
        new Date("2026-04-13T00:00:00.000Z"),
        new Date("2026-04-14T00:00:00.000Z"),
        mondayAvailability,
        events,
        [],
      );
      expect(slots).toHaveLength(0);
    });

    it("handles multiple days", () => {
      const weekdayAvail: Availability = {
        windows: [
          { day: 1, startTime: "09:00", endTime: "17:00" },
          { day: 2, startTime: "09:00", endTime: "17:00" },
        ],
      };
      // 2026-04-13 Mon, 2026-04-14 Tue
      const slots = buildAvailabilityMap(
        new Date("2026-04-13T00:00:00.000Z"),
        new Date("2026-04-15T00:00:00.000Z"),
        weekdayAvail,
        [],
        [],
      );
      expect(slots).toHaveLength(2);
      expect(slots[0].date).toBe("2026-04-13");
      expect(slots[1].date).toBe("2026-04-14");
    });
  });
});

describe("Scheduler - Scoring Functions", () => {
  describe("deadlineProximityScore", () => {
    it("returns 0.5 for tasks with no deadline", () => {
      const task = makeTask({ id: "a", deadline: null });
      const slot = makeSlot("2026-04-13", "09:00", "10:00");
      const now = new Date("2026-04-10T09:00:00.000Z");
      expect(deadlineProximityScore(task, slot, now)).toBe(0.5);
    });

    it("returns high score for slot near imminent deadline", () => {
      const task = makeTask({ id: "a", deadline: "2026-04-11T17:00:00.000Z" });
      const slot = makeSlot("2026-04-10", "09:00", "10:00");
      const now = new Date("2026-04-10T08:00:00.000Z");
      const score = deadlineProximityScore(task, slot, now);
      expect(score).toBeGreaterThan(0.8);
    });

    it("returns lower score for slot with distant deadline", () => {
      const task = makeTask({ id: "a", deadline: "2026-04-30T17:00:00.000Z" });
      const slot = makeSlot("2026-04-10", "09:00", "10:00");
      const now = new Date("2026-04-10T08:00:00.000Z");
      const score = deadlineProximityScore(task, slot, now);
      expect(score).toBeLessThan(0.5);
    });
  });

  describe("priorityScore", () => {
    it("returns 1.0 for P1", () => {
      const task = makeTask({ id: "a", priority: "P1" });
      expect(priorityScore(task)).toBe(1.0);
    });

    it("returns 0.75 for P2", () => {
      const task = makeTask({ id: "a", priority: "P2" });
      expect(priorityScore(task)).toBe(0.75);
    });

    it("returns 0.5 for P3", () => {
      const task = makeTask({ id: "a", priority: "P3" });
      expect(priorityScore(task)).toBe(0.5);
    });

    it("returns 0.25 for P4", () => {
      const task = makeTask({ id: "a", priority: "P4" });
      expect(priorityScore(task)).toBe(0.25);
    });
  });

  describe("focusTimeScore", () => {
    it("returns 1.0 for focus-tagged task in focus block", () => {
      const task = makeTask({ id: "a", tags: ["deep-work"] });
      const slot = makeSlot("2026-04-13", "09:30", "10:30"); // within 09:00-11:00 focus
      expect(focusTimeScore(task, slot, defaultFocusTime)).toBe(1.0);
    });

    it("returns 0.0 for focus-tagged task outside focus block", () => {
      const task = makeTask({ id: "a", tags: ["deep-work"] });
      const slot = makeSlot("2026-04-13", "14:00", "15:00");
      expect(focusTimeScore(task, slot, defaultFocusTime)).toBe(0.0);
    });

    it("returns 0.2 for non-focus task in focus block", () => {
      const task = makeTask({ id: "a", tags: ["routine"] });
      const slot = makeSlot("2026-04-13", "09:30", "10:30");
      expect(focusTimeScore(task, slot, defaultFocusTime)).toBe(0.2);
    });

    it("returns 0.5 for non-focus task outside focus block", () => {
      const task = makeTask({ id: "a", tags: [] });
      const slot = makeSlot("2026-04-13", "14:00", "15:00");
      expect(focusTimeScore(task, slot, defaultFocusTime)).toBe(0.5);
    });

    it("returns 0.5 when no focus blocks are configured", () => {
      const noFocus: FocusTime = { blocks: [], minimumBlockMinutes: 60 };
      const task = makeTask({ id: "a", tags: ["deep-work"] });
      const slot = makeSlot("2026-04-13", "09:00", "10:00");
      expect(focusTimeScore(task, slot, noFocus)).toBe(0.5);
    });
  });

  describe("energyScore", () => {
    it("returns 1.0 for deep-work tagged task in peak hours", () => {
      const task = makeTask({ id: "a", tags: ["deep-work"] });
      const slot = makeSlot("2026-04-13", "09:00", "10:00");
      expect(
        energyScore(task, slot, {
          peakEnergyStart: "09:00",
          peakEnergyEnd: "12:00",
          lowEnergyStart: "14:00",
          lowEnergyEnd: "15:00",
        }),
      ).toBe(1.0);
    });

    it("returns 1.0 for routine tagged task in low-energy hours", () => {
      const task = makeTask({ id: "a", tags: ["routine"] });
      const slot = makeSlot("2026-04-13", "14:00", "14:30");
      expect(
        energyScore(task, slot, {
          peakEnergyStart: "09:00",
          peakEnergyEnd: "12:00",
          lowEnergyStart: "14:00",
          lowEnergyEnd: "15:00",
        }),
      ).toBe(1.0);
    });

    it("returns 0.2 for energy-tagged task in non-matching zone", () => {
      const task = makeTask({ id: "a", tags: ["deep-work"] });
      const slot = makeSlot("2026-04-13", "14:00", "15:00");
      expect(
        energyScore(task, slot, {
          peakEnergyStart: "09:00",
          peakEnergyEnd: "12:00",
          lowEnergyStart: "14:00",
          lowEnergyEnd: "15:00",
        }),
      ).toBe(0.2);
    });

    it("returns 0.5 for untagged task", () => {
      const task = makeTask({ id: "a", tags: [] });
      const slot = makeSlot("2026-04-13", "09:00", "10:00");
      expect(
        energyScore(task, slot, {
          peakEnergyStart: "09:00",
          peakEnergyEnd: "12:00",
          lowEnergyStart: "14:00",
          lowEnergyEnd: "15:00",
        }),
      ).toBe(0.5);
    });

    it("returns 0.5 when no energy config provided", () => {
      const task = makeTask({ id: "a", tags: ["deep-work"] });
      const slot = makeSlot("2026-04-13", "09:00", "10:00");
      expect(energyScore(task, slot, null)).toBe(0.5);
    });
  });

  describe("bufferScore", () => {
    it("returns 1.0 when no adjacent blocks within buffer zone", () => {
      const slot = makeSlot("2026-04-13", "11:00", "12:00");
      const adjacentBlocks: TimeBlock[] = [];
      expect(bufferScore(slot, adjacentBlocks, 15)).toBe(1.0);
    });

    it("returns 0.5 when one side has adjacent block within buffer", () => {
      const slot = makeSlot("2026-04-13", "11:00", "12:00");
      const adjacentBlocks: TimeBlock[] = [
        {
          id: "b1",
          taskId: "t1",
          startTime: "2026-04-13T10:50:00.000Z",
          endTime: "2026-04-13T11:00:00.000Z",
          date: "2026-04-13",
          blockIndex: 0,
          totalBlocks: 1,
        },
      ];
      expect(bufferScore(slot, adjacentBlocks, 15)).toBe(0.5);
    });

    it("returns 0.0 when both sides have adjacent blocks within buffer", () => {
      const slot = makeSlot("2026-04-13", "11:00", "12:00");
      const adjacentBlocks: TimeBlock[] = [
        {
          id: "b1",
          taskId: "t1",
          startTime: "2026-04-13T10:50:00.000Z",
          endTime: "2026-04-13T11:00:00.000Z",
          date: "2026-04-13",
          blockIndex: 0,
          totalBlocks: 1,
        },
        {
          id: "b2",
          taskId: "t2",
          startTime: "2026-04-13T12:00:00.000Z",
          endTime: "2026-04-13T12:10:00.000Z",
          date: "2026-04-13",
          blockIndex: 0,
          totalBlocks: 1,
        },
      ];
      expect(bufferScore(slot, adjacentBlocks, 15)).toBe(0.0);
    });
  });

  describe("scoreSlot", () => {
    it("returns weighted sum of individual scores", () => {
      const task = makeTask({ id: "a", priority: "P1", deadline: null, tags: [] });
      const slot = makeSlot("2026-04-13", "14:00", "15:00");
      const now = new Date("2026-04-10T09:00:00.000Z");
      const noFocus: FocusTime = { blocks: [], minimumBlockMinutes: 60 };
      const result = scoreSlot(task, slot, now, noFocus, null, [], 15);

      // With no deadline: deadlineProximity=0.5, P1 priority=1.0, no focus=0.5, no energy=0.5, no adjacent=1.0
      const expected =
        DEFAULT_WEIGHTS.deadlineProximity * 0.5 +
        DEFAULT_WEIGHTS.priority * 1.0 +
        DEFAULT_WEIGHTS.focusTime * 0.5 +
        DEFAULT_WEIGHTS.energy * 0.5 +
        DEFAULT_WEIGHTS.buffer * 1.0;

      expect(result.totalScore).toBeCloseTo(expected, 2);
    });

    it("includes breakdown of individual scores", () => {
      const task = makeTask({ id: "a", priority: "P2", tags: [] });
      const slot = makeSlot("2026-04-13", "14:00", "15:00");
      const now = new Date("2026-04-10T09:00:00.000Z");
      const noFocus: FocusTime = { blocks: [], minimumBlockMinutes: 60 };
      const result = scoreSlot(task, slot, now, noFocus, null, [], 15);

      expect(result.breakdown.priority).toBe(0.75);
      expect(result.breakdown.deadlineProximity).toBe(0.5);
      expect(result.breakdown.focusTime).toBe(0.5);
      expect(result.breakdown.energy).toBe(0.5);
      expect(result.breakdown.buffer).toBe(1.0);
    });
  });
});
