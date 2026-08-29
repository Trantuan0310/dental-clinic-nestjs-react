import { HttpException, HttpStatus } from '@nestjs/common';

export class InvalidCredentialsException extends HttpException {
  constructor(message: string = 'Invalid email or password') {
    super(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        error: 'Unauthorized',
        code: 'INVALID_CREDENTIALS',
        message,
      },
      HttpStatus.UNAUTHORIZED,
    );
    this.name = 'InvalidCredentialsException';
  }
}

export class AccountLockedException extends HttpException {
  constructor(public readonly retryAfterSeconds: number) {
    super(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        error: 'Unauthorized',
        code: 'ACCOUNT_LOCKED',
        message: `Account is locked. Try again in ${retryAfterSeconds} seconds`,
        details: { retryAfterSeconds },
      },
      HttpStatus.UNAUTHORIZED,
    );
    this.name = 'AccountLockedException';
  }
}

export class TokenReuseDetectedException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        error: 'Unauthorized',
        code: 'TOKEN_REUSE_DETECTED',
        message:
          'Token reuse detected. All sessions have been revoked for security.',
      },
      HttpStatus.UNAUTHORIZED,
    );
    this.name = 'TokenReuseDetectedException';
  }
}

export class InvalidTokenException extends HttpException {
  constructor(message: string = 'Invalid or expired token') {
    super(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        error: 'Unauthorized',
        code: 'INVALID_TOKEN',
        message,
      },
      HttpStatus.UNAUTHORIZED,
    );
    this.name = 'InvalidTokenException';
  }
}

export class PasswordTooWeakException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        code: 'PASSWORD_TOO_WEAK',
        message,
      },
      HttpStatus.BAD_REQUEST,
    );
    this.name = 'PasswordTooWeakException';
  }
}