import { type TaskPriority } from "./task.js";

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface DayAvailability {
  day: DayOfWeek;
  startTime: string;
  endTime: string;
}

export interface Availability {
  windows: DayAvailability[];
}

export interface FocusBlock {
  day: DayOfWeek;
  startTime: string;
  endTime: string;
}

export interface FocusTime {
  blocks: FocusBlock[];
  minimumBlockMinutes: number;
}

export interface Preferences {
  bufferTimeMinutes: number;
  defaultPriority: TaskPriority;
  defaultDuration: number;
  schedulingHorizonWeeks: number;
  minimumBlockMinutes: number;
}

export interface UserConfig {
  availability: Availability;
  focusTime: FocusTime;
  preferences: Preferences;
}
