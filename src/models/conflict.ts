import { type TaskPriority } from "./task.js";

export type ConflictReason = "insufficient_time" | "dependency_chain" | "overdue";

export interface DeprioritizationSuggestion {
  taskId: string;
  currentPriority: TaskPriority;
  freedMinutes: number;
}

export interface Conflict {
  taskId: string;
  reason: ConflictReason;
  deadline: string | null;
  requiredMinutes: number;
  availableMinutes: number;
  competingTaskIds: string[];
  suggestions: DeprioritizationSuggestion[];
}

export interface AtRiskTask {
  taskId: string;
  reason: string;
}
