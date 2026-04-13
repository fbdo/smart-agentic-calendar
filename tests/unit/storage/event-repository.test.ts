import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Database } from "../../../src/storage/database.js";
import { EventRepository } from "../../../src/storage/event-repository.js";
import { NotFoundError, ValidationError } from "../../../src/models/errors.js";
import { createNoOpLogger } from "../../../src/common/logger.js";

describe("EventRepository", () => {
  let db: Database;
  let repo: EventRepository;

  beforeEach(() => {
    db = new Database(":memory:", createNoOpLogger());
    repo = new EventRepository(db, createNoOpLogger());
  });

  afterEach(() => {
    db.close();
  });

  describe("create", () => {
    it("creates a timed event", () => {
      const event = repo.create({
        title: "Team standup",
        startTime: "2026-04-10T09:00:00.000Z",
        endTime: "2026-04-10T09:30:00.000Z",
        isAllDay: false,
        date: null,
      });

      expect(event.id).toBeDefined();
      expect(event.title).toBe("Team standup");
      expect(event.startTime).toBe("2026-04-10T09:00:00.000Z");
      expect(event.endTime).toBe("2026-04-10T09:30:00.000Z");
      expect(event.isAllDay).toBe(false);
      expect(event.date).toBeNull();
      expect(event.createdAt).toBeDefined();
      expect(event.updatedAt).toBeDefined();
    });

    it("creates an all-day event", () => {
      const event = repo.create({
        title: "Company holiday",
        startTime: null,
        endTime: null,
        isAllDay: true,
        date: "2026-12-25",
      });

      expect(event.title).toBe("Company holiday");
      expect(event.startTime).toBeNull();
      expect(event.endTime).toBeNull();
      expect(event.isAllDay).toBe(true);
      expect(event.date).toBe("2026-12-25");
    });

    it("throws ValidationError for empty title", () => {
      expect(() =>
        repo.create({
          title: "",
          startTime: "2026-04-10T09:00:00.000Z",
          endTime: "2026-04-10T10:00:00.000Z",
          isAllDay: false,
          date: null,
        }),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError when timed event is missing startTime", () => {
      expect(() =>
        repo.create({
          title: "Meeting",
          startTime: null,
          endTime: "2026-04-10T10:00:00.000Z",
          isAllDay: false,
          date: null,
        }),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError when timed event is missing endTime", () => {
      expect(() =>
        repo.create({
          title: "Meeting",
          startTime: "2026-04-10T09:00:00.000Z",
          endTime: null,
          isAllDay: false,
          date: null,
        }),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError when endTime is before startTime", () => {
      expect(() =>
        repo.create({
          title: "Meeting",
          startTime: "2026-04-10T10:00:00.000Z",
          endTime: "2026-04-10T09:00:00.000Z",
          isAllDay: false,
          date: null,
        }),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError when endTime equals startTime", () => {
      expect(() =>
        repo.create({
          title: "Meeting",
          startTime: "2026-04-10T09:00:00.000Z",
          endTime: "2026-04-10T09:00:00.000Z",
          isAllDay: false,
          date: null,
        }),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError when all-day event is missing date", () => {
      expect(() =>
        repo.create({
          title: "Holiday",
          startTime: null,
          endTime: null,
          isAllDay: true,
          date: null,
        }),
      ).toThrow(ValidationError);
    });
  });

  describe("findById", () => {
    it("returns the event when found", () => {
      const created = repo.create({
        title: "Meeting",
        startTime: "2026-04-10T14:00:00.000Z",
        endTime: "2026-04-10T15:00:00.000Z",
        isAllDay: false,
        date: null,
      });

      const found = repo.findById(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.title).toBe("Meeting");
    });

    it("returns undefined when not found", () => {
      expect(repo.findById("nonexistent")).toBeUndefined();
    });
  });

  describe("findInRange", () => {
    it("returns timed events overlapping the range", () => {
      repo.create({
        title: "Before range",
        startTime: "2026-04-09T09:00:00.000Z",
        endTime: "2026-04-09T10:00:00.000Z",
        isAllDay: false,
        date: null,
      });
      repo.create({
        title: "In range",
        startTime: "2026-04-10T09:00:00.000Z",
        endTime: "2026-04-10T10:00:00.000Z",
        isAllDay: false,
        date: null,
      });
      repo.create({
        title: "After range",
        startTime: "2026-04-12T09:00:00.000Z",
        endTime: "2026-04-12T10:00:00.000Z",
        isAllDay: false,
        date: null,
      });

      const events = repo.findInRange("2026-04-10T00:00:00.000Z", "2026-04-11T00:00:00.000Z");
      expect(events).toHaveLength(1);
      expect(events[0].title).toBe("In range");
    });

    it("returns all-day events within the range", () => {
      repo.create({
        title: "Before",
        startTime: null,
        endTime: null,
        isAllDay: true,
        date: "2026-04-09",
      });
      repo.create({
        title: "In range",
        startTime: null,
        endTime: null,
        isAllDay: true,
        date: "2026-04-10",
      });
      repo.create({
        title: "After",
        startTime: null,
        endTime: null,
        isAllDay: true,
        date: "2026-04-12",
      });

      const events = repo.findInRange("2026-04-10T00:00:00.000Z", "2026-04-11T00:00:00.000Z");
      expect(events).toHaveLength(1);
      expect(events[0].title).toBe("In range");
    });

    it("returns mixed timed and all-day events", () => {
      repo.create({
        title: "Timed",
        startTime: "2026-04-10T09:00:00.000Z",
        endTime: "2026-04-10T10:00:00.000Z",
        isAllDay: false,
        date: null,
      });
      repo.create({
        title: "All day",
        startTime: null,
        endTime: null,
        isAllDay: true,
        date: "2026-04-10",
      });

      const events = repo.findInRange("2026-04-10T00:00:00.000Z", "2026-04-11T00:00:00.000Z");
      expect(events).toHaveLength(2);
    });

    it("returns events that span across the range boundary", () => {
      repo.create({
        title: "Spanning",
        startTime: "2026-04-09T23:00:00.000Z",
        endTime: "2026-04-10T01:00:00.000Z",
        isAllDay: false,
        date: null,
      });

      const events = repo.findInRange("2026-04-10T00:00:00.000Z", "2026-04-11T00:00:00.000Z");
      expect(events).toHaveLength(1);
      expect(events[0].title).toBe("Spanning");
    });

    it("returns empty array when no events in range", () => {
      const events = repo.findInRange("2026-04-10T00:00:00.000Z", "2026-04-11T00:00:00.000Z");
      expect(events).toEqual([]);
    });
  });

  describe("update", () => {
    it("updates provided fields only", () => {
      const event = repo.create({
        title: "Original",
        startTime: "2026-04-10T09:00:00.000Z",
        endTime: "2026-04-10T10:00:00.000Z",
        isAllDay: false,
        date: null,
      });

      const updated = repo.update(event.id, { title: "Updated" });
      expect(updated.title).toBe("Updated");
      expect(updated.startTime).toBe("2026-04-10T09:00:00.000Z");
    });

    it("throws NotFoundError for nonexistent event", () => {
      expect(() => repo.update("nonexistent", { title: "Nope" })).toThrow(NotFoundError);
    });
  });

  describe("delete", () => {
    it("permanently deletes an event", () => {
      const event = repo.create({
        title: "To delete",
        startTime: "2026-04-10T09:00:00.000Z",
        endTime: "2026-04-10T10:00:00.000Z",
        isAllDay: false,
        date: null,
      });

      repo.delete(event.id);

      expect(repo.findById(event.id)).toBeUndefined();
    });

    it("throws NotFoundError for nonexistent event", () => {
      expect(() => repo.delete("nonexistent")).toThrow(NotFoundError);
    });
  });
});
