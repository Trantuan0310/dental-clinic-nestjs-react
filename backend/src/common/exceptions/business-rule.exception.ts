import { HttpException, HttpStatus } from '@nestjs/common';

export class BusinessRuleException extends HttpException {
  constructor(
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
    public readonly code?: string,
  ) {
    super(
      {
        message,
        error: code || 'BUSINESS_RULE_VIOLATION',
        details,
      },
      status,
    );
    this.name = 'BusinessRuleException';
  }
}

export class CannotDeleteSystemRoleException extends BusinessRuleException {
  constructor() {
    super(
      'System roles cannot be deleted',
      HttpStatus.FORBIDDEN,
      undefined,
      'CANNOT_DELETE_SYSTEM_ROLE',
    );
  }
}

export class CannotDeleteRoleWithUsersException extends BusinessRuleException {
  constructor(count = 0) {
    super(
      `Role still has ${count} active user(s). Reassign users before deleting.`,
      HttpStatus.CONFLICT,
      { userCount: count },
      'CANNOT_DELETE_ROLE_WITH_USERS',
    );
  }
}

export class CannotRemoveLastAdminException extends BusinessRuleException {
  constructor() {
    super(
      'Cannot remove or demote the last active clinic admin.',
      HttpStatus.CONFLICT,
      undefined,
      'CANNOT_REMOVE_LAST_ADMIN',
    );
  }
}

export class EmailAlreadyExistsException extends BusinessRuleException {
  constructor(email: string) {
    super(
      `Email '${email}' is already registered`,
      HttpStatus.CONFLICT,
      { email },
      'EMAIL_ALREADY_EXISTS',
    );
  }
}

export * from './app.exception';
export * from './auth.exception';
