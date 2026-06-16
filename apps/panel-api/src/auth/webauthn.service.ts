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
  AuthenticatorTransportFuture,
} from '@simplewebauthn/types';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { uuidv7 } from '../common/util/uuid';
import { AppConfig } from '../config/configuration';

/**
 * WebAuthn (passkey) registration + authentication using
 * @simplewebauthn/server v9. credentialId is stored as a base64url string; the
 * per-ceremony challenge is cached in-process keyed by userId. TODO(impl): move
 * the challenge store to Redis so it survives multiple API instances.
 */
@Injectable()
export class WebAuthnService {
  private readonly rpId: string;
  private readonly rpName: string;
  private readonly origin: string;
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

  private b64url(buf: Uint8Array): string {
    return Buffer.from(buf).toString('base64url');
  }

  async registrationOptions(userId: string, email: string) {
    const creds = await this.prisma.webAuthnCredential.findMany({
      where: { userId },
    });
    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpId,
      userID: userId,
      userName: email,
      attestationType: 'none',
      excludeCredentials: creds.map((c) => ({
        id: Buffer.from(c.credentialId, 'base64url'),
        type: 'public-key',
        transports: c.transports as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
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
    if (!expectedChallenge) {
      throw new BadRequestException('No registration in progress');
    }

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

    const { credentialID, credentialPublicKey, counter, credentialDeviceType } =
      verification.registrationInfo;

    await this.prisma.webAuthnCredential.create({
      data: {
        id: uuidv7(),
        userId,
        credentialId: this.b64url(credentialID),
        publicKey: Buffer.from(credentialPublicKey),
        counter: BigInt(counter),
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

  async authenticationOptions(userId: string) {
    const creds = await this.prisma.webAuthnCredential.findMany({
      where: { userId },
    });
    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      allowCredentials: creds.map((c) => ({
        id: Buffer.from(c.credentialId, 'base64url'),
        type: 'public-key',
        transports: c.transports as AuthenticatorTransportFuture[],
      })),
      userVerification: 'preferred',
    });
    this.challenges.set(`auth:${userId}`, options.challenge);
    return options;
  }

  async verifyAuthentication(userId: string, response: AuthenticationResponseJSON) {
    const expectedChallenge = this.challenges.get(`auth:${userId}`);
    if (!expectedChallenge) {
      throw new BadRequestException('No authentication in progress');
    }

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
      authenticator: {
        credentialID: Buffer.from(cred.credentialId, 'base64url'),
        credentialPublicKey: new Uint8Array(cred.publicKey),
        counter: Number(cred.counter),
        transports: cred.transports as AuthenticatorTransportFuture[],
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
