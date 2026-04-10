import type { Task, TaskPriority } from "../models/task.js";
import type { TimeBlock } from "../models/schedule.js";
import type { Availability } from "../models/config.js";
import type { Conflict, DeprioritizationSuggestion } from "../models/conflict.js";
import type { DependencyEdge } from "../models/dependency.js";
import { diffMinutes } from "../common/time.js";

const PRIORITY_RANK: Record<string, number> = {
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
};

interface CompetingTask {
  taskId: string;
  priority: TaskPriority;
  deadline: string | null;
  scheduledMinutes: number;
}

export class ConflictDetector {
  detectConflicts(
    tasks: Task[],
    timeBlocks: TimeBlock[],
    _availability: Availability,
    dependencies: DependencyEdge[],
    now: Date,
  ): Conflict[] {
    const conflicts: Conflict[] = [];

    for (const task of tasks) {
      if (task.status === "completed" || task.status === "cancelled") {
        continue;
      }

      // Check 1: Overdue
      if (task.deadline && new Date(task.deadline) < now) {
        const scheduledMinutes = this.getScheduledMinutes(task.id, timeBlocks);
        conflicts.push({
          taskId: task.id,
          reason: "overdue",
          deadline: task.deadline,
          requiredMinutes: task.duration,
          availableMinutes: scheduledMinutes,
          competingTaskIds: [],
          suggestions: [],
        });
        continue;
      }

      // Tasks with no deadline can't have deadline-based conflicts
      if (!task.deadline) {
        continue;
      }

      // Check 2: Dependency chain infeasibility
      const chainDuration = this.computeDependencyChainDuration(task, tasks, dependencies);
      if (chainDuration > 0) {
        const hoursAvailable = this.computeAvailableMinutesBeforeDeadline(
          now,
          new Date(task.deadline),
        );
        if (chainDuration > hoursAvailable) {
          const chainIds = this.getDependencyChainIds(task, tasks, dependencies);
          conflicts.push({
            taskId: task.id,
            reason: "dependency_chain",
            deadline: task.deadline,
            requiredMinutes: chainDuration,
            availableMinutes: hoursAvailable,
            competingTaskIds: chainIds,
            suggestions: [],
          });
          continue;
        }
      }

      // Check 3: Insufficient time
      const scheduledMinutes = this.getScheduledMinutes(task.id, timeBlocks);
      if (scheduledMinutes < task.duration) {
        const competing = this.findCompetingTasks(task, timeBlocks, tasks);
        const requiredMinutes = task.duration - scheduledMinutes;
        const suggestions = this.suggestDeprioritizations(task, competing, requiredMinutes);

        conflicts.push({
          taskId: task.id,
          reason: "insufficient_time",
          deadline: task.deadline,
          requiredMinutes,
          availableMinutes: this.computeAvailableMinutesBeforeDeadline(
            now,
            new Date(task.deadline),
          ),
          competingTaskIds: competing.map((c) => c.taskId),
          suggestions,
        });
      }
    }

    return conflicts;
  }

  suggestDeprioritizations(
    atRiskTask: Task,
    competingTasks: CompetingTask[],
    requiredMinutes: number,
  ): DeprioritizationSuggestion[] {
    // Filter: never suggest deprioritizing a task with a nearer deadline
    const filtered = competingTasks.filter((t) => {
      if (!t.deadline || !atRiskTask.deadline) return true;
      return new Date(t.deadline) > new Date(atRiskTask.deadline);
    });

    // Sort: lowest priority first (P4 before P3), then furthest deadline first
    const sorted = [...filtered].sort((a, b) => {
      const priorityDiff = (PRIORITY_RANK[b.priority] ?? 99) - (PRIORITY_RANK[a.priority] ?? 99);
      if (priorityDiff !== 0) return priorityDiff;

      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      return bDeadline - aDeadline;
    });

    const suggestions: DeprioritizationSuggestion[] = [];
    let freedMinutes = 0;

    for (const task of sorted) {
      suggestions.push({
        taskId: task.taskId,
        currentPriority: task.priority,
        freedMinutes: task.scheduledMinutes,
      });
      freedMinutes += task.scheduledMinutes;
      if (freedMinutes >= requiredMinutes) {
        break;
      }
    }

    return suggestions;
  }

