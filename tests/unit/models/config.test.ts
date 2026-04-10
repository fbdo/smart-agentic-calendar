import { describe, it, expect } from "vitest";
import {
  type DayOfWeek,
  type Availability,
  type FocusTime,
  type Preferences,
  type UserConfig,
} from "../../../src/models/config.js";

describe("Config types", () => {
  it("allows constructing Availability", () => {
    const availability: Availability = {
      windows: [
        { day: 1 as DayOfWeek, startTime: "09:00", endTime: "17:00" },
        { day: 2 as DayOfWeek, startTime: "09:00", endTime: "17:00" },
      ],
    };
    expect(availability.windows).toHaveLength(2);
  });

  it("allows constructing FocusTime", () => {
    const focusTime: FocusTime = {
      blocks: [{ day: 1 as DayOfWeek, startTime: "09:00", endTime: "11:00" }],
      minimumBlockMinutes: 60,
    };
    expect(focusTime.minimumBlockMinutes).toBe(60);
  });

  it("allows constructing Preferences with defaults", () => {
    const prefs: Preferences = {
      bufferTimeMinutes: 15,
      defaultPriority: "P3",
      defaultDuration: 60,
      schedulingHorizonWeeks: 4,
      minimumBlockMinutes: 30,
    };
    expect(prefs.bufferTimeMinutes).toBe(15);
  });

  it("allows constructing a full UserConfig", () => {
    const config: UserConfig = {
      availability: { windows: [] },
      focusTime: { blocks: [], minimumBlockMinutes: 60 },
      preferences: {
        bufferTimeMinutes: 15,
        defaultPriority: "P3",
        defaultDuration: 60,
        schedulingHorizonWeeks: 4,
        minimumBlockMinutes: 30,
      },
    };
    expect(config.availability.windows).toEqual([]);
  });
});
