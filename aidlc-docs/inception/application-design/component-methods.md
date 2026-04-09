# Component Methods — Smart Agentic Calendar MCP Server

**Note**: Method signatures and high-level purpose defined here. Detailed business rules will be specified in Functional Design (per-unit, CONSTRUCTION phase).

---

## Storage Layer Methods

### Database
```typescript
class Database {
  constructor(dbPath: string)
  getConnection(): BetterSqlite3.Database
  runMigrations(): void
  close(): void
}
```

### TaskRepository
```typescript
class TaskRepository {
  constructor(db: Database)
  create(task: Omit<Task, "id" | "createdAt">): Task
  findById(id: string): Task | undefined
  findAll(filters?: TaskFilters): Task[]
  update(id: string, updates: Partial<Task>): Task
  updateStatus(id: string, status: TaskStatus): Task
  delete(id: string): void
  addDependency(taskId: string, dependsOnId: string): void
  removeDependency(taskId: string, dependsOnId: string): void
  getDependencies(taskId: string): Task[]
  getDependents(taskId: string): Task[]
  recordActualDuration(id: string, actualMinutes: number): void
}

interface TaskFilters {
  status?: TaskStatus
  priority?: TaskPriority
  deadlineBefore?: Date
  deadlineAfter?: Date
  category?: string
}
```

### EventRepository
```typescript
class EventRepository {
  constructor(db: Database)
  create(event: Omit<Event, "id">): Event
  findById(id: string): Event | undefined
  findInRange(start: Date, end: Date): Event[]
  update(id: string, updates: Partial<Event>): Event
  delete(id: string): void
}
```

### ConfigRepository
```typescript
class ConfigRepository {
  constructor(db: Database)
  getAvailability(): Availability
  setAvailability(availability: Availability): void
  getFocusTime(): FocusTime
  setFocusTime(focusTime: FocusTime): void
  getPreferences(): Preferences
  setPreferences(preferences: Partial<Preferences>): void
  getFullConfig(): UserConfig
}
```

### ScheduleRepository
```typescript
class ScheduleRepository {
  constructor(db: Database)
  saveSchedule(timeBlocks: TimeBlock[]): void
  getSchedule(start: Date, end: Date): TimeBlock[]
  getScheduleStatus(): ScheduleStatus
  setScheduleStatus(status: ScheduleStatus): void
  clearSchedule(): void
}
```

### AnalyticsRepository
```typescript
class AnalyticsRepository {
  constructor(db: Database)
  getCompletedTasks(start: Date, end: Date): CompletedTaskRecord[]
  getOverdueTasks(start: Date, end: Date): Task[]
  getCancelledTasks(start: Date, end: Date): Task[]
  getTasksByCategory(start: Date, end: Date): CategorySummary[]
  getDurationRecords(start: Date, end: Date): DurationRecord[]
}
```

### RecurrenceRepository
```typescript
class RecurrenceRepository {
  constructor(db: Database)
  createTemplate(template: Omit<RecurrenceTemplate, "id">): RecurrenceTemplate
  getTemplate(id: string): RecurrenceTemplate | undefined
  getActiveTemplates(): RecurrenceTemplate[]
  deleteTemplate(id: string): void
  createInstance(instance: Omit<RecurrenceInstance, "id">): RecurrenceInstance
  getInstances(templateId: string, start: Date, end: Date): RecurrenceInstance[]
  addException(templateId: string, date: Date, override: RecurrenceException): void
  getExceptions(templateId: string): RecurrenceException[]
}
```

---

## Engine Layer Methods

### Scheduler
```typescript
class Scheduler {
  constructor(
    taskRepo: TaskRepository,
    eventRepo: EventRepository,
    configRepo: ConfigRepository,
    conflictDetector: ConflictDetector,
    dependencyResolver: DependencyResolver,
    scheduleRepo: ScheduleRepository
  )
  generateSchedule(start: Date, end: Date): ScheduleResult
  // ScheduleResult includes: timeBlocks[], conflicts[], atRiskTasks[]
}
```

