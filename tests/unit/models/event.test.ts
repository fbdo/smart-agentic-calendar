import { describe, it, expect } from "vitest";
import { type Event } from "../../../src/models/event.js";

describe("Event types", () => {
  it("allows constructing a timed event", () => {
    const event: Event = {
      id: "evt-1",
      title: "Team standup",
      startTime: "2026-01-15T09:00:00Z",
      endTime: "2026-01-15T09:30:00Z",
      isAllDay: false,
      date: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(event.isAllDay).toBe(false);
    expect(event.date).toBeNull();
  });

  it("allows constructing an all-day event", () => {
    const event: Event = {
      id: "evt-2",
      title: "Holiday",
      startTime: null,
      endTime: null,
      isAllDay: true,
      date: "2026-12-25",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(event.isAllDay).toBe(true);
    expect(event.date).toBe("2026-12-25");
  });
});
