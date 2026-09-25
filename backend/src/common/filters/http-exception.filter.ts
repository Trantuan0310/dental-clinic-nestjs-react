import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    let details: unknown = undefined;

    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2034') {
      status = HttpStatus.CONFLICT;
      code = 'TRANSACTION_CONFLICT';
      message = 'Data was changed by another request. Reload and try again.';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || exception.message;
        code = this.businessCode(resp) ?? this.getErrorCode(status);
        details = resp.details;
      }
    } else if (exception instanceof Error) {
      // Never surface a raw, unexpected error's message to the client — it
      // can leak internal details (Prisma constraint/table/column names,
      // stack-adjacent info). Keep the generic 'Internal server error' /
      // 'INTERNAL_ERROR' defaults declared above; the real message and
      // stack are still logged server-side for debugging.
      this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack);
    }

    response.status(status).json({
      statusCode: status,
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  /**
   * The machine-readable code the client branches on. Domain exceptions put
   * it in `code` (e.g. CHECK_IN_EXPIRED, SLOT_CONFLICT) next to the HTTP
   * reason phrase in `error`; BusinessRuleException puts it in `error`.
   * Reason phrases ("Bad Request", "Conflict") are not codes, so they fall
   * through to the status mapping.
   */
  private businessCode(resp: Record<string, unknown>): string | undefined {
    for (const candidate of [resp.code, resp.error]) {
      if (typeof candidate === 'string' && /^[A-Z][A-Z0-9_]*$/.test(candidate)) return candidate;
    }
    return undefined;
  }

  private getErrorCode(status: number): string {
    const statusCodes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_ERROR',
    };
    return statusCodes[status] || 'ERROR';
  }
}
