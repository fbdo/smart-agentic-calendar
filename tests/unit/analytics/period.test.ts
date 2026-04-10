import { describe, it, expect } from "vitest";
import { resolvePeriod, validatePeriod } from "../../../src/analytics/period.js";
import { ValidationError } from "../../../src/models/errors.js";

describe("resolvePeriod", () => {
  describe("day", () => {
    it("returns today 00:00Z to tomorrow 00:00Z", () => {
      const ref = new Date("2026-04-10T14:30:00.000Z");
      const range = resolvePeriod("day", ref);
      expect(range.start).toBe("2026-04-10T00:00:00.000Z");
      expect(range.end).toBe("2026-04-11T00:00:00.000Z");
    });
  });

  describe("week", () => {
    it("returns current Monday 00:00Z to next Monday 00:00Z", () => {
      // 2026-04-10 is a Friday
      const ref = new Date("2026-04-10T14:30:00.000Z");
      const range = resolvePeriod("week", ref);
      expect(range.start).toBe("2026-04-06T00:00:00.000Z"); // Monday
      expect(range.end).toBe("2026-04-13T00:00:00.000Z"); // Next Monday
    });

    it("returns same day as start when referenceDate is Monday", () => {
      const ref = new Date("2026-04-06T10:00:00.000Z"); // Monday
      const range = resolvePeriod("week", ref);
      expect(range.start).toBe("2026-04-06T00:00:00.000Z");
      expect(range.end).toBe("2026-04-13T00:00:00.000Z");
    });

    it("handles Sunday correctly (last day of week)", () => {
      const ref = new Date("2026-04-12T10:00:00.000Z"); // Sunday
      const range = resolvePeriod("week", ref);
      expect(range.start).toBe("2026-04-06T00:00:00.000Z"); // Previous Monday
      expect(range.end).toBe("2026-04-13T00:00:00.000Z");
    });
  });

  describe("month", () => {
    it("returns 1st of month to 1st of next month", () => {
      const ref = new Date("2026-04-15T10:00:00.000Z");
      const range = resolvePeriod("month", ref);
      expect(range.start).toBe("2026-04-01T00:00:00.000Z");
      expect(range.end).toBe("2026-05-01T00:00:00.000Z");
    });

    it("handles December correctly (end = January next year)", () => {
      const ref = new Date("2026-12-20T10:00:00.000Z");
      const range = resolvePeriod("month", ref);
      expect(range.start).toBe("2026-12-01T00:00:00.000Z");
      expect(range.end).toBe("2027-01-01T00:00:00.000Z");
    });

    it("handles first day of month", () => {
      const ref = new Date("2026-04-01T00:00:00.000Z");
      const range = resolvePeriod("month", ref);
      expect(range.start).toBe("2026-04-01T00:00:00.000Z");
      expect(range.end).toBe("2026-05-01T00:00:00.000Z");
    });
  });

  it("uses provided referenceDate", () => {
    const ref = new Date("2026-06-15T12:00:00.000Z");
    const range = resolvePeriod("day", ref);
    expect(range.start).toBe("2026-06-15T00:00:00.000Z");
    expect(range.end).toBe("2026-06-16T00:00:00.000Z");
  });
});

describe("validatePeriod", () => {
  it("accepts 'day'", () => {
    expect(() => validatePeriod("day")).not.toThrow();
  });

  it("accepts 'week'", () => {
    expect(() => validatePeriod("week")).not.toThrow();
  });

  it("accepts 'month'", () => {
    expect(() => validatePeriod("month")).not.toThrow();
  });

  it("throws ValidationError for invalid value", () => {
    expect(() => validatePeriod("century")).toThrow(ValidationError);
    expect(() => validatePeriod("century")).toThrow("invalid period: must be day, week, or month");
  });

  it("throws ValidationError for empty string", () => {
    expect(() => validatePeriod("")).toThrow(ValidationError);
  });
});
