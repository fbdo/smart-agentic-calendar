export type ErrorCode = "VALIDATION_ERROR" | "NOT_FOUND" | "CIRCULAR_DEPENDENCY" | "INVALID_STATE";

export class AppError extends Error {
  public readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super("NOT_FOUND", `${entity} not found: ${id}`);
  }
}

export class CircularDependencyError extends AppError {
  constructor(cyclePath: string[]) {
    super("CIRCULAR_DEPENDENCY", `circular dependency detected: ${cyclePath.join(" → ")}`);
  }
}

export class InvalidStateError extends AppError {
  constructor(message: string) {
    super("INVALID_STATE", message);
  }
}
