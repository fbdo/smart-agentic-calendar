import rruleLib from "rrule";
import type { RRule } from "rrule";

const { rrulestr } = rruleLib;
import type { RecurrenceRepository } from "../storage/recurrence-repository.js";
import type { TaskRepository } from "../storage/task-repository.js";
import type { RecurrenceTemplate, RecurrenceInstance } from "../models/recurrence.js";
import type { Task } from "../models/task.js";
import { ValidationError, NotFoundError, InvalidStateError } from "../models/errors.js";

type TaskFields = Omit<Task, "id" | "createdAt" | "updatedAt" | "status" | "actualDuration">;

export class RecurrenceManager {
  private readonly recurrenceRepo: RecurrenceRepository;
  private readonly taskRepo: TaskRepository;
  private currentHorizonEnd: Date | null = null;

  constructor(recurrenceRepo: RecurrenceRepository, taskRepo: TaskRepository) {
    this.recurrenceRepo = recurrenceRepo;
    this.taskRepo = taskRepo;
  }

  createRecurringTask(
    taskData: TaskFields,
    rruleString: string,
    now: Date,
    horizonEnd: Date,
  ): { template: RecurrenceTemplate; instances: RecurrenceInstance[] } {
    // Validate RRULE before creating anything
    this.parseRule(rruleString, now);

    const template = this.recurrenceRepo.createTemplate({
      taskData: {
        title: taskData.title,
        description: taskData.description,
        duration: taskData.duration,
        deadline: taskData.deadline,
        priority: taskData.priority,
        category: taskData.category,
        tags: taskData.tags,
      },
      rrule: rruleString,
    });

    const instances = this.generateInstancesForTemplate(template, now, horizonEnd);

    if (!this.currentHorizonEnd || horizonEnd > this.currentHorizonEnd) {
      this.currentHorizonEnd = horizonEnd;
    }

    return { template, instances };
  }

  generateInstances(templateId: string, now: Date, horizonEnd: Date): RecurrenceInstance[] {
    const template = this.recurrenceRepo.getTemplate(templateId);
    if (!template) {
      throw new NotFoundError("RecurrenceTemplate", templateId);
    }
    return this.generateInstancesForTemplate(template, now, horizonEnd);
  }

  expandHorizon(newHorizonEnd: Date): RecurrenceInstance[] {
    if (this.currentHorizonEnd && newHorizonEnd <= this.currentHorizonEnd) {
      return [];
    }

    const templates = this.recurrenceRepo.getActiveTemplates();
    const allNew: RecurrenceInstance[] = [];

    for (const template of templates) {
      const dtstart = new Date(template.createdAt);
      const instances = this.generateInstancesForTemplate(template, dtstart, newHorizonEnd);
      allNew.push(...instances);
    }

    this.currentHorizonEnd = newHorizonEnd;
    return allNew;
  }

  skipInstance(templateId: string, date: string): void {
    const instances = this.recurrenceRepo.getInstances(templateId, date, date);
    for (const inst of instances) {
      if (inst.scheduledDate === date) {
        this.taskRepo.updateStatus(inst.taskId, "cancelled");
      }
    }

    this.recurrenceRepo.addException(templateId, date, {
      type: "skip",
      overrides: null,
    });
  }

  modifyInstance(templateId: string, date: string, updates: Partial<Task>): void {
    const instances = this.recurrenceRepo.getInstances(templateId, date, date);
    const instance = instances.find((i) => i.scheduledDate === date);
    if (!instance) {
      throw new NotFoundError("RecurrenceInstance", `${templateId}:${date}`);
    }

    const task = this.taskRepo.findById(instance.taskId);
    if (task && task.status === "completed") {
      throw new InvalidStateError("Cannot modify a completed instance");
    }

    this.taskRepo.update(instance.taskId, updates);

    this.recurrenceRepo.addException(templateId, date, {
      type: "modify",
      overrides: updates,
    });
  }

  deleteTemplate(templateId: string, now: Date): void {
    const template = this.recurrenceRepo.getTemplate(templateId);
    if (!template) {
      throw new NotFoundError("RecurrenceTemplate", templateId);
    }

    const farFuture = new Date(now);
    farFuture.setFullYear(farFuture.getFullYear() + 10);

    const instances = this.recurrenceRepo.getInstances(
      templateId,
      now.toISOString().slice(0, 10),
      farFuture.toISOString().slice(0, 10),
    );

    for (const inst of instances) {
      const task = this.taskRepo.findById(inst.taskId);
      if (task && task.status !== "completed" && task.status !== "cancelled") {
        this.taskRepo.updateStatus(inst.taskId, "cancelled");
      }
    }

    this.recurrenceRepo.deleteTemplate(templateId);
  }

  private generateInstancesForTemplate(
    template: RecurrenceTemplate,
    start: Date,
    end: Date,
  ): RecurrenceInstance[] {
    const rule = this.parseRule(template.rrule, start);
    const dates = rule.between(start, end, true);

    const existing = this.recurrenceRepo.getInstances(
      template.id,
      start.toISOString(),
      end.toISOString(),
    );
    const existingDates = new Set(existing.map((i) => i.scheduledDate));

    const exceptions = this.recurrenceRepo.getExceptions(template.id);
    const skipDates = new Set(exceptions.filter((e) => e.type === "skip").map((e) => e.date));

    const newInstances: RecurrenceInstance[] = [];

    for (const date of dates) {
      const dateStr = date.toISOString().slice(0, 10);
      if (existingDates.has(dateStr) || skipDates.has(dateStr)) {
        continue;
      }

      const task = this.taskRepo.create({
        title: template.taskData.title,
        description: template.taskData.description,
        duration: template.taskData.duration,
        deadline: template.taskData.deadline,
        priority: template.taskData.priority,
        category: template.taskData.category,
        tags: template.taskData.tags,
        isRecurring: true,
        recurrenceTemplateId: template.id,
      });

      const instance = this.recurrenceRepo.createInstance({
        templateId: template.id,
        taskId: task.id,
        scheduledDate: dateStr,
        isException: false,
      });

      newInstances.push(instance);
    }

    return newInstances;
  }

  private parseRule(rruleString: string, dtstart: Date): RRule {
    try {
      return rrulestr(`RRULE:${rruleString}`, { dtstart }) as RRule;
    } catch {
      throw new ValidationError(`Invalid RRULE: ${rruleString}`);
    }
  }
}
