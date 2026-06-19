import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { GqlExecutionContext } from '@nestjs/graphql';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ApiKeyService } from '../api-key.service';
import { resolveClientIp } from '../client-ip.util';

/**
 * Primary auth guard. Honors @Public(), accepts an `X-Api-Key` header
 * (delegating to ApiKeyService) and otherwise falls back to JWT bearer auth.
 * Works for both REST and GraphQL execution contexts.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeys: ApiKeyService,
  ) {
    super();
  }

  getRequest(context: ExecutionContext) {
    if (context.getType<'graphql'>() === 'graphql') {
      return GqlExecutionContext.create(context).getContext().req;
    }
    return context.switchToHttp().getRequest();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = this.getRequest(context);
    const apiKey = req?.headers?.['x-api-key'];
    if (apiKey) {
      req.user = await this.apiKeys.authenticate(
        Array.isArray(apiKey) ? apiKey[0] : apiKey,
        resolveClientIp(req),
      );
      return true;
    }

    return super.canActivate(context) as Promise<boolean>;
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }
}
