import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import {
  SIGN_HEADER_NODE,
  SIGN_HEADER_SIGNATURE,
  SIGN_HEADER_TIMESTAMP,
  deriveSigningKey,
  verifyRequest,
} from './agent.signing';

/**
 * Authenticates inbound node-agent callbacks (heartbeat/stats/logs/...) using
 * the same HMAC-SHA256 scheme the panel uses to call the agent
 * (see agent.signing.ts). The node is identified by the `X-Refx-Node` header;
 * its per-node signing key is recomputed deterministically (never persisted).
 *
 * On success the resolved node id is attached to `req.refxNodeId` for handlers.
 */
@Injectable()
export class AgentSignatureGuard implements CanActivate {
  private readonly secretsEncKey: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.secretsEncKey = config.get<string>('secretsEncKey')!;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & {
      rawBody?: Buffer;
      refxNodeId?: string;
    }>();

    const nodeId = req.header(SIGN_HEADER_NODE);
    const timestamp = req.header(SIGN_HEADER_TIMESTAMP);
    const signature = req.header(SIGN_HEADER_SIGNATURE);
    if (!nodeId || !timestamp || !signature) {
      throw new UnauthorizedException('missing signature headers');
    }

    const node = await this.prisma.node.findFirst({
      where: { id: nodeId, deletedAt: null },
      select: { id: true },
    });
    if (!node) throw new UnauthorizedException('unknown node');

    const key = deriveSigningKey(this.secretsEncKey, node.id);

    // The canonical path the agent signs is the request path WITHOUT the query
    // string and WITH the global `/api/v1` prefix (req.originalUrl carries the
    // full path the agent actually called).
    const path = (req.originalUrl || req.url).split('?')[0];
    const body = req.rawBody ? req.rawBody.toString('utf8') : '';

    const ok = verifyRequest(
      key,
      req.method,
      path,
      timestamp,
      signature,
      body,
    );
    if (!ok) throw new UnauthorizedException('invalid signature');

    req.refxNodeId = node.id;
    return true;
  }
}
