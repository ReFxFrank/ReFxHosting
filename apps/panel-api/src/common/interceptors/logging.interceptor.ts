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
 *
 * High-frequency agent health callbacks (heartbeat/stats) are polled every few
 * seconds by every node, so logging each at LOG level floods the log and rolls
 * real events off within minutes. Those are logged ONLY when they error or run
 * slowly — routine 2xx stay silent — so a genuine problem still surfaces
 * without the routine spam burying it.
 */
const CHATTY_PATHS = ['/agent/heartbeat', '/agent/stats'];
const SLOW_MS = 1000;

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
    const chatty = CHATTY_PATHS.some((p) => (url as string)?.includes(p));

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - start;
        // Suppress routine, fast, successful health chatter; still log it if it
        // errored or was slow (a wedged agent path is exactly what we'd want to
        // see — and what would have kept the upload outage visible in the log).
        if (chatty && res.statusCode < 400 && ms < SLOW_MS) return;
        this.logger.log(`${method} ${url} ${res.statusCode} ${ms}ms`);
      }),
    );
  }
}
