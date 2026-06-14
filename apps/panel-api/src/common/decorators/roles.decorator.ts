import { SetMetadata } from '@nestjs/common';
import { GlobalRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restrict a route/resolver to one or more GlobalRoles. Combined with
 * RolesGuard. OWNER implicitly satisfies any requirement (see guard).
 */
export const Roles = (...roles: GlobalRole[]) => SetMetadata(ROLES_KEY, roles);
