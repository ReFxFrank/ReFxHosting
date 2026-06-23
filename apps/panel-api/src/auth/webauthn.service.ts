import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { RedisService } from '../common/redis/redis.service';
import { uuidv7 } from '../common/util/uuid';
import { AppConfig } from '../config/configuration';

/** Per-ceremony challenges expire quickly; this bounds the Redis key TTL. */
const CHALLENGE_TTL_SECONDS = 300;

/**
 * WebAuthn (passkey) registration + authentication using
 * @simplewebauthn/server v13. credentialId is stored as a base64url string; the
 * per-ceremony challenge is held in Redis (keyed by userId, short TTL) so it
 * survives across multiple API instances.
 */
@Injectable()
export class WebAuthnService {
  private readonly logger = new Logger(WebAuthnService.name);
  private readonly rpId: string;
  private readonly rpName: string;
  private readonly origin: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly redis: RedisService,
  ) {
    this.rpId = config.get<AppConfig['rpId']>('rpId')!;
    this.rpName = config.get<AppConfig['rpName']>('rpName')!;
    this.origin = config.get<AppConfig['panelUrl']>('panelUrl')!;
  }

  /**
   * Origins the browser assertion may legitimately come from. The configured
   * PANEL_URL is authoritative, but we also accept the RP domain (and the dev
   * localhost web/api ports) so a PANEL_URL that points at the API origin rather
   * than the exact web origin doesn't silently break passkeys.
   */
  private expectedOrigins(): string[] {
    const set = new Set<string>();
    if (this.origin) set.add(this.origin.replace(/\/+$/, ''));
    if (this.rpId === 'localhost') {
      set.add('http://localhost:3000');
      set.add('http://localhost:4000');
    } else if (this.rpId) {
      set.add(`https://${this.rpId}`);
    }
    return [...set];
  }

  private challengeKey(kind: 'reg' | 'auth', userId: string): string {
    return `webauthn:${kind}:${userId}`;
  }

  private setChallenge(kind: 'reg' | 'auth', userId: string, challenge: string) {
    return this.redis.client.set(
      this.challengeKey(kind, userId),
      challenge,
      'EX',
      CHALLENGE_TTL_SECONDS,
    );
  }

  private takeChallenge(kind: 'reg' | 'auth', userId: string) {
    // Read-and-delete so a challenge is single-use.
    const key = this.challengeKey(kind, userId);
    return this.redis.client
      .getdel(key)
      .catch(() => this.redis.client.get(key)); // fallback for older Redis
  }

  async registrationOptions(
    userId: string,
    email: string,
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const creds = await this.prisma.webAuthnCredential.findMany({
      where: { userId },
    });
    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpId,
      userID: new TextEncoder().encode(userId),
      userName: email,
      attestationType: 'none',
      excludeCredentials: creds.map((c) => ({
        id: c.credentialId,
        transports: c.transports as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });
    await this.setChallenge('reg', userId, options.challenge);
    return options;
  }

  async verifyRegistration(
    userId: string,
    response: RegistrationResponseJSON,
    label?: string,
  ) {
    const expectedChallenge = await this.takeChallenge('reg', userId);
    if (!expectedChallenge) {
      throw new BadRequestException('No registration in progress');
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.expectedOrigins(),
        expectedRPID: this.rpId,
        // Options request UV as 'preferred', so don't HARD-require it here — some
        // password managers (Dashlane, etc.) register without performing UV. The
        // passkey is a second factor (password already verified), so this is safe.
        requireUserVerification: false,
      });
    } catch (e) {
      // Surface the real reason (origin / RP-ID mismatch, bad attestation) so a
      // misconfigured PANEL_URL/PANEL_RP_ID is obvious instead of a blank 500.
      const detail = (e as Error).message ?? 'unknown error';
      this.logger.warn(`Passkey registration failed: ${detail}`);
      throw new BadRequestException(`Passkey registration failed: ${detail}`);
    }
    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Registration verification failed');
    }

    const { credential, credentialDeviceType } = verification.registrationInfo;

    await this.prisma.webAuthnCredential.create({
      data: {
        id: uuidv7(),
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        transports: response.response.transports ?? [],
        label: label ?? credentialDeviceType,
      },
    });
    return { verified: true };
  }

  /** List a user's registered passkeys (no secret material). */
  async listCredentials(userId: string) {
    const creds = await this.prisma.webAuthnCredential.findMany({
      where: { userId },
      select: { id: true, label: true, createdAt: true, lastUsedAt: true, transports: true },
      orderBy: { createdAt: 'desc' },
    });
    return creds;
  }

  /** Remove one of the user's passkeys by row id. */
  async removeCredential(userId: string, id: string): Promise<{ id: string }> {
    const cred = await this.prisma.webAuthnCredential.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!cred) throw new BadRequestException('Passkey not found');
    await this.prisma.webAuthnCredential.delete({ where: { id } });
    return { id };
  }

  async authenticationOptions(
    userId: string,
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const creds = await this.prisma.webAuthnCredential.findMany({
      where: { userId },
    });
    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      allowCredentials: creds.map((c) => ({
        id: c.credentialId,
        transports: c.transports as AuthenticatorTransportFuture[],
      })),
      userVerification: 'preferred',
    });
    await this.setChallenge('auth', userId, options.challenge);
    return options;
  }

  async verifyAuthentication(userId: string, response: AuthenticationResponseJSON) {
    const expectedChallenge = await this.takeChallenge('auth', userId);
    if (!expectedChallenge) {
      throw new BadRequestException('No authentication in progress');
    }

    const cred = await this.prisma.webAuthnCredential.findUnique({
      where: { credentialId: response.id },
    });
    if (!cred || cred.userId !== userId) {
      throw new BadRequestException('Unknown credential');
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.expectedOrigins(),
        expectedRPID: this.rpId,
        credential: {
          id: cred.credentialId,
          publicKey: new Uint8Array(cred.publicKey),
          counter: Number(cred.counter),
          transports: cred.transports as AuthenticatorTransportFuture[],
        },
        requireUserVerification: false,
      });
    } catch (e) {
      const detail = (e as Error).message ?? 'unknown error';
      this.logger.warn(`Passkey authentication failed: ${detail}`);
      throw new BadRequestException(`Passkey authentication failed: ${detail}`);
    }
    if (!verification.verified) {
      throw new BadRequestException('Authentication verification failed');
    }

    await this.prisma.webAuthnCredential.update({
      where: { id: cred.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });
    return { verified: true };
  }
}
