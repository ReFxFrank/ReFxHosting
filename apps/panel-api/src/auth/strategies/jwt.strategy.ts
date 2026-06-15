import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { permissionsForGlobalRole } from '../../common/permissions';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  type: 'access';
}

/**
 * Validates access tokens. Re-checks the user still exists and is not
 * banned/suspended on every request so revocation is immediate for state
 * changes (refresh-token revocation is handled separately via Session).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<AppConfig['jwt']>('jwt')!.accessSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }
    type LoadedUser = {
      id: string;
      email: string;
      globalRole: string;
      state: string;
      role?: { permissions: string[] } | null;
    };
    let user: LoadedUser | null;
    try {
      user = (await this.prisma.user.findFirst({
        where: { id: payload.sub, deletedAt: null },
        select: {
          id: true,
          email: true,
          globalRole: true,
          state: true,
          role: { select: { permissions: true } },
        },
      })) as LoadedUser | null;
    } catch {
      // RBAC tables not migrated yet (e.g. migrate hasn't run) — fall back to a
      // basic lookup so authentication never hard-fails for the whole app.
      user = (await this.prisma.user.findFirst({
        where: { id: payload.sub, deletedAt: null },
        select: { id: true, email: true, globalRole: true, state: true },
      })) as LoadedUser | null;
    }
    if (!user) throw new UnauthorizedException('User not found');
    if (user.state === 'BANNED' || user.state === 'SUSPENDED') {
      throw new UnauthorizedException(`Account ${user.state.toLowerCase()}`);
    }
    // Effective permissions: the assigned RBAC role, else the globalRole default.
    const permissions =
      user.role?.permissions ?? permissionsForGlobalRole(user.globalRole);
    return {
      id: user.id,
      email: user.email,
      globalRole: user.globalRole,
      state: user.state,
      permissions,
    };
  }
}
