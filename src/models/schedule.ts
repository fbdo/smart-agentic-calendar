export interface TimeBlock {
  id: string;
  taskId: string;
  startTime: string;
  endTime: string;
  date: string;
  blockIndex: number;
  totalBlocks: number;
}

export interface ScheduleResult {
  timeBlocks: TimeBlock[];
  conflicts: import("./conflict.js").Conflict[];
  atRiskTasks: import("./conflict.js").AtRiskTask[];
}

export type ScheduleStatus = "up_to_date" | "replan_in_progress";
