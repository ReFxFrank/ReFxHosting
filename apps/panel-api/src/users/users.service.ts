import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GlobalRole, Prisma, SubUser, User, UserState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  Paginated,
  PaginationDto,
  paginate,
} from '../common/dto/pagination.dto';
import { uuidv7 } from '../common/util/uuid';
import { deriveGlobalRole } from '../common/permissions';
import { AddSubUserDto } from './dto/add-sub-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Profile -----------------------------------------------------------

  /** Fetch a single (non-deleted) user by id. */
  async getProfile(userId: string): Promise<User> {
    let user: User | null;
    try {
      user = await this.prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
      });
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
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Update the caller's own editable profile fields (PATCH semantics). */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    // Ensure the user exists / isn't soft-deleted before writing.
    await this.getProfile(userId);

    const data: Prisma.UserUpdateInput = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.locale !== undefined) data.locale = dto.locale;
    if (dto.timezone !== undefined) data.timezone = dto.timezone;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;
    // Contact / billing address.
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.addressLine1 !== undefined) data.addressLine1 = dto.addressLine1;
    if (dto.addressLine2 !== undefined) data.addressLine2 = dto.addressLine2;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.region !== undefined) data.region = dto.region;
    if (dto.postalCode !== undefined) data.postalCode = dto.postalCode;
    if (dto.country !== undefined) data.country = dto.country;

    return this.prisma.user.update({ where: { id: userId }, data });
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
        { email: { contains: pagination.q, mode: 'insensitive' } },
        { firstName: { contains: pagination.q, mode: 'insensitive' } },
        { lastName: { contains: pagination.q, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  /** Permanently bar a user from the platform. */
  banUser(id: string): Promise<User> {
    return this.setState(id, UserState.BANNED);
  }

  /** Temporarily suspend a user (e.g. payment / abuse hold). */
  suspendUser(id: string): Promise<User> {
    return this.setState(id, UserState.SUSPENDED);
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
    if (!user) throw new NotFoundException('User not found');
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
  async setRole(
    id: string,
    role?: GlobalRole,
    roleId?: string,
  ): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, globalRole: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // Resolve the target Role row.
    let target: { id: string; key: string; permissions: string[] } | null = null;
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
    if (!target) throw new BadRequestException('Unknown role');

    const newGlobal = deriveGlobalRole(
      target.permissions,
      target.key,
    ) as GlobalRole;

    if (user.globalRole === GlobalRole.OWNER && newGlobal !== GlobalRole.OWNER) {
      const owners = await this.prisma.user.count({
        where: { globalRole: GlobalRole.OWNER, deletedAt: null },
      });
      if (owners <= 1) {
        throw new BadRequestException(
          'Cannot demote the last owner — promote another owner first',
        );
      }
    }
    return this.prisma.user.update({
      where: { id },
      data: { roleId: target.id, globalRole: newGlobal },
    });
  }

  private async setState(id: string, state: UserState): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

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
    if (!user) throw new NotFoundException('User not found');
    const servers = await this.prisma.server.count({
      where: { ownerId: id, deletedAt: null },
    });
    if (servers > 0) {
      throw new BadRequestException(
        'Cannot delete a user who still owns servers; delete or transfer their servers first',
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

  // ---- Sub-users (per-server collaborators) -----------------------------

  /** List active + revoked sub-user grants for a server. */
  async listSubUsers(serverId: string): Promise<SubUser[]> {
    await this.assertServerExists(serverId);
    return this.prisma.subUser.findMany({
      where: { serverId },
      orderBy: { createdAt: 'asc' },
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
    if (!user) throw new NotFoundException('No user found with that email');

    if (user.id === server.ownerId) {
      throw new ConflictException(
        'The server owner already has full access and cannot be a sub-user',
      );
    }

    const existing = await this.prisma.subUser.findUnique({
      where: { serverId_userId: { serverId, userId: user.id } },
    });

    if (existing) {
      if (existing.state === 'ACTIVE') {
        throw new ConflictException(
          'This user is already a sub-user on this server',
        );
      }
      // Reinstate a revoked grant with the new permission set.
      const reinstated = await this.prisma.subUser.update({
        where: { id: existing.id },
        data: { state: 'ACTIVE', permissions: dto.permissions },
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
        state: 'ACTIVE',
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
      data: { state: 'REVOKED' },
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
    if (!server) throw new NotFoundException('Server not found');
    return server;
  }

  private async getServerSubUser(
    serverId: string,
    subUserId: string,
  ): Promise<SubUser> {
    const sub = await this.prisma.subUser.findFirst({
      where: { id: subUserId, serverId },
    });
    if (!sub) throw new NotFoundException('Sub-user not found on this server');
    return sub;
  }
}
