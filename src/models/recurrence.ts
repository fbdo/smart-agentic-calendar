import { type Task } from "./task.js";

export interface RecurrenceTemplate {
  id: string;
  taskData: Omit<
    Task,
    | "id"
    | "createdAt"
    | "updatedAt"
    | "status"
    | "actualDuration"
    | "isRecurring"
    | "recurrenceTemplateId"
  >;
  rrule: string;
  isActive: boolean;
  createdAt: string;
}

export interface RecurrenceInstance {
  id: string;
  templateId: string;
  taskId: string;
  scheduledDate: string;
  isException: boolean;
}

export interface RecurrenceException {
  templateId: string;
  date: string;
  type: "skip" | "modify";
  overrides: Partial<Task> | null;
}
