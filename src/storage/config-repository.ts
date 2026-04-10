import type {
  Availability,
  DayAvailability,
  DayOfWeek,
  FocusBlock,
  FocusTime,
  Preferences,
  UserConfig,
} from "../models/config.js";
import type { TaskPriority } from "../models/task.js";
import { ValidationError } from "../models/errors.js";
import { isValidTimeHHMM } from "../common/time.js";
import {
  DEFAULT_BUFFER_TIME_MINUTES,
  DEFAULT_PRIORITY,
  DEFAULT_DURATION_MINUTES,
  DEFAULT_SCHEDULING_HORIZON_WEEKS,
  DEFAULT_MINIMUM_BLOCK_MINUTES,
  DEFAULT_FOCUS_TIME_MINIMUM_BLOCK_MINUTES,
  MAX_SCHEDULING_HORIZON_WEEKS,
  MIN_MINIMUM_BLOCK_MINUTES,
  MAX_MINIMUM_BLOCK_MINUTES,
} from "../common/constants.js";
import type { Database } from "./database.js";

interface AvailabilityRow {
  day: number;
  start_time: string;
  end_time: string;
}

interface FocusBlockRow {
  day: number;
  start_time: string;
  end_time: string;
}

interface PreferenceRow {
  key: string;
  value: string;
}

export class ConfigRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  getAvailability(): Availability {
    const rows = this.db
      .prepare(
        "SELECT day, start_time, end_time FROM config_availability ORDER BY day ASC, start_time ASC",
      )
      .all() as AvailabilityRow[];

