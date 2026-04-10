export type TaskPriority = "P1" | "P2" | "P3" | "P4";

export type TaskStatus = "pending" | "scheduled" | "completed" | "cancelled" | "at_risk";

export const VALID_TASK_PRIORITIES: TaskPriority[] = ["P1", "P2", "P3", "P4"];

export const VALID_TASK_STATUSES: TaskStatus[] = [
  "pending",
  "scheduled",
  "completed",
  "cancelled",
  "at_risk",
];

export interface Task {
  id: string;
  title: string;
  description: string | null;
  duration: number;
  deadline: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  category: string | null;
  tags: string[];
  isRecurring: boolean;
  recurrenceTemplateId: string | null;
  actualDuration: number | null;
  createdAt: string;
  updatedAt: string;
}
