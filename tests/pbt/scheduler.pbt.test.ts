import { describe, it, expect } from "vitest";
import {
  buildAvailabilityMap,
  placeTask,
  scoreSlot,
  type AvailableSlot,
  DEFAULT_WEIGHTS,
} from "../../src/engine/scheduler.js";
import type { Task } from "../../src/models/task.js";
import type { FocusTime } from "../../src/models/config.js";
import type { Availability } from "../../src/models/config.js";

function makeTask(id: string, duration: number, priority: "P1" | "P2" | "P3" | "P4" = "P3"): Task {
  return {
    id,
    title: `Task ${id}`,
    description: null,
    duration,
    deadline: null,
    priority,
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

function makeSlot(date: string, startHH: string, endHH: string): AvailableSlot {
  const startTime = `${date}T${startHH}:00.000Z`;
  const endTime = `${date}T${endHH}:00.000Z`;
  const durationMinutes = (new Date(endTime).getTime() - new Date(startTime).getTime()) / 60_000;
  return { date, startTime, endTime, durationMinutes };
}

const noFocus: FocusTime = { blocks: [], minimumBlockMinutes: 60 };
const now = new Date("2026-04-10T08:00:00.000Z");

// Seeded PRNG (mulberry32)
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("Scheduler PBT", () => {
  describe("no two time blocks overlap", () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    for (const seed of seeds) {
      it(`seed=${seed}: placed blocks never overlap`, () => {
        const rand = mulberry32(seed);
        const slots = [
          makeSlot("2026-04-13", "09:00", "12:00"),
          makeSlot("2026-04-13", "13:00", "17:00"),
        ];

        // Place multiple tasks
        const allBlocks: { start: number; end: number }[] = [];
        const remainingSlots = [...slots];

        for (let i = 0; i < 5; i++) {
          const duration = Math.floor(rand() * 90) + 30; // 30-120 min
          const task = makeTask(`t${i}`, duration);
          const result = placeTask(task, remainingSlots, [], now, noFocus, null, 15, 30, 60);

          for (const block of result.blocks) {
            const start = new Date(block.startTime).getTime();
            const end = new Date(block.endTime).getTime();
            allBlocks.push({ start, end });

            // Consume slot space manually
            for (let j = remainingSlots.length - 1; j >= 0; j--) {
              const slot = remainingSlots[j];
              const slotStart = new Date(slot.startTime).getTime();
              const slotEnd = new Date(slot.endTime).getTime();
              if (start < slotEnd && end > slotStart) {
                remainingSlots.splice(j, 1);
                if (start > slotStart) {
                  remainingSlots.push({
                    date: slot.date,
                    startTime: slot.startTime,
                    endTime: block.startTime,
                    durationMinutes: (start - slotStart) / 60_000,
                  });
                }
                if (end < slotEnd) {
                  remainingSlots.push({
                    date: slot.date,
                    startTime: block.endTime,
                    endTime: slot.endTime,
                    durationMinutes: (slotEnd - end) / 60_000,
                  });
                }
              }
            }
          }
        }

        // Verify no overlaps
        for (let i = 0; i < allBlocks.length; i++) {
          for (let j = i + 1; j < allBlocks.length; j++) {
            const a = allBlocks[i];
            const b = allBlocks[j];
            const overlaps = a.start < b.end && a.end > b.start;
            expect(overlaps).toBe(false);
          }
        }
      });
    }
  });

  describe("all blocks fall within availability windows", () => {
    const availability: Availability = {
      windows: [
        { day: 1, startTime: "09:00", endTime: "17:00" },
        { day: 2, startTime: "09:00", endTime: "17:00" },
      ],
    };

    it("blocks stay within availability bounds", () => {
      const slots = buildAvailabilityMap(
        new Date("2026-04-13T00:00:00.000Z"), // Monday
        new Date("2026-04-15T00:00:00.000Z"), // through Tuesday
        availability,
        [],
        [],
      );

      const task = makeTask("t1", 300); // 5 hours — needs splitting
      const result = placeTask(task, slots, [], now, noFocus, null, 15, 30, 60);

      for (const block of result.blocks) {
        const blockTime = block.startTime.slice(11, 16);
        expect(blockTime >= "09:00").toBe(true);
        const endTime = block.endTime.slice(11, 16);
        expect(endTime <= "17:00").toBe(true);
      }
    });
  });

  describe("scoreSlot returns bounded values", () => {
    const seeds = [42, 123, 789, 999, 5555, 11111, 22222, 33333, 44444, 55555];
    const maxScore =
      DEFAULT_WEIGHTS.deadlineProximity * 1.0 +
      DEFAULT_WEIGHTS.priority * 1.0 +
      DEFAULT_WEIGHTS.focusTime * 1.0 +
      DEFAULT_WEIGHTS.energy * 1.0 +
      DEFAULT_WEIGHTS.buffer * 1.0;

    for (const seed of seeds) {
      it(`seed=${seed}: total score in [0, ${maxScore}], breakdown in [0, 1]`, () => {
        const rand = mulberry32(seed);
        const priorities = ["P1", "P2", "P3", "P4"] as const;
        const task = makeTask(
          `t${seed}`,
          Math.floor(rand() * 120) + 30,
          priorities[Math.floor(rand() * 4)],
        );
        const slot = makeSlot("2026-04-13", "10:00", "11:00");

        const result = scoreSlot(task, slot, now, noFocus, null, [], 15);

        expect(result.totalScore).toBeGreaterThanOrEqual(0);
        expect(result.totalScore).toBeLessThanOrEqual(maxScore);
        expect(result.breakdown.deadlineProximity).toBeGreaterThanOrEqual(0);
        expect(result.breakdown.deadlineProximity).toBeLessThanOrEqual(1);
        expect(result.breakdown.priority).toBeGreaterThanOrEqual(0);
        expect(result.breakdown.priority).toBeLessThanOrEqual(1);
        expect(result.breakdown.focusTime).toBeGreaterThanOrEqual(0);
        expect(result.breakdown.focusTime).toBeLessThanOrEqual(1);
        expect(result.breakdown.energy).toBeGreaterThanOrEqual(0);
        expect(result.breakdown.energy).toBeLessThanOrEqual(1);
        expect(result.breakdown.buffer).toBeGreaterThanOrEqual(0);
        expect(result.breakdown.buffer).toBeLessThanOrEqual(1);
      });
    }
  });
});