  findCompetingTasks(atRiskTask: Task, timeBlocks: TimeBlock[], allTasks: Task[]): CompetingTask[] {
    if (!atRiskTask.deadline) return [];

    const deadline = new Date(atRiskTask.deadline);
    const taskMap = new Map<string, Task>();
    for (const task of allTasks) {
      taskMap.set(task.id, task);
    }

    // Find blocks that occupy time before the at-risk task's deadline
    const competingBlocks = timeBlocks.filter(
      (b) => b.taskId !== atRiskTask.id && new Date(b.endTime) <= deadline,
    );

    // Group by taskId and sum scheduled time
    const minutesByTask = new Map<string, number>();
    for (const block of competingBlocks) {
      const minutes = diffMinutes(block.startTime, block.endTime);
      minutesByTask.set(block.taskId, (minutesByTask.get(block.taskId) ?? 0) + minutes);
    }

    const result: CompetingTask[] = [];
    for (const [taskId, scheduledMinutes] of minutesByTask) {
      const task = taskMap.get(taskId);
      if (task) {
        result.push({
          taskId,
          priority: task.priority,
          deadline: task.deadline,
          scheduledMinutes,
        });
      }
    }

    return result;
  }

  private getScheduledMinutes(taskId: string, timeBlocks: TimeBlock[]): number {
    return timeBlocks
      .filter((b) => b.taskId === taskId)
      .reduce((sum, b) => sum + diffMinutes(b.startTime, b.endTime), 0);
  }

  private computeAvailableMinutesBeforeDeadline(now: Date, deadline: Date): number {
    // Rough estimate: total minutes between now and deadline
    // A more accurate calculation would factor in availability windows,
    // but for conflict reporting this provides a useful upper bound
    return Math.max(0, (deadline.getTime() - now.getTime()) / 60_000);
  }

  private computeDependencyChainDuration(
    task: Task,
    allTasks: Task[],
    dependencies: DependencyEdge[],
  ): number {
    const taskMap = new Map<string, Task>();
    for (const t of allTasks) {
      taskMap.set(t.id, t);
    }

    // Walk backwards through dependencies, summing durations
    const visited = new Set<string>();
    let totalDuration = 0;

    const walk = (taskId: string): void => {
      if (visited.has(taskId)) return;
      visited.add(taskId);

      const deps = dependencies.filter((d) => d.taskId === taskId);
      for (const dep of deps) {
        const depTask = taskMap.get(dep.dependsOnId);
        if (depTask && depTask.status !== "completed") {
          totalDuration += depTask.duration;
          walk(dep.dependsOnId);
        }
      }
    };

    walk(task.id);
    // Include the task itself
    if (totalDuration > 0) {
      totalDuration += task.duration;
    }

    return totalDuration;
  }

  private getDependencyChainIds(
    task: Task,
    allTasks: Task[],
    dependencies: DependencyEdge[],
  ): string[] {
    const taskMap = new Map<string, Task>();
    for (const t of allTasks) {
      taskMap.set(t.id, t);
    }

    const visited = new Set<string>();
    const chainIds: string[] = [];

    const walk = (taskId: string): void => {
      if (visited.has(taskId)) return;
      visited.add(taskId);

      const deps = dependencies.filter((d) => d.taskId === taskId);
      for (const dep of deps) {
        const depTask = taskMap.get(dep.dependsOnId);
        if (depTask && depTask.status !== "completed") {
          chainIds.push(dep.dependsOnId);
          walk(dep.dependsOnId);
        }
      }
    };

    walk(task.id);
    return chainIds;
  }
}
