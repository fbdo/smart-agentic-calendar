import type { Task, TaskPriority, TaskStatus } from "../models/task.js";
import { ValidationError, NotFoundError, InvalidStateError } from "../models/errors.js";
import { generateId } from "../common/id.js";
import { nowUTC, isValidISO8601 } from "../common/time.js";
import type { Database } from "./database.js";
import type { Logger } from "../common/logger.js";

export interface TaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  deadlineBefore?: string;
  deadlineAfter?: string;
  category?: string;
}

type TaskInput = Omit<Task, "id" | "createdAt" | "updatedAt" | "status" | "actualDuration">;

type TaskUpdates = Partial<
  Pick<Task, "title" | "description" | "duration" | "deadline" | "priority" | "category" | "tags">
>;

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

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["scheduled", "cancelled", "at_risk"],
  scheduled: ["completed", "cancelled", "at_risk", "pending"],
  at_risk: ["scheduled", "cancelled", "completed"],
  completed: ["completed"],
  cancelled: [],
};

export class TaskRepository {
  private readonly db: Database;
  private readonly logger: Logger;

  constructor(db: Database, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }

  create(input: TaskInput): Task {
    const title = input.title.trim();
    if (!title) {
      throw new ValidationError("title is required");
    }
    if (input.duration <= 0) {
      throw new ValidationError("duration must be a positive number of minutes");
    }
    if (input.deadline !== null && !isValidISO8601(input.deadline)) {
      throw new ValidationError("deadline must be a valid ISO 8601 date");
    }

    const now = nowUTC();
    const task: Task = {
      id: generateId(),
      title,
      description: input.description,
      duration: input.duration,
      deadline: input.deadline,
      priority: input.priority,
      status: "pending",
      category: input.category,
      tags: input.tags,
      isRecurring: input.isRecurring,
      recurrenceTemplateId: input.recurrenceTemplateId,
      actualDuration: null,
      createdAt: now,
      updatedAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO tasks (id, title, description, duration, deadline, priority, status, category, tags, is_recurring, recurrence_template_id, actual_duration, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        task.id,
        task.title,
        task.description,
        task.duration,
        task.deadline,
        task.priority,
        task.status,
        task.category,
        JSON.stringify(task.tags),
        task.isRecurring ? 1 : 0,
        task.recurrenceTemplateId,
        task.actualDuration,
        task.createdAt,
        task.updatedAt,
      );

    return task;
  }

  findById(id: string): Task | undefined {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
    if (!row) return undefined;
    return this.rowToTask(row);
  }

  findAll(filters?: TaskFilters): Task[] {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters?.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }
    if (filters?.priority) {
      clauses.push("priority = ?");
      params.push(filters.priority);
    }
    if (filters?.deadlineBefore) {
      clauses.push("deadline IS NOT NULL AND deadline < ?");
      params.push(filters.deadlineBefore);
    }
    if (filters?.deadlineAfter) {
      clauses.push("deadline IS NOT NULL AND deadline > ?");
      params.push(filters.deadlineAfter);
    }
    if (filters?.category) {
      clauses.push("category = ?");
      params.push(filters.category);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const sql = `SELECT * FROM tasks ${where}
      ORDER BY
        CASE priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 WHEN 'P4' THEN 4 END ASC,
        CASE WHEN deadline IS NULL THEN 1 ELSE 0 END ASC,
        deadline ASC,
        created_at ASC`;

    const rows = this.db.prepare(sql).all(...params) as TaskRow[];
    return rows.map((row) => this.rowToTask(row));
  }

  update(id: string, updates: TaskUpdates): Task {
    const current = this.findById(id);
    if (!current) {
      throw new NotFoundError("Task", id);
    }
    if (current.status === "completed" || current.status === "cancelled") {
      throw new InvalidStateError(`cannot modify ${current.status} task`);
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (updates.title !== undefined) {
      setClauses.push("title = ?");
      params.push(updates.title.trim());
    }
    if (updates.description !== undefined) {
      setClauses.push("description = ?");
      params.push(updates.description);
    }
    if (updates.duration !== undefined) {
      setClauses.push("duration = ?");
      params.push(updates.duration);
    }
    if (updates.deadline !== undefined) {
      setClauses.push("deadline = ?");
      params.push(updates.deadline);
    }
    if (updates.priority !== undefined) {
      setClauses.push("priority = ?");
      params.push(updates.priority);
    }
    if (updates.category !== undefined) {
      setClauses.push("category = ?");
      params.push(updates.category);
    }
    if (updates.tags !== undefined) {
      setClauses.push("tags = ?");
      params.push(JSON.stringify(updates.tags));
    }

    const now = nowUTC();
    setClauses.push("updated_at = ?");
    params.push(now);
    params.push(id);

    this.db.prepare(`UPDATE tasks SET ${setClauses.join(", ")} WHERE id = ?`).run(...params);

    return this.findById(id) as Task;
  }

  updateStatus(id: string, status: TaskStatus): Task {
    const row = this.db.prepare("SELECT status FROM tasks WHERE id = ?").get(id) as
      | { status: string }
      | undefined;

    if (!row) {
      throw new NotFoundError("Task", id);
    }

    const currentStatus = row.status;

    if (currentStatus === status && status === "completed") {
      return this.findById(id) as Task;
    }

    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(status)) {
      throw new InvalidStateError(`cannot transition from ${currentStatus} to ${status}`);
    }

    this.db
      .prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, nowUTC(), id);

    return this.findById(id) as Task;
  }