    return {
      windows: rows.map((row) => this.rowToAvailabilityWindow(row)),
    };
  }

  setAvailability(availability: Availability): void {
    for (const window of availability.windows) {
      this.validateDayAndTime(window.day, window.startTime, window.endTime);
    }

    this.db.transaction(() => {
      this.db.prepare("DELETE FROM config_availability").run();
      const insert = this.db.prepare(
        "INSERT INTO config_availability (day, start_time, end_time) VALUES (?, ?, ?)",
      );
      for (const window of availability.windows) {
        insert.run(window.day, window.startTime, window.endTime);
      }
    })();
  }

  getFocusTime(): FocusTime {
    const rows = this.db
      .prepare(
        "SELECT day, start_time, end_time FROM config_focus_time ORDER BY day ASC, start_time ASC",
      )
      .all() as FocusBlockRow[];

    const minRow = this.db
      .prepare(
        "SELECT value FROM config_preferences WHERE key = 'focus_time_minimum_block_minutes'",
      )
      .get() as PreferenceRow | undefined;

    return {
      blocks: rows.map((row) => this.rowToFocusBlock(row)),
      minimumBlockMinutes: minRow
        ? (JSON.parse(minRow.value) as number)
        : DEFAULT_FOCUS_TIME_MINIMUM_BLOCK_MINUTES,
    };
  }

  setFocusTime(focusTime: FocusTime): void {
    for (const block of focusTime.blocks) {
      this.validateDayAndTime(block.day, block.startTime, block.endTime);
    }

    this.db.transaction(() => {
      this.db.prepare("DELETE FROM config_focus_time").run();
      const insert = this.db.prepare(
        "INSERT INTO config_focus_time (day, start_time, end_time) VALUES (?, ?, ?)",
      );
      for (const block of focusTime.blocks) {
        insert.run(block.day, block.startTime, block.endTime);
      }
      this.db
        .prepare("INSERT OR REPLACE INTO config_preferences (key, value) VALUES (?, ?)")
        .run("focus_time_minimum_block_minutes", JSON.stringify(focusTime.minimumBlockMinutes));
    })();
  }

  getPreferences(): Preferences {
    const rows = this.db
      .prepare(
        "SELECT key, value FROM config_preferences WHERE key IN ('buffer_time_minutes', 'default_priority', 'default_duration', 'scheduling_horizon_weeks', 'minimum_block_minutes')",
      )
      .all() as PreferenceRow[];

    return this.preferencesFromRows(rows);
  }

  setPreferences(preferences: Partial<Preferences>): void {
    if (preferences.bufferTimeMinutes !== undefined && preferences.bufferTimeMinutes < 0) {
      throw new ValidationError("buffer time must be non-negative");
    }
    if (preferences.defaultDuration !== undefined && preferences.defaultDuration <= 0) {
      throw new ValidationError("default duration must be positive");
    }
    if (
      preferences.schedulingHorizonWeeks !== undefined &&
      (preferences.schedulingHorizonWeeks < 1 ||
        preferences.schedulingHorizonWeeks > MAX_SCHEDULING_HORIZON_WEEKS)
    ) {
      throw new ValidationError(
        `scheduling horizon must be between 1 and ${MAX_SCHEDULING_HORIZON_WEEKS} weeks`,
      );
    }
    if (
      preferences.minimumBlockMinutes !== undefined &&
      (preferences.minimumBlockMinutes < MIN_MINIMUM_BLOCK_MINUTES ||
        preferences.minimumBlockMinutes > MAX_MINIMUM_BLOCK_MINUTES)
    ) {
      throw new ValidationError(
        `minimum block must be between ${MIN_MINIMUM_BLOCK_MINUTES} and ${MAX_MINIMUM_BLOCK_MINUTES} minutes`,
      );
    }

    const keyMap: Record<string, string> = {
      bufferTimeMinutes: "buffer_time_minutes",
      defaultPriority: "default_priority",
      defaultDuration: "default_duration",
      schedulingHorizonWeeks: "scheduling_horizon_weeks",
      minimumBlockMinutes: "minimum_block_minutes",
    };

    const upsert = this.db.prepare(
      "INSERT OR REPLACE INTO config_preferences (key, value) VALUES (?, ?)",
    );

    for (const [prop, dbKey] of Object.entries(keyMap)) {
      const value = preferences[prop as keyof Preferences];
      if (value !== undefined) {
        upsert.run(dbKey, JSON.stringify(value));
      }
    }
  }

  getFullConfig(): UserConfig {
    return {
      availability: this.getAvailability(),
      focusTime: this.getFocusTime(),
      preferences: this.getPreferences(),
    };
  }

  private validateDayAndTime(day: number, startTime: string, endTime: string): void {
    if (day < 0 || day > 6 || !Number.isInteger(day)) {
      throw new ValidationError("invalid day of week");
    }
    if (!isValidTimeHHMM(startTime)) {
      throw new ValidationError("invalid time format");
    }
    if (!isValidTimeHHMM(endTime)) {
      throw new ValidationError("invalid time format");
    }
    if (endTime <= startTime) {
      throw new ValidationError("end time must be after start time");
    }
  }

  private rowToAvailabilityWindow(row: AvailabilityRow): DayAvailability {
    return this.rowToDayTimeRange(row) as DayAvailability;
  }

  private rowToFocusBlock(row: FocusBlockRow): FocusBlock {
    return this.rowToDayTimeRange(row) as FocusBlock;
  }

  private rowToDayTimeRange(row: { day: number; start_time: string; end_time: string }): {
    day: DayOfWeek;
    startTime: string;
    endTime: string;
  } {
    return {
      day: row.day as DayOfWeek,
      startTime: row.start_time,
      endTime: row.end_time,
    };
  }

  private parsePref<T>(map: Map<string, string>, key: string, fallback: T): T {
    const raw = map.get(key);
    return raw !== undefined ? (JSON.parse(raw) as T) : fallback;
  }

  private preferencesFromRows(rows: PreferenceRow[]): Preferences {
    const map = new Map(rows.map((r) => [r.key, r.value]));

    return {
      bufferTimeMinutes: this.parsePref(map, "buffer_time_minutes", DEFAULT_BUFFER_TIME_MINUTES),
      defaultPriority: this.parsePref(map, "default_priority", DEFAULT_PRIORITY as TaskPriority),
      defaultDuration: this.parsePref(map, "default_duration", DEFAULT_DURATION_MINUTES),
      schedulingHorizonWeeks: this.parsePref(
        map,
        "scheduling_horizon_weeks",
        DEFAULT_SCHEDULING_HORIZON_WEEKS,
      ),
      minimumBlockMinutes: this.parsePref(
        map,
        "minimum_block_minutes",
        DEFAULT_MINIMUM_BLOCK_MINUTES,
      ),
    };
  }
}
