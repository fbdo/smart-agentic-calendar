import type { Event } from "../models/event.js";
import { ValidationError, NotFoundError } from "../models/errors.js";
import { generateId } from "../common/id.js";
import { nowUTC } from "../common/time.js";
import type { Database } from "./database.js";
import type { Logger } from "../common/logger.js";

interface EventRow {
  id: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  is_all_day: number;
  date: string | null;
  created_at: string;
  updated_at: string;
}

type EventInput = Omit<Event, "id" | "createdAt" | "updatedAt">;
type EventUpdates = Partial<Pick<Event, "title" | "startTime" | "endTime" | "isAllDay" | "date">>;

export class EventRepository {
  private readonly db: Database;
  private readonly logger: Logger;

  constructor(db: Database, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }

  create(input: EventInput): Event {
    const title = input.title.trim();
    if (!title) {
      throw new ValidationError("title is required");
    }

    if (!input.isAllDay) {
      if (!input.startTime) {
        throw new ValidationError("start time is required");
      }
      if (!input.endTime) {
        throw new ValidationError("end time must be after start time");
      }
      if (input.endTime <= input.startTime) {
        throw new ValidationError("end time must be after start time");
      }
    } else {
      if (!input.date) {
        throw new ValidationError("date is required for all-day events");
      }
    }

    const now = nowUTC();
    const event: Event = {
      id: generateId(),
      title,
      startTime: input.startTime,
      endTime: input.endTime,
      isAllDay: input.isAllDay,
      date: input.date,
      createdAt: now,
      updatedAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO events (id, title, start_time, end_time, is_all_day, date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.title,
        event.startTime,
        event.endTime,
        event.isAllDay ? 1 : 0,
        event.date,
        event.createdAt,
        event.updatedAt,
      );

    return event;
  }

  findById(id: string): Event | undefined {
    const row = this.db.prepare("SELECT * FROM events WHERE id = ?").get(id) as
      | EventRow
      | undefined;
    if (!row) return undefined;
    return this.rowToEvent(row);
  }

  findInRange(start: string, end: string): Event[] {
    const startDate = start.substring(0, 10);
    const endDate = end.substring(0, 10);

    const rows = this.db
      .prepare(
        `SELECT * FROM events
         WHERE
           (is_all_day = 0 AND start_time < ? AND end_time > ?)
           OR
           (is_all_day = 1 AND date >= ? AND date <= ?)
         ORDER BY
           CASE WHEN is_all_day = 1 THEN date ELSE start_time END ASC`,
      )
      .all(end, start, startDate, endDate) as EventRow[];

    return rows.map((row) => this.rowToEvent(row));
  }

  update(id: string, updates: EventUpdates): Event {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (updates.title !== undefined) {
      setClauses.push("title = ?");
      params.push(updates.title.trim());
    }
    if (updates.startTime !== undefined) {
      setClauses.push("start_time = ?");
      params.push(updates.startTime);
    }
    if (updates.endTime !== undefined) {
      setClauses.push("end_time = ?");
      params.push(updates.endTime);
    }
    if (updates.isAllDay !== undefined) {
      setClauses.push("is_all_day = ?");
      params.push(updates.isAllDay ? 1 : 0);
    }
    if (updates.date !== undefined) {
      setClauses.push("date = ?");
      params.push(updates.date);
    }

    setClauses.push("updated_at = ?");
    params.push(nowUTC());
    params.push(id);

    const result = this.db
      .prepare(`UPDATE events SET ${setClauses.join(", ")} WHERE id = ?`)
      .run(...params);

    if (result.changes === 0) {
      throw new NotFoundError("Event", id);
    }

    return this.findById(id) as Event;
  }

  delete(id: string): void {
    const result = this.db.prepare("DELETE FROM events WHERE id = ?").run(id);
    if (result.changes === 0) {
      throw new NotFoundError("Event", id);
    }
  }

  private rowToEvent(row: EventRow): Event {
    return {
      id: row.id,
      title: row.title,
      startTime: row.start_time,
      endTime: row.end_time,
      isAllDay: !!row.is_all_day,
      date: row.date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
