import type { Task } from "../models/task.js";
import type {
  RecurrenceTemplate,
  RecurrenceInstance,
  RecurrenceException,
} from "../models/recurrence.js";
import { NotFoundError } from "../models/errors.js";
import { generateId } from "../common/id.js";
import { nowUTC } from "../common/time.js";
import type { Database } from "./database.js";
import type { Logger } from "../common/logger.js";

interface TemplateRow {
  id: string;
  task_data: string;
  rrule: string;
  is_active: number;
  created_at: string;
}

interface InstanceRow {
  id: string;
  template_id: string;
  task_id: string;
  scheduled_date: string;
  is_exception: number;
}

interface ExceptionRow {
  template_id: string;
  date: string;
  type: string;
  overrides: string | null;
}

type TemplateTaskData = RecurrenceTemplate["taskData"];

export class RecurrenceRepository {
  private readonly db: Database;
  private readonly logger: Logger;

  constructor(db: Database, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }

  createTemplate(
    input: Omit<RecurrenceTemplate, "id" | "createdAt" | "isActive">,
  ): RecurrenceTemplate {
    const template: RecurrenceTemplate = {
      id: generateId(),
      taskData: input.taskData,
      rrule: input.rrule,
      isActive: true,
      createdAt: nowUTC(),
    };

    this.db
      .prepare(
        "INSERT INTO recurrence_templates (id, task_data, rrule, is_active, created_at) VALUES (?, ?, ?, 1, ?)",
      )
      .run(template.id, JSON.stringify(template.taskData), template.rrule, template.createdAt);

    return template;
  }

  getTemplate(id: string): RecurrenceTemplate | undefined {
    const row = this.db.prepare("SELECT * FROM recurrence_templates WHERE id = ?").get(id) as
      | TemplateRow
      | undefined;

    if (!row) return undefined;
    return this.rowToTemplate(row);
  }

  getActiveTemplates(): RecurrenceTemplate[] {
    const rows = this.db
      .prepare("SELECT * FROM recurrence_templates WHERE is_active = 1 ORDER BY created_at ASC")
      .all() as TemplateRow[];

    return rows.map((row) => this.rowToTemplate(row));
  }

  deleteTemplate(id: string): void {
    const result = this.db
      .prepare("UPDATE recurrence_templates SET is_active = 0 WHERE id = ?")
      .run(id);

    if (result.changes === 0) {
      throw new NotFoundError("RecurrenceTemplate", id);
    }
  }

  createInstance(input: Omit<RecurrenceInstance, "id">): RecurrenceInstance {
    const instance: RecurrenceInstance = {
      id: generateId(),
      templateId: input.templateId,
      taskId: input.taskId,
      scheduledDate: input.scheduledDate,
      isException: input.isException,
    };

    this.db
      .prepare(
        "INSERT INTO recurrence_instances (id, template_id, task_id, scheduled_date, is_exception) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        instance.id,
        instance.templateId,
        instance.taskId,
        instance.scheduledDate,
        instance.isException ? 1 : 0,
      );

    return instance;
  }

  getInstances(templateId: string, start: string, end: string): RecurrenceInstance[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM recurrence_instances WHERE template_id = ? AND scheduled_date >= ? AND scheduled_date <= ? ORDER BY scheduled_date ASC",
      )
      .all(templateId, start, end) as InstanceRow[];

    return rows.map((row) => this.rowToInstance(row));
  }

  addException(
    templateId: string,
    date: string,
    exception: Omit<RecurrenceException, "templateId" | "date">,
  ): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO recurrence_exceptions (template_id, date, type, overrides) VALUES (?, ?, ?, ?)",
      )
      .run(
        templateId,
        date,
        exception.type,
        exception.overrides ? JSON.stringify(exception.overrides) : null,
      );
  }

  getExceptions(templateId: string): RecurrenceException[] {
    const rows = this.db
      .prepare("SELECT * FROM recurrence_exceptions WHERE template_id = ? ORDER BY date ASC")
      .all(templateId) as ExceptionRow[];

    return rows.map((row) => this.rowToException(row));
  }

  private rowToTemplate(row: TemplateRow): RecurrenceTemplate {
    return {
      id: row.id,
      taskData: JSON.parse(row.task_data) as TemplateTaskData,
      rrule: row.rrule,
      isActive: !!row.is_active,
      createdAt: row.created_at,
    };
  }

  private rowToInstance(row: InstanceRow): RecurrenceInstance {
    return {
      id: row.id,
      templateId: row.template_id,
      taskId: row.task_id,
      scheduledDate: row.scheduled_date,
      isException: !!row.is_exception,
    };
  }

  private rowToException(row: ExceptionRow): RecurrenceException {
    return {
      templateId: row.template_id,
      date: row.date,
      type: row.type as "skip" | "modify",
      overrides: row.overrides ? (JSON.parse(row.overrides) as Partial<Task>) : null,
    };
  }
}
