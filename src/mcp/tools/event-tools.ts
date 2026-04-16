import type { EventRepository } from "../../storage/event-repository.js";
import type { ReplanCoordinator } from "../../engine/replan-coordinator.js";
import type { Logger } from "../../common/logger.js";
import { NotFoundError } from "../../models/errors.js";
import {
  validateCreateEventInput,
  validateUpdateEventInput,
  validateListEventsInput,
  mapCreateEventInput,
  mapUpdateEventInput,
  mapEventOutput,
  type CreateEventMcpInput,
  type UpdateEventMcpInput,
  type DeleteEventMcpInput,
  type ListEventsMcpInput,
} from "../validators.js";

export class EventTools {
  private readonly eventRepo: EventRepository;
  private readonly replanCoordinator: ReplanCoordinator;
  private readonly logger: Logger;

  constructor(eventRepo: EventRepository, replanCoordinator: ReplanCoordinator, logger: Logger) {
    this.eventRepo = eventRepo;
    this.replanCoordinator = replanCoordinator;
    this.logger = logger;
  }

  createEvent(input: CreateEventMcpInput) {
    validateCreateEventInput(input);
    const eventData = mapCreateEventInput(input);
    const event = this.eventRepo.create(eventData);

    this.replanCoordinator.requestReplan();
    return { event: mapEventOutput(event) };
  }

  updateEvent(input: UpdateEventMcpInput) {
    validateUpdateEventInput(input);
    const { id, updates } = mapUpdateEventInput(input);

    const event = this.eventRepo.findById(id);
    if (!event) {
      throw new NotFoundError("event", id);
    }

    const updated = this.eventRepo.update(id, updates);
    this.replanCoordinator.requestReplan();
    return { event: mapEventOutput(updated) };
  }

  deleteEvent(input: DeleteEventMcpInput) {
    const event = this.eventRepo.findById(input.event_id);
    if (!event) {
      throw new NotFoundError("event", input.event_id);
    }

    this.eventRepo.delete(input.event_id);
    this.replanCoordinator.requestReplan();

    return {
      event_id: input.event_id,
      message: "Event deleted successfully",
    };
  }

  listEvents(input: ListEventsMcpInput) {
    validateListEventsInput(input);
    const events = this.eventRepo.findInRange(input.start_date, input.end_date);

    return {
      events: events.map(mapEventOutput),
      count: events.length,
    };
  }
}
