import { describe, it, expect, vi } from "vitest";
import { EventTools } from "../../../src/mcp/tools/event-tools.js";
import type { EventRepository } from "../../../src/storage/event-repository.js";
import type { ReplanCoordinator } from "../../../src/engine/replan-coordinator.js";
import type { Event } from "../../../src/models/event.js";
import { NotFoundError } from "../../../src/models/errors.js";
import { createNoOpLogger } from "../../../src/common/logger.js";

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "evt-1",
    title: "Meeting",
    startTime: "2026-04-10T09:00:00.000Z",
    endTime: "2026-04-10T10:00:00.000Z",
    isAllDay: false,
    date: null,
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
    ...overrides,
  };
}

function createMocks() {
  const eventRepo = {
    create: vi.fn().mockImplementation((input) => makeEvent({ ...input, id: "new-evt-1" })),
    findById: vi.fn().mockReturnValue(makeEvent()),
    findInRange: vi.fn().mockReturnValue([makeEvent()]),
    update: vi.fn().mockImplementation((_id, updates) => makeEvent(updates)),
    delete: vi.fn(),
  } as unknown as EventRepository;

  const replanCoordinator = {
    requestReplan: vi.fn(),
  } as unknown as ReplanCoordinator;

  const tools = new EventTools(eventRepo, replanCoordinator, createNoOpLogger());

  return { tools, eventRepo, replanCoordinator };
}

describe("EventTools", () => {
  describe("createEvent", () => {
    it("creates timed event via eventRepo.create, triggers requestReplan", () => {
      const { tools, eventRepo, replanCoordinator } = createMocks();
      const result = tools.createEvent({
        title: "Meeting",
        start_time: "2026-04-10T09:00:00.000Z",
        end_time: "2026-04-10T10:00:00.000Z",
      });

      expect(eventRepo.create).toHaveBeenCalled();
      expect(replanCoordinator.requestReplan).toHaveBeenCalled();
      expect(result.event.title).toBe("Meeting");
    });

    it("creates all-day event with date, start_time/end_time null", () => {
      const { tools, eventRepo } = createMocks();
      tools.createEvent({
        title: "Holiday",
        is_all_day: true,
        date: "2026-04-15",
      });

      const call = (eventRepo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.isAllDay).toBe(true);
      expect(call.date).toBe("2026-04-15");
      expect(call.startTime).toBeNull();
      expect(call.endTime).toBeNull();
    });
  });

  describe("updateEvent", () => {
    it("updates fields, triggers requestReplan", () => {
      const { tools, eventRepo, replanCoordinator } = createMocks();
      const result = tools.updateEvent({
        event_id: "evt-1",
        title: "Updated Meeting",
      });

      expect(eventRepo.update).toHaveBeenCalledWith("evt-1", { title: "Updated Meeting" });
      expect(replanCoordinator.requestReplan).toHaveBeenCalled();
      expect(result.event).toBeDefined();
    });

    it("event not found: throws NotFoundError", () => {
      const { tools, eventRepo } = createMocks();
      (eventRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      expect(() => tools.updateEvent({ event_id: "missing", title: "X" })).toThrow(NotFoundError);
    });
  });

  describe("deleteEvent", () => {
    it("deletes via eventRepo.delete, triggers requestReplan", () => {
      const { tools, eventRepo, replanCoordinator } = createMocks();
      const result = tools.deleteEvent({ event_id: "evt-1" });

      expect(eventRepo.delete).toHaveBeenCalledWith("evt-1");
      expect(replanCoordinator.requestReplan).toHaveBeenCalled();
      expect(result.event_id).toBe("evt-1");
      expect(result.message).toBe("Event deleted successfully");
    });

    it("event not found: throws NotFoundError", () => {
      const { tools, eventRepo } = createMocks();
      (eventRepo.findById as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      expect(() => tools.deleteEvent({ event_id: "missing" })).toThrow(NotFoundError);
    });
  });

  describe("listEvents", () => {
    it("returns events in date range, no replan triggered", () => {
      const { tools, eventRepo, replanCoordinator } = createMocks();
      const result = tools.listEvents({
        start_date: "2026-04-10",
        end_date: "2026-04-17",
      });

      expect(eventRepo.findInRange).toHaveBeenCalledWith("2026-04-10", "2026-04-17");
      expect(replanCoordinator.requestReplan).not.toHaveBeenCalled();
      expect(result.events).toHaveLength(1);
      expect(result.count).toBe(1);
    });

    it("empty results: returns empty array with count 0", () => {
      const { tools, eventRepo } = createMocks();
      (eventRepo.findInRange as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const result = tools.listEvents({
        start_date: "2026-04-10",
        end_date: "2026-04-17",
      });
      expect(result.events).toEqual([]);
      expect(result.count).toBe(0);
    });
  });
});
