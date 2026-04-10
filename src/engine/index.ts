export { DependencyResolver } from "./dependency-resolver.js";
export { ConflictDetector } from "./conflict-detector.js";
export type { CompetingTask } from "./conflict-detector.js";
export { Scheduler, buildAvailabilityMap, placeTask } from "./scheduler.js";
export type { AvailableSlot, SlotScore, EnergyConfig } from "./scheduler.js";
export { ReplanCoordinator } from "./replan-coordinator.js";
export { RecurrenceManager } from "./recurrence-manager.js";
