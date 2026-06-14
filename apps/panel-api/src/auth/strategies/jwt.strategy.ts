import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';

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
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, email: true, globalRole: true, state: true },
    });
    if (!user) throw new UnauthorizedException('User not found');
    if (user.state === 'BANNED' || user.state === 'SUSPENDED') {
      throw new UnauthorizedException(`Account ${user.state.toLowerCase()}`);
    }
    return {
      id: user.id,
      email: user.email,
      globalRole: user.globalRole,
      state: user.state,
    };
  }
}
