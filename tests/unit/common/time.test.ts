import { describe, it, expect } from "vitest";
import {
  toUTC,
  parseUTC,
  isValidISO8601,
  isValidTimeHHMM,
  isValidDateYYYYMMDD,
  nowUTC,
  startOfDay,
  endOfDay,
  addMinutes,
  diffMinutes,
} from "../../../src/common/time.js";

describe("toUTC", () => {
  it("converts a Date to ISO 8601 UTC string with Z suffix", () => {
    const date = new Date("2026-03-15T14:30:00Z");
    expect(toUTC(date)).toBe("2026-03-15T14:30:00.000Z");
  });
});

describe("parseUTC", () => {
  it("parses a valid ISO 8601 string to a Date", () => {
    const date = parseUTC("2026-03-15T14:30:00.000Z");
    expect(date.getUTCHours()).toBe(14);
    expect(date.getUTCMinutes()).toBe(30);
  });

  it("throws on invalid input", () => {
    expect(() => parseUTC("not-a-date")).toThrow();
  });

  it("throws on empty string", () => {
    expect(() => parseUTC("")).toThrow();
  });
});

describe("isValidISO8601", () => {
  it("returns true for valid ISO 8601 strings", () => {
    expect(isValidISO8601("2026-03-15T14:30:00Z")).toBe(true);
    expect(isValidISO8601("2026-03-15T14:30:00.000Z")).toBe(true);
  });

  it("returns false for invalid strings", () => {
    expect(isValidISO8601("not-a-date")).toBe(false);
    expect(isValidISO8601("")).toBe(false);
    expect(isValidISO8601("2026-13-01T00:00:00Z")).toBe(false);
  });
});

describe("isValidTimeHHMM", () => {
  it("returns true for valid HH:MM strings", () => {
    expect(isValidTimeHHMM("00:00")).toBe(true);
    expect(isValidTimeHHMM("09:30")).toBe(true);
    expect(isValidTimeHHMM("23:59")).toBe(true);
  });

  it("returns false for invalid strings", () => {
    expect(isValidTimeHHMM("24:00")).toBe(false);
    expect(isValidTimeHHMM("9:30")).toBe(false);
    expect(isValidTimeHHMM("abc")).toBe(false);
    expect(isValidTimeHHMM("")).toBe(false);
  });
});

describe("isValidDateYYYYMMDD", () => {
  it("returns true for valid YYYY-MM-DD strings", () => {
    expect(isValidDateYYYYMMDD("2026-01-15")).toBe(true);
    expect(isValidDateYYYYMMDD("2026-12-31")).toBe(true);
  });

  it("returns false for invalid strings", () => {
    expect(isValidDateYYYYMMDD("2026-13-01")).toBe(false);
    expect(isValidDateYYYYMMDD("2026-00-15")).toBe(false);
    expect(isValidDateYYYYMMDD("abc")).toBe(false);
    expect(isValidDateYYYYMMDD("")).toBe(false);
  });
});

describe("nowUTC", () => {
  it("returns a valid ISO 8601 string ending with Z", () => {
    const now = nowUTC();
    expect(now).toMatch(/Z$/);
    expect(isValidISO8601(now)).toBe(true);
  });
});

describe("startOfDay", () => {
  it("returns the start of the day in UTC", () => {
    expect(startOfDay("2026-03-15T14:30:00Z")).toBe("2026-03-15T00:00:00.000Z");
  });
});

describe("endOfDay", () => {
  it("returns the end of the day in UTC", () => {
    expect(endOfDay("2026-03-15T14:30:00Z")).toBe("2026-03-15T23:59:59.999Z");
  });
});

describe("addMinutes", () => {
  it("adds positive minutes", () => {
    expect(addMinutes("2026-03-15T14:30:00.000Z", 60)).toBe("2026-03-15T15:30:00.000Z");
  });

  it("adds minutes across day boundary", () => {
    expect(addMinutes("2026-03-15T23:30:00.000Z", 60)).toBe("2026-03-16T00:30:00.000Z");
  });

  it("handles negative minutes", () => {
    expect(addMinutes("2026-03-15T14:30:00.000Z", -30)).toBe("2026-03-15T14:00:00.000Z");
  });
});

describe("diffMinutes", () => {
  it("returns positive difference when end is after start", () => {
    expect(diffMinutes("2026-03-15T14:00:00Z", "2026-03-15T15:30:00Z")).toBe(90);
  });

  it("returns negative difference when end is before start", () => {
    expect(diffMinutes("2026-03-15T15:30:00Z", "2026-03-15T14:00:00Z")).toBe(-90);
  });

  it("returns 0 for same time", () => {
    expect(diffMinutes("2026-03-15T14:00:00Z", "2026-03-15T14:00:00Z")).toBe(0);
  });
});
