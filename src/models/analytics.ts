export interface ProductivityStats {
  period: "day" | "week" | "month";
  tasksCompleted: number;
  tasksOverdue: number;
  tasksCancelled: number;
  completionRate: number;
  onTimeRate: number;
}

export interface ScheduleHealth {
  healthScore: number;
  utilizationPercentage: number;
  overdueCount: number;
  atRiskCount: number;
  freeHoursThisWeek: number;
  busiestDay: string;
  lightestDay: string;
}

export interface EstimationAccuracy {
  averageAccuracyPercentage: number | null;
  overestimateCount: number;
  underestimateCount: number;
  averageOverestimateMinutes: number | null;
  averageUnderestimateMinutes: number | null;
  accuracyByCategory: Record<string, number> | null;
}

export interface CategoryAllocation {
  category: string;
  hours: number;
  percentage: number;
}

export interface TimeAllocation {
  period: "day" | "week" | "month";
  categories: CategoryAllocation[];
}

export interface CompletedTaskRecord {
  taskId: string;
  title: string;
  category: string | null;
  estimatedDuration: number;
  actualDuration: number | null;
  completedAt: string;
  wasOnTime: boolean;
}

export interface DurationRecord {
  taskId: string;
  category: string | null;
  estimatedMinutes: number;
  actualMinutes: number;
}

export interface CategorySummary {
  category: string;
  totalMinutes: number;
  taskCount: number;
}
