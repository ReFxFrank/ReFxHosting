import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ApiKey, ApiKeyScope } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

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
      },
    });
    return { plaintext, record };
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
    if (key.allowedIps.length && ip && !this.ipAllowed(ip, key.allowedIps)) {
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
      apiKeyId: key.id,
      apiKeyScopes: key.scopes,
    };
  }

  /** Minimal CIDR / exact match. IPv4 CIDR supported; exact match otherwise. */
  private ipAllowed(ip: string, allow: string[]): boolean {
    return allow.some((entry) => {
      if (!entry.includes('/')) return entry === ip;
      const [range, bitsStr] = entry.split('/');
      const bits = Number.parseInt(bitsStr, 10);
      const toInt = (a: string) =>
        a.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      try {
        return (toInt(ip) & mask) === (toInt(range) & mask);
      } catch {
        return false;
      }
    });
  }
}
