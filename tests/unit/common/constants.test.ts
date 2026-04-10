import { describe, it, expect } from "vitest";
import {
  DEFAULT_BUFFER_TIME_MINUTES,
  DEFAULT_PRIORITY,
  DEFAULT_DURATION_MINUTES,
  DEFAULT_SCHEDULING_HORIZON_WEEKS,
  DEFAULT_MINIMUM_BLOCK_MINUTES,
  DEFAULT_FOCUS_TIME_MINIMUM_BLOCK_MINUTES,
  VALID_PRIORITIES,
  VALID_STATUSES,
  VALID_PERIODS,
  MAX_SCHEDULING_HORIZON_WEEKS,
  MIN_MINIMUM_BLOCK_MINUTES,
  MAX_MINIMUM_BLOCK_MINUTES,
} from "../../../src/common/constants.js";

describe("Constants", () => {
  it("has correct default values", () => {
    expect(DEFAULT_BUFFER_TIME_MINUTES).toBe(15);
    expect(DEFAULT_PRIORITY).toBe("P3");
    expect(DEFAULT_DURATION_MINUTES).toBe(60);
    expect(DEFAULT_SCHEDULING_HORIZON_WEEKS).toBe(4);
    expect(DEFAULT_MINIMUM_BLOCK_MINUTES).toBe(30);
    expect(DEFAULT_FOCUS_TIME_MINIMUM_BLOCK_MINUTES).toBe(60);
  });

  it("has correct valid value arrays", () => {
    expect(VALID_PRIORITIES).toEqual(["P1", "P2", "P3", "P4"]);
    expect(VALID_STATUSES).toEqual(["pending", "scheduled", "completed", "cancelled", "at_risk"]);
    expect(VALID_PERIODS).toEqual(["day", "week", "month"]);
  });

  it("has correct boundary values", () => {
    expect(MAX_SCHEDULING_HORIZON_WEEKS).toBe(12);
    expect(MIN_MINIMUM_BLOCK_MINUTES).toBe(15);
    expect(MAX_MINIMUM_BLOCK_MINUTES).toBe(120);
  });
});
