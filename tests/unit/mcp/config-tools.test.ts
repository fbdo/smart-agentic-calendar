import { describe, it, expect, vi } from "vitest";
import { ConfigTools } from "../../../src/mcp/tools/config-tools.js";
import type { ConfigRepository } from "../../../src/storage/config-repository.js";
import type { ReplanCoordinator } from "../../../src/engine/replan-coordinator.js";
import type { UserConfig } from "../../../src/models/config.js";

const defaultConfig: UserConfig = {
  availability: {
    windows: [{ day: 1, startTime: "09:00", endTime: "17:00" }],
  },
  focusTime: {
    blocks: [{ day: 1, startTime: "09:00", endTime: "12:00" }],
    minimumBlockMinutes: 60,
  },
  preferences: {
    bufferTimeMinutes: 15,
    defaultPriority: "P3",
    defaultDuration: 60,
    schedulingHorizonWeeks: 4,
    minimumBlockMinutes: 30,
  },
};

function createMocks() {
  const configRepo = {
    setAvailability: vi.fn(),
    setFocusTime: vi.fn(),
    setPreferences: vi.fn(),
    getPreferences: vi.fn().mockReturnValue(defaultConfig.preferences),
    getFullConfig: vi.fn().mockReturnValue(defaultConfig),
  } as unknown as ConfigRepository;

  const replanCoordinator = {
    requestReplan: vi.fn(),
  } as unknown as ReplanCoordinator;

  const tools = new ConfigTools(configRepo, replanCoordinator);
  return { tools, configRepo, replanCoordinator };
}

describe("ConfigTools", () => {
  describe("setAvailability", () => {
    it("saves via configRepo.setAvailability, triggers requestReplan, returns confirmation", () => {
      const { tools, configRepo, replanCoordinator } = createMocks();
      const result = tools.setAvailability({
        windows: [{ day: 1, start_time: "09:00", end_time: "17:00" }],
      });

      expect(configRepo.setAvailability).toHaveBeenCalled();
      expect(replanCoordinator.requestReplan).toHaveBeenCalled();
      expect(result.windows).toHaveLength(1);
      expect(result.message).toBe("Availability updated successfully");
    });
  });

  describe("setFocusTime", () => {
    it("saves via configRepo.setFocusTime, triggers requestReplan, returns confirmation", () => {
      const { tools, configRepo, replanCoordinator } = createMocks();
      const result = tools.setFocusTime({
        blocks: [{ day: 1, start_time: "09:00", end_time: "12:00" }],
      });

      expect(configRepo.setFocusTime).toHaveBeenCalled();
      expect(replanCoordinator.requestReplan).toHaveBeenCalled();
      expect(result.blocks).toHaveLength(1);
      expect(result.minimum_block_minutes).toBe(60);
      expect(result.message).toBe("Focus time updated successfully");
    });
  });

  describe("setPreferences", () => {
    it("saves via configRepo.setPreferences (partial merge), triggers requestReplan, returns full preferences", () => {
      const { tools, configRepo, replanCoordinator } = createMocks();
      const result = tools.setPreferences({
        buffer_time_minutes: 10,
      });

      expect(configRepo.setPreferences).toHaveBeenCalled();
      expect(replanCoordinator.requestReplan).toHaveBeenCalled();
      // Returns full preferences
      expect(result.buffer_time_minutes).toBe(15); // from mock getPreferences
      expect(result.default_priority).toBe("P3");
    });
  });

  describe("getPreferences", () => {
    it("returns full config (availability + focus time + preferences), no replan triggered", () => {
      const { tools, configRepo, replanCoordinator } = createMocks();
      const result = tools.getPreferences();

      expect(configRepo.getFullConfig).toHaveBeenCalled();
      expect(replanCoordinator.requestReplan).not.toHaveBeenCalled();
      expect(result.availability).toBeDefined();
      expect(result.focus_time).toBeDefined();
      expect(result.preferences).toBeDefined();
    });
  });
});
