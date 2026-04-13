import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Database } from "../../../src/storage/database.js";
import { ConfigRepository } from "../../../src/storage/config-repository.js";
import { ValidationError } from "../../../src/models/errors.js";
import { createNoOpLogger } from "../../../src/common/logger.js";

describe("ConfigRepository", () => {
  let db: Database;
  let repo: ConfigRepository;

  beforeEach(() => {
    db = new Database(":memory:", createNoOpLogger());
    repo = new ConfigRepository(db, createNoOpLogger());
  });

  afterEach(() => {
    db.close();
  });

  describe("getAvailability", () => {
    it("returns empty windows when none configured", () => {
      const avail = repo.getAvailability();
      expect(avail.windows).toEqual([]);
    });

    it("returns configured windows", () => {
      repo.setAvailability({
        windows: [
          { day: 1, startTime: "09:00", endTime: "17:00" },
          { day: 2, startTime: "09:00", endTime: "17:00" },
        ],
      });

      const avail = repo.getAvailability();
      expect(avail.windows).toHaveLength(2);
      expect(avail.windows[0].day).toBe(1);
      expect(avail.windows[0].startTime).toBe("09:00");
      expect(avail.windows[0].endTime).toBe("17:00");
    });
  });

  describe("setAvailability", () => {
    it("replaces existing windows", () => {
      repo.setAvailability({
        windows: [{ day: 1, startTime: "09:00", endTime: "17:00" }],
      });
      repo.setAvailability({
        windows: [{ day: 3, startTime: "10:00", endTime: "16:00" }],
      });

      const avail = repo.getAvailability();
      expect(avail.windows).toHaveLength(1);
      expect(avail.windows[0].day).toBe(3);
    });

    it("throws ValidationError for invalid day", () => {
      expect(() =>
        repo.setAvailability({
          windows: [{ day: 7 as never, startTime: "09:00", endTime: "17:00" }],
        }),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError for invalid time format", () => {
      expect(() =>
        repo.setAvailability({
          windows: [{ day: 1, startTime: "9:00", endTime: "17:00" }],
        }),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError when endTime is before startTime", () => {
      expect(() =>
        repo.setAvailability({
          windows: [{ day: 1, startTime: "17:00", endTime: "09:00" }],
        }),
      ).toThrow(ValidationError);
    });
  });

  describe("getFocusTime", () => {
    it("returns empty blocks with default minimum when none configured", () => {
      const focus = repo.getFocusTime();
      expect(focus.blocks).toEqual([]);
      expect(focus.minimumBlockMinutes).toBe(60);
    });

    it("returns configured blocks and custom minimum", () => {
      repo.setFocusTime({
        blocks: [{ day: 1, startTime: "09:00", endTime: "11:00" }],
        minimumBlockMinutes: 90,
      });

      const focus = repo.getFocusTime();
      expect(focus.blocks).toHaveLength(1);
      expect(focus.blocks[0].day).toBe(1);
      expect(focus.minimumBlockMinutes).toBe(90);
    });
  });

  describe("setFocusTime", () => {
    it("replaces existing blocks", () => {
      repo.setFocusTime({
        blocks: [{ day: 1, startTime: "09:00", endTime: "11:00" }],
        minimumBlockMinutes: 60,
      });
      repo.setFocusTime({
        blocks: [{ day: 3, startTime: "10:00", endTime: "12:00" }],
        minimumBlockMinutes: 45,
      });

      const focus = repo.getFocusTime();
      expect(focus.blocks).toHaveLength(1);
      expect(focus.blocks[0].day).toBe(3);
      expect(focus.minimumBlockMinutes).toBe(45);
    });

    it("throws ValidationError for invalid day", () => {
      expect(() =>
        repo.setFocusTime({
          blocks: [{ day: -1 as never, startTime: "09:00", endTime: "11:00" }],
          minimumBlockMinutes: 60,
        }),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError for invalid time format", () => {
      expect(() =>
        repo.setFocusTime({
          blocks: [{ day: 1, startTime: "bad", endTime: "11:00" }],
          minimumBlockMinutes: 60,
        }),
      ).toThrow(ValidationError);
    });
  });

  describe("getPreferences", () => {
    it("returns defaults when no custom values set", () => {
      const prefs = repo.getPreferences();
      expect(prefs.bufferTimeMinutes).toBe(15);
      expect(prefs.defaultPriority).toBe("P3");
      expect(prefs.defaultDuration).toBe(60);
      expect(prefs.schedulingHorizonWeeks).toBe(4);
      expect(prefs.minimumBlockMinutes).toBe(30);
    });

    it("returns custom values after setPreferences", () => {
      repo.setPreferences({ bufferTimeMinutes: 10, defaultDuration: 45 });

      const prefs = repo.getPreferences();
      expect(prefs.bufferTimeMinutes).toBe(10);
      expect(prefs.defaultDuration).toBe(45);
      expect(prefs.defaultPriority).toBe("P3"); // unchanged
    });
  });

  describe("setPreferences", () => {
    it("updates only provided fields", () => {
      repo.setPreferences({ bufferTimeMinutes: 5 });

      const prefs = repo.getPreferences();
      expect(prefs.bufferTimeMinutes).toBe(5);
      expect(prefs.defaultPriority).toBe("P3");
    });

    it("throws ValidationError for negative bufferTimeMinutes", () => {
      expect(() => repo.setPreferences({ bufferTimeMinutes: -1 })).toThrow(ValidationError);
    });

    it("throws ValidationError for zero defaultDuration", () => {
      expect(() => repo.setPreferences({ defaultDuration: 0 })).toThrow(ValidationError);
    });

    it("throws ValidationError for schedulingHorizonWeeks out of range", () => {
      expect(() => repo.setPreferences({ schedulingHorizonWeeks: 0 })).toThrow(ValidationError);
      expect(() => repo.setPreferences({ schedulingHorizonWeeks: 13 })).toThrow(ValidationError);
    });

    it("throws ValidationError for minimumBlockMinutes out of range", () => {
      expect(() => repo.setPreferences({ minimumBlockMinutes: 14 })).toThrow(ValidationError);
      expect(() => repo.setPreferences({ minimumBlockMinutes: 121 })).toThrow(ValidationError);
    });
  });

  describe("getFullConfig", () => {
    it("returns complete config with all sections", () => {
      repo.setAvailability({
        windows: [{ day: 1, startTime: "09:00", endTime: "17:00" }],
      });
      repo.setFocusTime({
        blocks: [{ day: 1, startTime: "09:00", endTime: "11:00" }],
        minimumBlockMinutes: 60,
      });

      const config = repo.getFullConfig();
      expect(config.availability.windows).toHaveLength(1);
      expect(config.focusTime.blocks).toHaveLength(1);
      expect(config.preferences.bufferTimeMinutes).toBe(15);
    });
  });
});
