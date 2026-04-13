import type { Task } from "../models/task.js";
import type { CompletedTaskRecord, DurationRecord, CategorySummary } from "../models/analytics.js";
import type { Database } from "./database.js";
import type { Logger } from "../common/logger.js";

interface CompletedTaskRow {
  task_id: string;
  title: string;
  category: string | null;
  estimated_duration: number;
  actual_duration: number | null;
  completed_at: string;
  was_on_time: number;
}

interface DurationRow {
  task_id: string;
  category: string | null;
  estimated_minutes: number;
  actual_minutes: number;
}

interface CategoryRow {
  category: string;
  total_minutes: number;
  task_count: number;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  duration: number;
  deadline: string | null;
  priority: string;
  status: string;
  category: string | null;
  tags: string;
  is_recurring: number;
  recurrence_template_id: string | null;
  actual_duration: number | null;
  created_at: string;
  updated_at: string;
}

export class AnalyticsRepository {
  private readonly db: Database;
  private readonly logger: Logger;

  constructor(db: Database, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }

  getCompletedTasks(start: string, end: string): CompletedTaskRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id AS task_id, title, category, duration AS estimated_duration, actual_duration, updated_at AS completed_at,
          CASE WHEN deadline IS NOT NULL AND updated_at <= deadline THEN 1 ELSE 0 END AS was_on_time
         FROM tasks
         WHERE status = 'completed' AND updated_at >= ? AND updated_at < ?
         ORDER BY updated_at ASC`,
      )
      .all(start, end) as CompletedTaskRow[];

    return rows.map((row) => this.rowToCompletedTaskRecord(row));
  }

  getOverdueTasks(referenceTime: string): Task[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM tasks
         WHERE deadline IS NOT NULL AND deadline < ? AND status NOT IN ('completed', 'cancelled')
         ORDER BY deadline ASC`,
      )
      .all(referenceTime) as TaskRow[];

    return rows.map((row) => this.rowToTask(row));
  }

  getCancelledTasks(start: string, end: string): Task[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM tasks
         WHERE status = 'cancelled' AND updated_at >= ? AND updated_at < ?
         ORDER BY updated_at ASC`,
      )
      .all(start, end) as TaskRow[];

    return rows.map((row) => this.rowToTask(row));
  }

  getTasksByCategory(start: string, end: string): CategorySummary[] {
    const rows = this.db
      .prepare(
        `SELECT
          COALESCE(category, 'uncategorized') AS category,
          SUM(COALESCE(actual_duration, duration)) AS total_minutes,
          COUNT(*) AS task_count
         FROM tasks
         WHERE status = 'completed' AND updated_at >= ? AND updated_at < ?
         GROUP BY COALESCE(category, 'uncategorized')
         ORDER BY total_minutes DESC`,
      )
      .all(start, end) as CategoryRow[];

    return rows.map((row) => this.rowToCategorySummary(row));
  }

  getDurationRecords(start: string, end: string): DurationRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id AS task_id, category, duration AS estimated_minutes, actual_duration AS actual_minutes
         FROM tasks
         WHERE status = 'completed' AND actual_duration IS NOT NULL AND updated_at >= ? AND updated_at < ?
         ORDER BY updated_at ASC`,
      )
      .all(start, end) as DurationRow[];

    return rows.map((row) => this.rowToDurationRecord(row));
  }

  private rowToCompletedTaskRecord(row: CompletedTaskRow): CompletedTaskRecord {
    return {
      taskId: row.task_id,
      title: row.title,
      category: row.category,
      estimatedDuration: row.estimated_duration,
      actualDuration: row.actual_duration,
      completedAt: row.completed_at,
      wasOnTime: !!row.was_on_time,
    };
  }

  private rowToDurationRecord(row: DurationRow): DurationRecord {
    return {
      taskId: row.task_id,
      category: row.category,
      estimatedMinutes: row.estimated_minutes,
      actualMinutes: row.actual_minutes,
    };
  }

  private rowToCategorySummary(row: CategoryRow): CategorySummary {
    return {
      category: row.category,
      totalMinutes: row.total_minutes,
      taskCount: row.task_count,
    };
  }

  private rowToTask(row: TaskRow): Task {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      duration: row.duration,
      deadline: row.deadline,
      priority: row.priority as Task["priority"],
      status: row.status as Task["status"],
      category: row.category,
      tags: JSON.parse(row.tags) as string[],
      isRecurring: !!row.is_recurring,
      recurrenceTemplateId: row.recurrence_template_id,
      actualDuration: row.actual_duration,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
