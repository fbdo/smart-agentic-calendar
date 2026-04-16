import type { TimeBlock, ScheduleStatus } from "../models/schedule.js";
import { nowUTC } from "../common/time.js";
import type { Database } from "./database.js";
import type { Logger } from "../common/logger.js";

interface TimeBlockRow {
  id: string;
  task_id: string;
  start_time: string;
  end_time: string;
  date: string;
  block_index: number;
  total_blocks: number;
}

export class ScheduleRepository {
  private readonly db: Database;
  private readonly logger: Logger;

  constructor(db: Database, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }

  saveSchedule(timeBlocks: TimeBlock[]): void {
    const insert = this.db.prepare(
      "INSERT INTO time_blocks (id, task_id, start_time, end_time, date, block_index, total_blocks) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    this.db.transaction(() => {
      for (const block of timeBlocks) {
        insert.run(
          block.id,
          block.taskId,
          block.startTime,
          block.endTime,
          block.date,
          block.blockIndex,
          block.totalBlocks,
        );
      }
    })();
  }

  getSchedule(start: string, end: string): TimeBlock[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM time_blocks WHERE start_time < ? AND end_time > ? ORDER BY start_time ASC",
      )
      .all(end, start) as TimeBlockRow[];

    return rows.map((row) => this.rowToTimeBlock(row));
  }

  getScheduleStatus(): ScheduleStatus {
    const row = this.db.prepare("SELECT status FROM schedule_status WHERE id = 1").get() as {
      status: string;
    };
    return row.status as ScheduleStatus;
  }

  setScheduleStatus(status: ScheduleStatus): void {
    if (status === "up_to_date") {
      this.db
        .prepare(
          "UPDATE schedule_status SET status = 'up_to_date', last_replan_at = ? WHERE id = 1",
        )
        .run(nowUTC());
    } else {
      this.db
        .prepare("UPDATE schedule_status SET status = 'replan_in_progress' WHERE id = 1")
        .run();
    }
  }

  clearSchedule(): void {
    this.db.prepare("DELETE FROM time_blocks").run();
  }

  private rowToTimeBlock(row: TimeBlockRow): TimeBlock {
    return {
      id: row.id,
      taskId: row.task_id,
      startTime: row.start_time,
      endTime: row.end_time,
      date: row.date,
      blockIndex: row.block_index,
      totalBlocks: row.total_blocks,
    };
  }
}
