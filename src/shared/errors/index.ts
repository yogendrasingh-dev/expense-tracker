export abstract class AppError extends Error {
  abstract readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  readonly status = 400;
}

export class UnauthorizedError extends AppError {
  readonly status = 401;
}

export class ForbiddenError extends AppError {
  readonly status = 403;
}

export class NotFoundError extends AppError {
  readonly status = 404;
}

export class ConflictError extends AppError {
  readonly status = 409;
}
