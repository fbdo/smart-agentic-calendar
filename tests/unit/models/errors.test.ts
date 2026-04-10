import { describe, it, expect } from "vitest";
import {
  AppError,
  ValidationError,
  NotFoundError,
  CircularDependencyError,
  InvalidStateError,
} from "../../../src/models/errors.js";

describe("AppError", () => {
  it("stores code and message", () => {
    const err = new AppError("VALIDATION_ERROR", "bad input");
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.message).toBe("bad input");
    expect(err).toBeInstanceOf(Error);
  });

  it("has a proper name", () => {
    const err = new AppError("NOT_FOUND", "gone");
    expect(err.name).toBe("AppError");
  });
});

describe("ValidationError", () => {
  it("sets code to VALIDATION_ERROR", () => {
    const err = new ValidationError("title is required");
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.message).toBe("title is required");
    expect(err).toBeInstanceOf(AppError);
  });
});

describe("NotFoundError", () => {
  it("formats message with entity and id", () => {
    const err = new NotFoundError("Task", "abc-123");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("Task not found: abc-123");
    expect(err).toBeInstanceOf(AppError);
  });
});

describe("CircularDependencyError", () => {
  it("includes cycle path in message", () => {
    const err = new CircularDependencyError(["A", "B", "C", "A"]);
    expect(err.code).toBe("CIRCULAR_DEPENDENCY");
    expect(err.message).toBe("circular dependency detected: A → B → C → A");
    expect(err).toBeInstanceOf(AppError);
  });
});

describe("InvalidStateError", () => {
  it("sets code to INVALID_STATE", () => {
    const err = new InvalidStateError("cannot modify completed task");
    expect(err.code).toBe("INVALID_STATE");
    expect(err.message).toBe("cannot modify completed task");
    expect(err).toBeInstanceOf(AppError);
  });
});
