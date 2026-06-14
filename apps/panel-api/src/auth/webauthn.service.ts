import { BadRequestException, Injectable } from '@nestjs/common';
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
} from '@simplewebauthn/server';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { uuidv7 } from '../common/util/uuid';
import { AppConfig } from '../config/configuration';

/**
 * WebAuthn (passkey) registration + authentication using
 * @simplewebauthn/server. The per-ceremony challenge is cached in Redis-less
 * fashion here via a short-lived DB-less map keyed by userId; for production a
 * Redis store is the documented path.
 */
@Injectable()
export class WebAuthnService {
  private readonly rpId: string;
  private readonly rpName: string;
  private readonly origin: string;
  // In-memory challenge cache (userId -> challenge). TODO(impl): move to Redis.
  private challenges = new Map<string, string>();

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {
    this.rpId = config.get<AppConfig['rpId']>('rpId')!;
    this.rpName = config.get<AppConfig['rpName']>('rpName')!;
    this.origin = config.get<AppConfig['panelUrl']>('panelUrl')!;
  }

  async registrationOptions(userId: string, email: string) {
    const creds = await this.prisma.webAuthnCredential.findMany({
      where: { userId },
    });
    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpId,
      userID: Buffer.from(userId),
      userName: email,
      attestationType: 'none',
      excludeCredentials: creds.map((c) => ({
        id: c.credentialId,
        transports: c.transports as any,
      })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    this.challenges.set(`reg:${userId}`, options.challenge);
    return options;
  }

  async verifyRegistration(
    userId: string,
    response: RegistrationResponseJSON,
    label?: string,
  ) {
    const expectedChallenge = this.challenges.get(`reg:${userId}`);
    if (!expectedChallenge) throw new BadRequestException('No registration in progress');

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
    });
    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Registration verification failed');
    }
    this.challenges.delete(`reg:${userId}`);

    const { credential, credentialDeviceType } = verification.registrationInfo as any;
    const credentialId: string = credential?.id ?? (verification.registrationInfo as any).credentialID;
    const publicKey: Uint8Array =
      credential?.publicKey ?? (verification.registrationInfo as any).credentialPublicKey;
    const counter: number =
      credential?.counter ?? (verification.registrationInfo as any).counter ?? 0;

    await this.prisma.webAuthnCredential.create({
      data: {
        id: uuidv7(),
        userId,
        credentialId,
        publicKey: Buffer.from(publicKey),
        counter: BigInt(counter),
        transports: response.response.transports ?? [],
        label: label ?? credentialDeviceType,
      },
    });
    return { verified: true };
  }

  async authenticationOptions(userId: string) {
    const creds = await this.prisma.webAuthnCredential.findMany({
      where: { userId },
    });
    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      allowCredentials: creds.map((c) => ({
        id: c.credentialId,
        transports: c.transports as any,
      })),
      userVerification: 'preferred',
    });
    this.challenges.set(`auth:${userId}`, options.challenge);
    return options;
  }

  async verifyAuthentication(userId: string, response: AuthenticationResponseJSON) {
    const expectedChallenge = this.challenges.get(`auth:${userId}`);
    if (!expectedChallenge) throw new BadRequestException('No authentication in progress');

    const cred = await this.prisma.webAuthnCredential.findUnique({
      where: { credentialId: response.id },
    });
    if (!cred || cred.userId !== userId) {
      throw new BadRequestException('Unknown credential');
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
      credential: {
        id: cred.credentialId,
        publicKey: new Uint8Array(cred.publicKey),
        counter: Number(cred.counter),
        transports: cred.transports as any,
      },
    });
    if (!verification.verified) {
      throw new BadRequestException('Authentication verification failed');
    }
    this.challenges.delete(`auth:${userId}`);

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