### ReplanCoordinator
```typescript
class ReplanCoordinator {
  constructor(
    scheduler: Scheduler,
    scheduleRepo: ScheduleRepository
  )
  requestReplan(): void
  // Sets dirty flag, schedules replan via setImmediate if not already pending
  
  isReplanning(): boolean
  // Returns true if a replan is currently in progress
  
  getScheduleStatus(): ScheduleStatus
  // Returns "up_to_date" or "replan_in_progress"
  
  awaitReplan(): Promise<void>
  // For the explicit `replan` MCP tool — blocks until current replan completes
}
```

### ConflictDetector
```typescript
class ConflictDetector {
  constructor()
  detectConflicts(
    tasks: Task[],
    timeBlocks: TimeBlock[],
    availability: Availability
  ): Conflict[]
  // Identifies tasks with infeasible deadlines
  
  suggestDeprioritizations(
    atRiskTask: Task,
    competingTasks: Task[]
  ): DeprioritizationSuggestion[]
  // Suggests which lower-priority tasks to deprioritize
}
```

### RecurrenceManager
```typescript
class RecurrenceManager {
  constructor(
    recurrenceRepo: RecurrenceRepository,
    taskRepo: TaskRepository
  )
  createRecurringTask(taskData: TaskInput, rrule: string): RecurrenceTemplate
  generateInstances(templateId: string, horizonEnd: Date): RecurrenceInstance[]
  expandHorizon(newHorizonEnd: Date): RecurrenceInstance[]
  skipInstance(templateId: string, date: Date): void
  modifyInstance(instanceId: string, updates: Partial<Task>): void
  deleteTemplate(templateId: string): void
}
```

### DependencyResolver
```typescript
class DependencyResolver {
  constructor()
  validateNoCycles(taskId: string, dependsOnId: string, existingDeps: DependencyEdge[]): boolean
  // Returns true if adding this dependency would NOT create a cycle
  
  topologicalSort(tasks: Task[], dependencies: DependencyEdge[]): Task[]
  // Returns tasks ordered so that dependencies come before dependents
  
  getBlockedTasks(tasks: Task[], dependencies: DependencyEdge[]): Task[]
  // Returns tasks that cannot be scheduled because their dependencies are incomplete
}
```

---

## Analytics Layer Methods

### AnalyticsEngine
```typescript
class AnalyticsEngine {
  constructor(
    analyticsRepo: AnalyticsRepository,
    taskRepo: TaskRepository,
    scheduleRepo: ScheduleRepository,
    configRepo: ConfigRepository
  )
  getProductivityStats(period: "day" | "week" | "month"): ProductivityStats
  getScheduleHealth(): ScheduleHealth
  getEstimationAccuracy(): EstimationAccuracy
  getTimeAllocation(period: "day" | "week" | "month"): TimeAllocation
}
```

---

## MCP Layer Methods

### Server
```typescript
class McpServer {
  constructor(
    taskTools: TaskTools,
    eventTools: EventTools,
    scheduleTools: ScheduleTools,
    analyticsTools: AnalyticsTools,
    configTools: ConfigTools
  )
  start(): void
  // Registers all tools and starts stdio transport
}
```

### Tool Handlers (pattern for all tool classes)
```typescript
class TaskTools {
  constructor(
    taskRepo: TaskRepository,
    recurrenceManager: RecurrenceManager,
    dependencyResolver: DependencyResolver,
    replanCoordinator: ReplanCoordinator
  )
  createTask(input: CreateTaskInput): CreateTaskOutput
  getTask(input: GetTaskInput): GetTaskOutput
  updateTask(input: UpdateTaskInput): UpdateTaskOutput
  deleteTask(input: DeleteTaskInput): DeleteTaskOutput
  listTasks(input: ListTasksInput): ListTasksOutput
  completeTask(input: CompleteTaskInput): CompleteTaskOutput
}

class ScheduleTools {
  constructor(
    scheduleRepo: ScheduleRepository,
    replanCoordinator: ReplanCoordinator,
    conflictDetector: ConflictDetector
  )
  getSchedule(input: GetScheduleInput): GetScheduleOutput
  // Includes schedule_status field
  
  replan(input: ReplanInput): ReplanOutput
  // Synchronous — awaits replan completion
  
  getConflicts(input: GetConflictsInput): GetConflictsOutput
  // Includes schedule_status field
}
```
