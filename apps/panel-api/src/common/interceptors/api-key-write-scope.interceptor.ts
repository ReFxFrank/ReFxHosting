import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthUser } from '../decorators/current-user.decorator';

/** HTTP methods that mutate state and therefore require a WRITE/ADMIN key. */
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Global enforcement of the API-key WRITE-scope ceiling.
 *
 * An API key inherits its owner's full RBAC permissions, so a READ-scoped key
 * would otherwise be able to drive mutating requests on any controller that is
 * only protected by JwtAuthGuard (account, billing, support, orders, …) — e.g.
 * mint a new key, change the password, disable MFA or delete the account. The
 * per-server PermissionGuard and the AdminPermissionGuard already enforce this
 * ceiling on their surfaces; this closes the gap everywhere else.
 *
 * Implemented as a GLOBAL INTERCEPTOR, NOT a global guard: API-key auth runs
 * inside the controller-level JwtAuthGuard, which attaches `apiKeyScopes` to
 * `req.user`. A global guard runs BEFORE that guard and would never see the
 * scopes; an interceptor runs AFTER all guards, so the principal is reliably
 * populated by the time we check. (Same reason FIX 1 uses an interceptor.)
 *
 * Only API-key principals (those carrying `apiKeyScopes`) are affected; browser/
 * JWT sessions pass through untouched. Safe methods (GET/HEAD/OPTIONS) are
 * always allowed for any scope. GraphQL is left to its own guards.
 *
 * This deliberately overlaps with the existing PermissionGuard /
 * AdminPermissionGuard scope checks. Because all three throw the same
 * ForbiddenException, the overlap is harmless: whichever runs first rejects, and
 * a request that passes the per-route guards still gets the same verdict here.
 */
@Injectable()
export class ApiKeyWriteScopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // GraphQL is exempt: every resolver today is a read-only @Query. INVARIANT:
    // if a @Mutation resolver is ever added, the WRITE-scope ceiling must be
    // enforced for it too (detect operation type via GqlExecutionContext, or in
    // the resolver's guard) — otherwise an API key would bypass the ceiling here.
    if (context.getType<'graphql'>() === 'graphql') return next.handle();

    const req = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = req?.user;

    if (user?.apiKeyScopes) {
      const method = (req?.method ?? 'GET').toUpperCase();
      if (MUTATING.has(method)) {
        const hasWrite = user.apiKeyScopes.some(
          (s) => s === 'WRITE' || s === 'ADMIN',
        );
        if (!hasWrite) {
          throw new ForbiddenException('API key lacks write scope');
        }
      }
    }

    return next.handle();
  }
}
