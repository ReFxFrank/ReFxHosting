import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

/**
 * Increments `http_requests_total` for every completed REST request. GraphQL
 * operations share a single HTTP endpoint and are skipped to keep cardinality
 * meaningful. The route label prefers the matched route pattern (e.g.
 * `/users/:id`) over the raw URL so per-id paths don't explode label cardinality.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<{
      method: string;
      route?: { path?: string };
      originalUrl?: string;
      url?: string;
    }>();
    const res = http.getResponse<{ statusCode: number }>();

    const method = req.method ?? 'GET';
    const route =
      req.route?.path ?? req.originalUrl ?? req.url ?? 'unknown';

    const start = process.hrtime.bigint();
    const record = (status: number) => {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.recordHttp(method, route, status, durationSeconds);
    };

    return next.handle().pipe(
      tap({
        next: () => record(res.statusCode ?? 200),
        error: (err) =>
          record(
            (err as { status?: number; statusCode?: number })?.status ??
              (err as { statusCode?: number })?.statusCode ??
              500,
          ),
      }),
    );
  }
}
