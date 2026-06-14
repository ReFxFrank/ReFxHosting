import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export const RAW_RESPONSE_KEY = 'raw_response';

export interface ApiEnvelope<T> {
  success: true;
  data: T;
}

/**
 * Wraps successful REST responses in a `{ success, data }` envelope. Paginated
 * payloads (already `{ data, meta }`) are spread so meta is preserved. GraphQL,
 * health/metrics and routes marked @RawResponse() are passed through untouched.
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiEnvelope<T> | T>
{
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiEnvelope<T> | T> {
    if (context.getType<'graphql'>() === 'graphql') {
      return next.handle();
    }

    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return next.handle().pipe(
      map((data) => {
        if (raw || data === undefined || data === null) {
          return data;
        }
        if (typeof data === 'object' && data !== null && 'meta' in data) {
          return { success: true, ...(data as any) };
        }
        return { success: true, data };
      }),
    );
  }
}
