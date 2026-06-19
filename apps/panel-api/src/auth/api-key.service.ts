import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKey, ApiKeyScope } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { permissionsForGlobalRole } from '../common/permissions';
import { ipAllowed } from './ip-allow.util';

/**
 * API-key authentication. Keys are formatted `refx_<prefix><secret>`; we look up
 * by prefix, compare a SHA-256 hash in constant-ish time, then enforce expiry,
 * revocation and the optional CIDR IP allowlist.
 */
@Injectable()
export class ApiKeyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /** Issue a new key, returning the one-time plaintext (never stored). */
  async issue(
    userId: string,
    name: string,
    scopes: ApiKeyScope[],
    allowedIps: string[] = [],
    expiresAt?: Date,
    permissions: string[] = [],
  ): Promise<{ plaintext: string; record: ApiKey }> {
    const prefix = this.crypto.token(6).slice(0, 8);
    const secret = this.crypto.token(24);
    const plaintext = `refx_${prefix}${secret}`;
    const { uuidv7 } = await import('../common/util/uuid');
    const record = await this.prisma.apiKey.create({
      data: {
        id: uuidv7(),
        userId,
        name,
        prefix,
        keyHash: this.crypto.hash(plaintext),
        scopes,
        allowedIps,
        expiresAt: expiresAt ?? null,
        permissions,
      },
    });
    return { plaintext, record };
  }

  /** List a user's API keys (never exposes the hash). */
  async list(userId: string) {
    return this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        permissions: true,
        allowedIps: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
  }

  /** Revoke (soft) a key owned by the user. Idempotent. */
  async revoke(userId: string, id: string): Promise<void> {
    const key = await this.prisma.apiKey.findFirst({ where: { id, userId } });
    if (!key) throw new NotFoundException('API key not found');
    await this.prisma.apiKey.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async authenticate(rawKey: string, ip?: string): Promise<AuthUser> {
    const match = /^refx_(.{8})(.+)$/.exec(rawKey);
    if (!match) throw new UnauthorizedException('Malformed API key');
    const prefix = match[1];

    const key = await this.prisma.apiKey.findUnique({
      where: { prefix },
      include: { user: { select: { id: true, email: true, globalRole: true, state: true } } },
    });
    if (!key || key.keyHash !== this.crypto.hash(rawKey)) {
      throw new UnauthorizedException('Invalid API key');
    }
    if (key.revokedAt) throw new UnauthorizedException('API key revoked');
    if (key.expiresAt && key.expiresAt < new Date()) {
      throw new UnauthorizedException('API key expired');
    }
    if (key.user.state !== 'ACTIVE') {
      throw new UnauthorizedException('Account not active');
    }
    if (key.allowedIps.length && ip && !ipAllowed(ip, key.allowedIps)) {
      throw new UnauthorizedException('Source IP not allowed for this key');
    }

    await this.prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      id: key.user.id,
      email: key.user.email,
      globalRole: key.user.globalRole,
      state: key.user.state,
      permissions: permissionsForGlobalRole(key.user.globalRole),
      apiKeyId: key.id,
      apiKeyScopes: key.scopes,
      // Fine-grained grants carried by the key itself (least-privilege bot path).
      apiKeyPermissions: key.permissions,
    };
  }
}
