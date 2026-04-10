export const DEFAULT_BUFFER_TIME_MINUTES = 15;
export const DEFAULT_PRIORITY = "P3" as const;
export const DEFAULT_DURATION_MINUTES = 60;
export const DEFAULT_SCHEDULING_HORIZON_WEEKS = 4;
export const DEFAULT_MINIMUM_BLOCK_MINUTES = 30;
export const DEFAULT_FOCUS_TIME_MINIMUM_BLOCK_MINUTES = 60;

export const VALID_PRIORITIES = ["P1", "P2", "P3", "P4"] as const;
export const VALID_STATUSES = [
  "pending",
  "scheduled",
  "completed",
  "cancelled",
  "at_risk",
] as const;
export const VALID_PERIODS = ["day", "week", "month"] as const;

export const MAX_SCHEDULING_HORIZON_WEEKS = 12;
export const MIN_MINIMUM_BLOCK_MINUTES = 15;
export const MAX_MINIMUM_BLOCK_MINUTES = 120;
