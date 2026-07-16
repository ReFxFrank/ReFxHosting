import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { GlobalRole, Prisma, SubUser, User, UserState } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  Paginated,
  PaginationDto,
  paginate,
} from "../common/dto/pagination.dto";
import { uuidv7 } from "../common/util/uuid";
import { deriveGlobalRole } from "../common/permissions";
import { nextCronRun } from "../servers/cron.util";
import { AddSubUserDto } from "./dto/add-sub-user.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";

/**
 * Secret columns that must NEVER leave the server. Applied as a Prisma `omit`
 * to every User read/write that returns a row to a client (profile, avatar,
 * admin list). The Argon2id password hash and the encrypted TOTP seed have no
 * business in an API response — admin.service already strips them for the
 * single-user staff view; this keeps the profile + list endpoints in line.
 */
const USER_SECRET_OMIT = {
  passwordHash: true,
  totpSecretEnc: true,
} as const;

/** Coarse global-role tiers, ranked for actor-vs-target comparisons. */
const ROLE_RANK: Record<GlobalRole, number> = {
  [GlobalRole.CUSTOMER]: 0,
  [GlobalRole.SUPPORT]: 1,
  [GlobalRole.ADMIN]: 2,
  [GlobalRole.OWNER]: 3,
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Profile -----------------------------------------------------------

  /** Fetch a single (non-deleted) user by id. */
  async getProfile(userId: string): Promise<User> {
    let user: User | null;
    try {
      // `omit` strips the secret columns; the row is otherwise complete, so the
      // cast back to User is safe (callers only read public profile fields).
      user = (await this.prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
        omit: USER_SECRET_OMIT,
      })) as User | null;
    } catch {
      // Defense-in-depth: if newer additive columns (roleId / contact address)
      // aren't present yet — e.g. migrations haven't been applied — a full-column
      // select throws and would otherwise 500 /auth/me, locking the entire UI
      // behind a perpetual loading state. Fall back to the stable column set so
      // the app still bootstraps; the migrate runner self-heals the schema.
      user = (await this.prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          globalRole: true,
          state: true,
          emailVerifiedAt: true,
          locale: true,
          timezone: true,
          avatarUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      })) as User | null;
    }
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  /** Update the caller's own editable profile fields (PATCH semantics). */
  /** Set the avatar from an uploaded (already-downscaled) base64 data URL. */
  async setAvatar(userId: string, dataUrl: string): Promise<User> {
    await this.getProfile(userId);
    return (await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: dataUrl },
      omit: USER_SECRET_OMIT,
    })) as User;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    // Ensure the user exists / isn't soft-deleted before writing.
    const before = await this.getProfile(userId);

    const data: Prisma.UserUpdateInput = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.locale !== undefined) data.locale = dto.locale;
    if (dto.timezone !== undefined) data.timezone = dto.timezone;
    // '' (the web's remove action) and null both clear the avatar.
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl || null;
    // Contact / billing address.
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.addressLine1 !== undefined) data.addressLine1 = dto.addressLine1;
    if (dto.addressLine2 !== undefined) data.addressLine2 = dto.addressLine2;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.region !== undefined) data.region = dto.region;
    if (dto.postalCode !== undefined) data.postalCode = dto.postalCode;
    if (dto.country !== undefined) data.country = dto.country;

    const updated = (await this.prisma.user.update({
      where: { id: userId },
      data,
      omit: USER_SECRET_OMIT,
    })) as User;

    // Server schedules interpret their cron in the OWNER's timezone. The next
    // occurrence is snapshotted on nextRunAt at create time, so a timezone
    // change must recompute the pending run of every active schedule the user
    // owns — otherwise a schedule keeps firing at the OLD offset until it fires
    // once (at the wrong time). This is what makes "set my timezone" actually
    // fix an already-created restart schedule.
    if (dto.timezone !== undefined && dto.timezone !== before.timezone) {
      await this.recomputeOwnerSchedules(userId, dto.timezone).catch(() => undefined);
    }
    return updated;
  }

  /** Re-snapshot nextRunAt for a user's active schedules in the given timezone. */
  private async recomputeOwnerSchedules(
    userId: string,
    timezone: string,
  ): Promise<void> {
    const schedules = await this.prisma.schedule.findMany({
      where: {
        isActive: true,
        server: { ownerId: userId, deletedAt: null },
      },
      select: { id: true, cron: true },
    });
    const now = new Date();
    await Promise.all(
      schedules.map((s) =>
        this.prisma.schedule.update({
          where: { id: s.id },
          data: { nextRunAt: nextCronRun(s.cron, now, timezone) },
        }),
      ),
    );
  }

  // ---- Admin: listing & lifecycle ---------------------------------------

  /** Admin-facing paginated user list with optional free-text filter. */
  async listUsers(
    pagination: PaginationDto,
    filter?: { role?: GlobalRole; state?: UserState },
  ): Promise<Paginated<User>> {
    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (filter?.role && Object.values(GlobalRole).includes(filter.role)) {
      where.globalRole = filter.role;
    }
    if (filter?.state && Object.values(UserState).includes(filter.state)) {
      where.state = filter.state;
    }
    if (pagination.q) {
      where.OR = [
        { email: { contains: pagination.q, mode: "insensitive" } },
        { firstName: { contains: pagination.q, mode: "insensitive" } },
        { lastName: { contains: pagination.q, mode: "insensitive" } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: "desc" },
        omit: USER_SECRET_OMIT,
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(data as User[], total, pagination);
  }

  /** Permanently bar a user from the platform. */
  banUser(id: string, actorId?: string): Promise<User> {
    return this.setState(id, UserState.BANNED, actorId);
  }

  /** Temporarily suspend a user (e.g. payment / abuse hold). */
  suspendUser(id: string, actorId?: string): Promise<User> {
    return this.setState(id, UserState.SUSPENDED, actorId);
  }

  /** Return a suspended/banned user to good standing. */
  reactivateUser(id: string): Promise<User> {
    return this.setState(id, UserState.ACTIVE);
  }

  /**
   * Staff: manually mark a user's email verified (stand-in until SMTP / email
   * verification links are configured). Stamps `emailVerifiedAt` if unset and
   * activates an account still PENDING_VERIFICATION.
   */
  async markEmailVerified(id: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, state: true, emailVerifiedAt: true },
    });
    if (!user) throw new NotFoundException("User not found");
    return this.prisma.user.update({
      where: { id },
      data: {
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        ...(user.state === UserState.PENDING_VERIFICATION
          ? { state: UserState.ACTIVE }
          : {}),
      },
    });
  }

  /**
   * Assign an RBAC role to a user (owner-only, gated at the controller). Accepts
   * either a specific role id (system or custom) or a GlobalRole enum (mapped to
   * the matching system role). Keeps globalRole in sync with the role's tier for
   * the coarse hierarchy/display, and refuses to remove the last OWNER.
   */
  async setRole(id: string, role?: GlobalRole, roleId?: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, globalRole: true },
    });
    if (!user) throw new NotFoundException("User not found");

    // Resolve the target Role row.
    let target: { id: string; key: string; permissions: string[] } | null =
      null;
    if (roleId) {
      target = await this.prisma.role.findUnique({
        where: { id: roleId },
        select: { id: true, key: true, permissions: true },
      });
    } else if (role && Object.values(GlobalRole).includes(role)) {
      target = await this.prisma.role.findUnique({
        where: { key: role.toLowerCase() },
        select: { id: true, key: true, permissions: true },
      });
    }
    if (!target) throw new BadRequestException("Unknown role");

    const newGlobal = deriveGlobalRole(
      target.permissions,
      target.key,
    ) as GlobalRole;

    if (
      user.globalRole === GlobalRole.OWNER &&
      newGlobal !== GlobalRole.OWNER
    ) {
      const owners = await this.prisma.user.count({
        where: { globalRole: GlobalRole.OWNER, deletedAt: null },
      });
      if (owners <= 1) {
        throw new BadRequestException(
          "Cannot demote the last owner — promote another owner first",
        );
      }
    }
    return this.prisma.user.update({
      where: { id },
      data: { roleId: target.id, globalRole: newGlobal },
    });
  }

  private async setState(
    id: string,
    state: UserState,
    actorId?: string,
  ): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, globalRole: true },
    });
    if (!user) throw new NotFoundException("User not found");

    // Rank guard: an actor may not ban/suspend a peer of equal-or-higher tier.
    // Without this, any ADMIN-tier staff (including a custom role that derived
    // to ADMIN) could ban another admin or an OWNER. Skipped for internal calls
    // that pass no actorId (e.g. billing-driven suspensions).
    if (actorId && actorId !== id) {
      const actor = await this.prisma.user.findUnique({
        where: { id: actorId },
        select: { globalRole: true },
      });
      if (actor && ROLE_RANK[user.globalRole] >= ROLE_RANK[actor.globalRole]) {
        throw new ForbiddenException(
          "Cannot change the state of an account at or above your role.",
        );
      }
    }

    return this.prisma.user.update({ where: { id }, data: { state } });
    // TODO(impl): emit a notification / lifecycle event so the user (and any
    // running servers) react to the state change (suspend servers on ban, etc.).
  }

  /**
   * Soft-delete a user account. Refuses while the user still owns servers (those
   * must be deleted/transferred first, so we never orphan a running server).
   */
  async deleteUser(id: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        email: true,
        _count: { select: { ownedServers: true } },
      },
    });
    if (!user) throw new NotFoundException("User not found");
    const servers = await this.prisma.server.count({
      where: { ownerId: id, deletedAt: null },
    });
    if (servers > 0) {
      throw new BadRequestException(
        "Cannot delete a user who still owns servers; delete or transfer their servers first",
      );
    }
    // Release the email so it can be registered again. The address is unique, so
    // a soft-deleted row would otherwise keep it reserved forever. We tombstone
    // it (preserving the original, readable, after the marker) instead of losing
    // it, which both frees the unique constraint and keeps an audit trail.
    await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        state: UserState.BANNED,
        email: `deleted:${Date.now()}:${user.email}`,
      },
    });
  }

  /**
   * Self-service account deletion. Soft-deletes + tombstones (reusing
   * deleteUser's server guard) and revokes all sessions. An OWNER must transfer
   * ownership first.
   */
  async deleteOwnAccount(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { globalRole: true },
    });
    if (!user) throw new NotFoundException("User not found");
    if (user.globalRole === GlobalRole.OWNER) {
      throw new BadRequestException(
        "Transfer ownership to another user before deleting your account",
      );
    }
    await this.deleteUser(userId);
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  /**
   * GDPR data export: the personal data we hold for a user, in one JSON object.
   * Secrets (password hash, TOTP seed, gateway refs) are never included.
   */
  async exportData(userId: string): Promise<Record<string, unknown>> {
    const [
      user,
      subscriptions,
      invoices,
      servers,
      paymentMethods,
      tickets,
      credit,
      apiKeys,
    ] = await this.prisma.$transaction([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          globalRole: true,
          state: true,
          locale: true,
          timezone: true,
          phone: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          region: true,
          postalCode: true,
          country: true,
          emailVerifiedAt: true,
          totpEnabledAt: true,
          creditBalanceMinor: true,
          createdAt: true,
        },
      }),
      this.prisma.subscription.findMany({
        where: { userId },
        select: {
          id: true,
          interval: true,
          slots: true,
          state: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          gateway: true,
          createdAt: true,
          product: { select: { name: true } },
        },
      }),
      this.prisma.invoice.findMany({
        where: { userId },
        select: {
          id: true,
          number: true,
          state: true,
          currency: true,
          subtotalMinor: true,
          discountMinor: true,
          taxMinor: true,
          totalMinor: true,
          amountPaidMinor: true,
          createdAt: true,
          paidAt: true,
          lineItems: {
            select: { description: true, quantity: true, amountMinor: true },
          },
        },
      }),
      this.prisma.server.findMany({
        where: { ownerId: userId, deletedAt: null },
        select: { id: true, shortId: true, name: true, state: true },
      }),
      this.prisma.paymentMethod.findMany({
        where: { userId },
        select: {
          gateway: true,
          brand: true,
          last4: true,
          expMonth: true,
          expYear: true,
        },
      }),
      this.prisma.ticket.findMany({
        where: { requesterId: userId },
        select: { number: true, subject: true, state: true, createdAt: true },
      }),
      this.prisma.creditTransaction.findMany({
        where: { userId },
        select: {
          amountMinor: true,
          reason: true,
          note: true,
          createdAt: true,
        },
      }),
      this.prisma.apiKey.findMany({
        where: { userId },
        select: { name: true, prefix: true, scopes: true, createdAt: true },
      }),
    ]);
    if (!user) throw new NotFoundException("User not found");
    return {
      exportedAt: new Date().toISOString(),
      account: user,
      subscriptions,
      invoices,
      servers,
      paymentMethods,
      tickets,
      creditTransactions: credit,
      apiKeys,
    };
  }

  /**
   * GDPR erasure (admin). Anonymizes personal data and removes auth material,
   * while RETAINING financial records (invoices/payments) for legal/tax reasons.
   * Refuses if the user still owns live servers.
   */
  async purgeUser(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, deletedAt: true },
    });
    if (!user) throw new NotFoundException("User not found");
    const servers = await this.prisma.server.count({
      where: { ownerId: id, deletedAt: null },
    });
    if (servers > 0) {
      throw new BadRequestException(
        "Cannot purge a user who still owns servers; delete or transfer them first",
      );
    }
    const tombstone = user.email.startsWith("deleted:")
      ? user.email
      : `deleted:${Date.now()}:${user.email}`;
    await this.prisma.$transaction([
      this.prisma.session.deleteMany({ where: { userId: id } }),
      this.prisma.webAuthnCredential.deleteMany({ where: { userId: id } }),
      this.prisma.apiKey.deleteMany({ where: { userId: id } }),
      this.prisma.paymentMethod.deleteMany({ where: { userId: id } }),
      this.prisma.recoveryCode.deleteMany({ where: { userId: id } }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId: id } }),
      this.prisma.emailVerificationToken.deleteMany({ where: { userId: id } }),
      this.prisma.user.update({
        where: { id },
        data: {
          deletedAt: user.deletedAt ?? new Date(),
          state: UserState.BANNED,
          email: tombstone,
          firstName: null,
          lastName: null,
          phone: null,
          addressLine1: null,
          addressLine2: null,
          city: null,
          region: null,
          postalCode: null,
          country: null,
          avatarUrl: null,
          passwordHash: null,
          totpSecretEnc: null,
          totpEnabledAt: null,
          gatewayCustomerId: null,
        },
      }),
    ]);
  }

  // ---- Sub-users (per-server collaborators) -----------------------------

  /** List active + revoked sub-user grants for a server. */
  async listSubUsers(serverId: string): Promise<SubUser[]> {
    await this.assertServerExists(serverId);
    return this.prisma.subUser.findMany({
      where: { serverId },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Grant an existing platform user (looked up by email) access to a server.
   * Re-activates a previously revoked grant rather than failing.
   */
  async addSubUser(serverId: string, dto: AddSubUserDto): Promise<SubUser> {
    const server = await this.assertServerExists(serverId);

    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new NotFoundException("No user found with that email");

    if (user.id === server.ownerId) {
      throw new ConflictException(
        "The server owner already has full access and cannot be a sub-user",
      );
    }

    const existing = await this.prisma.subUser.findUnique({
      where: { serverId_userId: { serverId, userId: user.id } },
    });

    if (existing) {
      if (existing.state === "ACTIVE") {
        throw new ConflictException(
          "This user is already a sub-user on this server",
        );
      }
      // Reinstate a revoked grant with the new permission set.
      const reinstated = await this.prisma.subUser.update({
        where: { id: existing.id },
        data: { state: "ACTIVE", permissions: dto.permissions },
      });
      // TODO(impl): send a notification email letting the user know access was restored.
      return reinstated;
    }

    const created = await this.prisma.subUser.create({
      data: {
        id: uuidv7(),
        serverId,
        userId: user.id,
        permissions: dto.permissions,
        state: "ACTIVE",
      },
    });
    // TODO(impl): send a notification email inviting the user to the server.
    return created;
  }

  /** Replace the full permission set of an existing sub-user grant. */
  async updateSubUserPermissions(
    serverId: string,
    subUserId: string,
    permissions: string[],
  ): Promise<SubUser> {
    const sub = await this.getServerSubUser(serverId, subUserId);
    return this.prisma.subUser.update({
      where: { id: sub.id },
      data: { permissions },
    });
  }

  /** Revoke (soft) a sub-user's access; idempotent. */
  async revokeSubUser(serverId: string, subUserId: string): Promise<SubUser> {
    const sub = await this.getServerSubUser(serverId, subUserId);
    return this.prisma.subUser.update({
      where: { id: sub.id },
      data: { state: "REVOKED" },
    });
  }

  // ---- Helpers -----------------------------------------------------------

  private async assertServerExists(
    serverId: string,
  ): Promise<{ id: string; ownerId: string }> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: { id: true, ownerId: true },
    });
    if (!server) throw new NotFoundException("Server not found");
    return server;
  }

  private async getServerSubUser(
    serverId: string,
    subUserId: string,
  ): Promise<SubUser> {
    const sub = await this.prisma.subUser.findFirst({
      where: { id: subUserId, serverId },
    });
    if (!sub) throw new NotFoundException("Sub-user not found on this server");
    return sub;
  }
}
