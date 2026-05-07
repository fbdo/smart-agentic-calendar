import type { Task, TaskPriority, TaskStatus } from "../models/task.js";

export interface TaskRow {
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

export function rowToTask(row: TaskRow): Task {
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
