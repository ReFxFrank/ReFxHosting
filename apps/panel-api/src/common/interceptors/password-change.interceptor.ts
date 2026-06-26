import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Observable } from 'rxjs';
import { ALLOW_WHEN_PASSWORD_EXPIRED_KEY } from '../decorators/allow-when-password-expired.decorator';
import { AuthUser } from '../decorators/current-user.decorator';

/**
 * Server-side enforcement of `User.mustChangePassword`.
 *
 * An admin-set temporary password (mustChangePassword=true) MUST NOT grant
 * normal API access: until the user picks a new password they are blocked from
 * every authenticated route except the ones marked @AllowWhenPasswordExpired()
 * (change-password, me, logout, refresh).
 *
 * This runs as a GLOBAL interceptor, NOT a global guard: the controller-level
 * JwtAuthGuard populates `req.user`, and interceptors run AFTER guards — so by
 * the time we run, the principal (with `mustChangePassword`) is attached. A
 * global guard would run BEFORE that and never see `req.user`.
 *
 * The rejection carries a machine-readable `code` so the web client can
 * distinguish it from a generic 403 and surface the password-change flow
 * instead of an error toast.
 */
@Injectable()
export class PasswordChangeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = this.getRequest(context);
    const user: AuthUser | undefined = req?.user;

    if (user?.mustChangePassword) {
      const allowed = this.reflector.getAllAndOverride<boolean>(
        ALLOW_WHEN_PASSWORD_EXPIRED_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (!allowed) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'PASSWORD_CHANGE_REQUIRED',
          message: 'Password change required',
        });
      }
    }

    return next.handle();
  }

  private getRequest(context: ExecutionContext): any {
    if (context.getType<'graphql'>() === 'graphql') {
      return GqlExecutionContext.create(context).getContext().req;
    }
    return context.switchToHttp().getRequest();
  }
}
