import { HttpException } from '@nestjs/common';

const STATUS_NAME: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
};

export class AppException extends HttpException {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(
      {
        statusCode,
        error: STATUS_NAME[statusCode] || 'Error',
        code,
        message,
        details,
      },
      statusCode,
    );
    this.name = this.constructor.name;
  }
}

export class NotFoundException extends AppException {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} with ID ${id} not found` : `${resource} not found`,
      `${resource.toUpperCase()}_NOT_FOUND`,
      404,
    );
  }
}

export class ValidationException extends AppException {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class UnauthorizedException extends AppException {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class ForbiddenException extends AppException {
  constructor(message: string = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class ConflictException extends AppException {
  constructor(message: string, code: string = 'CONFLICT') {
    super(message, code, 409);
  }
}
