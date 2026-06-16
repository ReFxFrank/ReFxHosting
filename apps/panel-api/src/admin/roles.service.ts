import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { uuidv7 } from '../common/util/uuid';
import {
  ADMIN_PERMISSIONS,
  SYSTEM_ROLE_PERMISSIONS,
  WILDCARD,
} from '../common/permissions';
import { CreateRoleDto, UpdateRoleDto } from './dto/admin.dto';

/** The four built-in roles, mapped to the GlobalRole hierarchy. Never deletable. */
const SYSTEM_ROLES: { key: string; name: string; description: string }[] = [
  { key: 'owner', name: 'Owner', description: 'Full access, including payments and roles.' },
  { key: 'admin', name: 'Admin', description: 'Full management except owner-only financials.' },
  { key: 'support', name: 'Support', description: 'Read-only: overview, customers, servers.' },
  { key: 'customer', name: 'Customer', description: 'Client area only — no admin access.' },
];

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Catalog of assignable permissions (for the role editor UI). */
  permissionCatalog() {
    return { wildcard: WILDCARD, permissions: ADMIN_PERMISSIONS };
  }

  list() {
    return this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { users: true } } },
    });
  }

  private sanitizePermissions(perms: string[]): string[] {
    const allowed = new Set<string>([WILDCARD, ...ADMIN_PERMISSIONS]);
    return [...new Set(perms)].filter((p) => allowed.has(p));
  }

  async create(dto: CreateRoleDto): Promise<Role> {
    const key = dto.key
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/(^-|-$)/g, '');
    if (!key) throw new BadRequestException('Invalid role key');
    if (SYSTEM_ROLES.some((r) => r.key === key)) {
      throw new BadRequestException('That key is reserved by a system role');
    }
    const exists = await this.prisma.role.findUnique({ where: { key } });
    if (exists) throw new BadRequestException(`A role with key "${key}" already exists`);
    return this.prisma.role.create({
      data: {
        id: uuidv7(),
        key,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        isSystem: false,
        permissions: this.sanitizePermissions(dto.permissions ?? []),
      },
    });
  }

  async update(id: string, dto: UpdateRoleDto): Promise<Role> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    const data: Prisma.RoleUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    // Permissions are editable on every role — including the built-in
    // admin/support/customer — so an owner can tailor exactly what each tier can
    // do. The only guardrail: the `owner` role always retains the `*` wildcard,
    // so an owner can never accidentally strip away owner power and lock the
    // whole platform out of role/payment management.
    if (dto.permissions !== undefined) {
      const perms = this.sanitizePermissions(dto.permissions);
      data.permissions =
        role.key === 'owner' && !perms.includes(WILDCARD)
          ? [WILDCARD, ...perms]
          : perms;
    }
    return this.prisma.role.update({ where: { id }, data });
  }

  async remove(id: string): Promise<void> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new BadRequestException('System roles cannot be deleted');
    if (role._count.users > 0) {
      throw new BadRequestException(
        'Reassign the users on this role before deleting it',
      );
    }
    await this.prisma.role.delete({ where: { id } });
  }

  /** Idempotently ensure the system roles exist (called from seed). */
  async ensureSystemRoles(): Promise<void> {
    for (const r of SYSTEM_ROLES) {
      await this.prisma.role.upsert({
        where: { key: r.key },
        update: {
          name: r.name,
          description: r.description,
          permissions: SYSTEM_ROLE_PERMISSIONS[r.key],
          isSystem: true,
        },
        create: {
          id: uuidv7(),
          key: r.key,
          name: r.name,
          description: r.description,
          isSystem: true,
          permissions: SYSTEM_ROLE_PERMISSIONS[r.key],
        },
      });
    }
  }

}
