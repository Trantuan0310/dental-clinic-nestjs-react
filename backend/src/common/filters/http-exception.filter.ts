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

    const badInput = this.badInputMessage(exception);
    const parserStatus = this.bodyParserStatus(exception);
    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2034') {
      status = HttpStatus.CONFLICT;
      code = 'TRANSACTION_CONFLICT';
      message = 'Data was changed by another request. Reload and try again.';
    } else if (badInput) {
      // Input the DTOs did not catch, rejected by the database (too long,
      // numeric overflow, NUL byte, dangling reference): a 400, not a 500.
      status = HttpStatus.BAD_REQUEST;
      code = 'BAD_REQUEST';
      message = badInput;
      this.logger.warn(`Rejected input: ${(exception as Error).message}`);
    } else if (parserStatus) {
      // body-parser errors carry their own 4xx (413 too large, 400 bad JSON).
      status = parserStatus;
      code = parserStatus === 413 ? 'PAYLOAD_TOO_LARGE' : this.getErrorCode(parserStatus);
      message =
        parserStatus === 413
          ? 'Dữ liệu gửi lên quá lớn'
          : parserStatus === 400
            ? 'Dữ liệu gửi lên không đúng định dạng JSON'
            : 'Yêu cầu không hợp lệ';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        // ThrottlerException's response is a bare English string.
        code = 'TOO_MANY_REQUESTS';
        message = 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút';
      } else if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        code = this.getErrorCode(status);
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

  /** Vietnamese message when the database rejected the input itself. */
  private badInputMessage(exception: unknown): string | undefined {
    const tooLong = 'Dữ liệu nhập quá dài so với giới hạn cho phép';
    const invalid = 'Dữ liệu nhập không hợp lệ (vượt giới hạn số hoặc chứa ký tự không cho phép)';
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2000') return tooLong;
      if (exception.code === 'P2003') return 'Dữ liệu liên quan không tồn tại hoặc không hợp lệ';
      if (exception.code === 'P2020') return invalid;
      const dbCode = (exception.meta as { code?: unknown } | undefined)?.code;
      if (exception.code === 'P2010' && typeof dbCode === 'string') {
        if (dbCode === '22001') return tooLong;
        if (['22003', '22021', '22P05'].includes(dbCode)) return invalid;
      }
      return undefined;
    }
    if (exception instanceof Prisma.PrismaClientUnknownRequestError) {
      const msg = exception.message;
      if (/\b22001\b|value too long/i.test(msg)) return tooLong;
      if (
        /\b(22003|22021|22P05)\b|numeric field overflow|invalid byte sequence|out of range/i.test(
          msg,
        )
      ) {
        return invalid;
      }
    }
    return undefined;
  }

  /** 4xx status carried by an Express body-parser error, if any. */
  private bodyParserStatus(exception: unknown): number | undefined {
    if (!(exception instanceof Error) || exception instanceof HttpException) return undefined;
    const e = exception as Error & { status?: unknown; statusCode?: unknown; type?: unknown };
    const status = typeof e.status === 'number' ? e.status : e.statusCode;
    if (typeof e.type !== 'string' || typeof status !== 'number') return undefined;
    return status >= 400 && status < 500 ? status : undefined;
  }

  private getErrorCode(status: number): string {
    const statusCodes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      413: 'PAYLOAD_TOO_LARGE',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_ERROR',
    };
    return statusCodes[status] || 'ERROR';
  }
}
