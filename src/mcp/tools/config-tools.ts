import type { ConfigRepository } from "../../storage/config-repository.js";
import type { ReplanCoordinator } from "../../engine/replan-coordinator.js";
import type { Logger } from "../../common/logger.js";
import {
  validateSetAvailabilityInput,
  validateSetFocusTimeInput,
  validateSetPreferencesInput,
  mapSetAvailabilityInput,
  mapSetFocusTimeInput,
  mapSetPreferencesInput,
  mapAvailabilityOutput,
  mapFocusTimeOutput,
  mapPreferencesOutput,
  type SetAvailabilityMcpInput,
  type SetFocusTimeMcpInput,
  type SetPreferencesMcpInput,
} from "../validators.js";

export class ConfigTools {
  private readonly configRepo: ConfigRepository;
  private readonly replanCoordinator: ReplanCoordinator;
  private readonly logger: Logger;

  constructor(configRepo: ConfigRepository, replanCoordinator: ReplanCoordinator, logger: Logger) {
    this.configRepo = configRepo;
    this.replanCoordinator = replanCoordinator;
    this.logger = logger;
  }

  setAvailability(input: SetAvailabilityMcpInput) {
    validateSetAvailabilityInput(input);
    const availability = mapSetAvailabilityInput(input);
    this.configRepo.setAvailability(availability);

    this.replanCoordinator.requestReplan();

    return {
      windows: input.windows,
      message: "Availability updated successfully",
    };
  }

  setFocusTime(input: SetFocusTimeMcpInput) {
    validateSetFocusTimeInput(input);
    const focusTime = mapSetFocusTimeInput(input);
    this.configRepo.setFocusTime(focusTime);

    this.replanCoordinator.requestReplan();

    return {
      blocks: input.blocks,
      minimum_block_minutes: focusTime.minimumBlockMinutes,
      message: "Focus time updated successfully",
    };
  }

  setPreferences(input: SetPreferencesMcpInput) {
    validateSetPreferencesInput(input);
    const partialPrefs = mapSetPreferencesInput(input);
    this.configRepo.setPreferences(partialPrefs);

    this.replanCoordinator.requestReplan();

    const preferences = this.configRepo.getPreferences();
    return mapPreferencesOutput(preferences);
  }

  getPreferences() {
    const config = this.configRepo.getFullConfig();
    return {
      availability: mapAvailabilityOutput(config.availability),
      focus_time: mapFocusTimeOutput(config.focusTime),
      preferences: mapPreferencesOutput(config.preferences),
    };
  }
}