  delete(id: string): void {
    const row = this.db.prepare("SELECT status FROM tasks WHERE id = ?").get(id) as
      | { status: string }
      | undefined;

    if (!row) {
      throw new NotFoundError("Task", id);
    }
    if (row.status === "completed" || row.status === "cancelled") {
      throw new InvalidStateError(`cannot modify ${row.status} task`);
    }

    this.db.transaction(() => {
      this.db
        .prepare("UPDATE tasks SET status = 'cancelled', updated_at = ? WHERE id = ?")
        .run(nowUTC(), id);
      this.db
        .prepare("DELETE FROM dependencies WHERE task_id = ? OR depends_on_id = ?")
        .run(id, id);
    })();
  }

  addDependency(taskId: string, dependsOnId: string): void {
    const rows = this.db
      .prepare("SELECT id FROM tasks WHERE id IN (?, ?)")
      .all(taskId, dependsOnId) as { id: string }[];

    const foundIds = new Set(rows.map((r) => r.id));
    if (!foundIds.has(taskId)) {
      throw new NotFoundError("Task", taskId);
    }
    if (!foundIds.has(dependsOnId)) {
      throw new NotFoundError("Task", dependsOnId);
    }

    this.db
      .prepare("INSERT INTO dependencies (task_id, depends_on_id) VALUES (?, ?)")
      .run(taskId, dependsOnId);
  }

  removeDependency(taskId: string, dependsOnId: string): void {
    const result = this.db
      .prepare("DELETE FROM dependencies WHERE task_id = ? AND depends_on_id = ?")
      .run(taskId, dependsOnId);

    if (result.changes === 0) {
      throw new NotFoundError("Dependency", `${taskId} → ${dependsOnId}`);
    }
  }

  getDependencies(taskId: string): Task[] {
    const rows = this.db
      .prepare(
        `SELECT t.* FROM tasks t
         INNER JOIN dependencies d ON t.id = d.depends_on_id
         WHERE d.task_id = ?`,
      )
      .all(taskId) as TaskRow[];

    return rows.map((row) => this.rowToTask(row));
  }

  getDependents(taskId: string): Task[] {
    const rows = this.db
      .prepare(
        `SELECT t.* FROM tasks t
         INNER JOIN dependencies d ON t.id = d.task_id
         WHERE d.depends_on_id = ?`,
      )
      .all(taskId) as TaskRow[];

    return rows.map((row) => this.rowToTask(row));
  }

  recordActualDuration(id: string, actualMinutes: number): void {
    const result = this.db
      .prepare("UPDATE tasks SET actual_duration = ?, updated_at = ? WHERE id = ?")
      .run(actualMinutes, nowUTC(), id);

    if (result.changes === 0) {
      throw new NotFoundError("Task", id);
    }
  }

  private rowToTask(row: TaskRow): Task {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      duration: row.duration,
      deadline: row.deadline,
      priority: row.priority as TaskPriority,
      status: row.status as TaskStatus,
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
