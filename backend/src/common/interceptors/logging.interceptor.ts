import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  HttpException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const { method, url } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      // tap()'s single-callback form only fires on success — a thrown
      // exception skips it entirely, so every 4xx/5xx request (failed
      // login, permission denied, 404s...) went completely unlogged. The
      // object form adds an `error` branch so every request is logged.
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          this.logger.log(`${method} ${url} ${response.statusCode} - ${duration}ms`);
        },
        error: (err: unknown) => {
          const duration = Date.now() - startTime;
          const statusCode = err instanceof HttpException ? err.getStatus() : 500;
          const message = err instanceof Error ? err.message : 'unknown error';
          this.logger.warn(`${method} ${url} ${statusCode} - ${duration}ms (${message})`);
        },
      }),
    );
  }
}
