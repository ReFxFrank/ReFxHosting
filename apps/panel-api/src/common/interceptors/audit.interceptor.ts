import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { uuidv7 } from '../util/uuid';
import { AUDIT_KEY, AuditMeta } from '../decorators/audit.decorator';
import { AuthUser } from '../decorators/current-user.decorator';

/**
 * Records an AuditLog row for handlers annotated with @Audit(). Runs after the
 * handler succeeds so failed actions are not logged as completed. Writes are
 * fire-and-forget; an audit failure never breaks the request.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.get<AuditMeta>(AUDIT_KEY, context.getHandler());
    if (!meta || context.getType<'graphql'>() === 'graphql') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = req?.user;

    return next.handle().pipe(
      tap((result) => {
        const targetId =
          (meta.targetParam && req?.params?.[meta.targetParam]) ||
          (result && (result.id ?? result?.data?.id)) ||
          undefined;

        this.prisma.auditLog
          .create({
            data: {
              id: uuidv7(),
              actorId: user?.id ?? null,
              action: meta.action,
              targetType: meta.targetType,
              targetId: targetId ?? null,
              metadata: this.safeMeta(req) as Prisma.InputJsonValue,
              ip: req?.ip ?? null,
              userAgent: req?.headers?.['user-agent'] ?? null,
            },
          })
          .catch((err) =>
            this.logger.warn(`audit write failed: ${err.message}`),
          );
      }),
    );
  }

  private safeMeta(req: any): Record<string, unknown> {
    const body = { ...(req?.body ?? {}) };
    // Redact secrets and large base64 blobs (license keys, avatar data URLs) so
    // the audit metadata stays small and free of sensitive payloads.
    for (const k of ['password', 'token', 'secret', 'refreshToken', 'data', 'dataUrl']) {
      if (k in body) body[k] = '[redacted]';
    }
    return { method: req?.method, params: req?.params, body };
  }
}
