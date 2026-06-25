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

  // Any key whose NAME matches is redacted at every depth — payment-gateway
  // secrets, Steam/SFTP/DB passwords, tokens, TOTP seeds, encryption keys, etc.
  // Over-redaction is safe here; leaking a secret into the audit log is not.
  private static readonly SENSITIVE_KEY =
    /pass|secret|token|key|credential|seed|totp|mfa|otp|cvv|card|webhook/i;

  /** Recursively redact sensitive keys and truncate large blobs. */
  private redact(value: unknown, depth = 0): unknown {
    if (value == null || depth > 6) return depth > 6 ? '[depth]' : value;
    if (Array.isArray(value)) return value.map((v) => this.redact(v, depth + 1));
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = AuditInterceptor.SENSITIVE_KEY.test(k)
          ? '[redacted]'
          : this.redact(v, depth + 1);
      }
      return out;
    }
    // Truncate large strings (license keys, avatar/base64 data URLs) regardless
    // of key so the audit metadata stays small.
    if (typeof value === 'string' && value.length > 512) return '[truncated]';
    return value;
  }

  private safeMeta(req: any): Record<string, unknown> {
    return {
      method: req?.method,
      params: this.redact(req?.params ?? {}),
      body: this.redact(req?.body ?? {}),
    };
  }
}
