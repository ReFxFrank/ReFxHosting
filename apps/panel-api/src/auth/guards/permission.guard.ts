import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { GqlExecutionContext } from "@nestjs/graphql";
import { PERMISSIONS_KEY } from "../../common/decorators/permissions.decorator";
import { IS_PUBLIC_KEY } from "../../common/decorators/public.decorator";
import { AuthUser } from "../../common/decorators/current-user.decorator";
import { hasPermission } from "../../common/permissions";
import { hasServerPermission } from "../../common/server-permissions";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Per-server authorization. Resolves the target server from the `:serverId`
 * (or `:id`) route param and grants access when the principal is:
 *   - staff holding the admin `servers.manage` capability (support access), or
 *   - the server owner, or
 *   - an ACTIVE SubUser holding ALL required @RequirePermissions().
 *
 * The staff override lets support operate a customer's server FROM THE ADMIN
 * PANEL. It is deliberately gated on `servers.manage` (ADMIN/OWNER by default),
 * NOT on global role alone, and a customer's servers never appear in a staff
 * member's OWN client dashboard/list (that query is scoped in ServersService).
 *
 * API-key principals are additionally constrained: a READ-scope key cannot pass
 * a guard that requires any non-read permission.
 */
/**
 * Permissions a customer/sub-user may still exercise while their server is
 * SUSPENDED (non-payment): read-only visibility so they can see the suspended
 * state and go pay. Everything operational — console, files, backups, power,
 * settings — is blocked until the past-due invoice settles. Staff (servers.manage)
 * bypass this entirely so support can still work the server.
 */
const SUSPENDED_ALLOWED = new Set(["server.read"]);

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Honor @Public() exactly like JwtAuthGuard — routes that opt out of auth
    // (e.g. the HMAC-signed file download) authorize themselves.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const required =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    const req =
      context.getType<"graphql">() === "graphql"
        ? GqlExecutionContext.create(context).getContext().req
        : context.switchToHttp().getRequest();
    const user: AuthUser | undefined = req?.user;
    if (!user) throw new ForbiddenException("Not authenticated");

    const serverId =
      req?.params?.serverId ?? req?.params?.id ?? req?.body?.serverId;
    if (!serverId) {
      // No server scope on this route; nothing to enforce here.
      return true;
    }

    // API-key scope ceiling.
    if (user.apiKeyScopes && required.length) {
      const hasWrite = user.apiKeyScopes.some(
        (s) => s === "WRITE" || s === "ADMIN",
      );
      if (!hasWrite) throw new ForbiddenException("API key lacks write scope");
    }

    // Staff support override: a principal whose admin RBAC grants `servers.manage`
    // (ADMIN/OWNER by default) may operate any server, so support can help a
    // customer from the admin panel. Read-only staff (servers.read only) and
    // customers fall through to the owner/sub-user checks below.
    if (hasPermission(user.permissions ?? [], "servers.manage")) {
      return true;
    }

    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: { id: true, ownerId: true, state: true },
    });
    if (!server) throw new NotFoundException("Server not found");

    // A suspended (non-paying) server is view-only for the customer/sub-user —
    // block console, files, backups, settings, etc. so access actually stops when
    // billing lapses. Staff already returned above, so this only gates the tenant.
    if (
      server.state === "SUSPENDED" &&
      !required.every((p) => SUSPENDED_ALLOWED.has(p))
    ) {
      throw new ForbiddenException(
        "This server is suspended. Settle the past-due invoice to restore access.",
      );
    }

    if (server.ownerId === user.id) return true;

    const sub = await this.prisma.subUser.findFirst({
      where: { serverId, userId: user.id, state: "ACTIVE" },
      select: { permissions: true },
    });
    if (!sub) throw new ForbiddenException("Not a member of this server");

    // Wildcard-aware check (`files.*`, `*`) plus the implicit baseline
    // (`server.read`) every active sub-user holds — so the server pages load
    // and area grants work as documented.
    const missing = required.filter(
      (p) => !hasServerPermission(sub.permissions, p),
    );
    if (missing.length) {
      throw new ForbiddenException(
        `Missing permissions: ${missing.join(", ")}`,
      );
    }
    return true;
  }
}
