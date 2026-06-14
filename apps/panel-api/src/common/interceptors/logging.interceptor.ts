import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Logs every HTTP request with method, path, status and duration. Skips the
 * GraphQL context (Apollo has its own tracing) and health probes.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType<'graphql'>() === 'graphql') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    if (req?.url?.includes('/health') || req?.url?.includes('/metrics')) {
      return next.handle();
    }

    const start = Date.now();
    const { method, url } = req;

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - start;
        this.logger.log(`${method} ${url} ${res.statusCode} ${ms}ms`);
      }),
    );
  }
}
