import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { AppConfig } from '../config/configuration';

/** Setting keys for runtime-editable payment-gateway credentials. */
const KEY = {
  stripeSecret: 'gateway.stripe.secretKey',
  stripeWebhook: 'gateway.stripe.webhookSecret',
  stripePublishable: 'gateway.stripe.publishableKey',
  paypalClientId: 'gateway.paypal.clientId',
  paypalClientSecret: 'gateway.paypal.clientSecret',
} as const;

export interface GatewayConfigInput {
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  stripePublishableKey?: string;
  paypalClientId?: string;
  paypalClientSecret?: string;
}

/**
 * Runtime key/value platform configuration. Secret values are AES-256-GCM
 * encrypted at rest; effective values fall back to environment variables when no
 * DB override is set. Used by the owner-editable payment-gateway settings.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
  ) {}

  async get(key: string): Promise<string | null> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key } });
    if (!row) return null;
    try {
      return row.encrypted ? this.crypto.decrypt(row.value) : row.value;
    } catch {
      return null; // unreadable (e.g. key rotated) — treat as unset
    }
  }

  /** Upsert a setting; an empty string clears it (falls back to env again). */
  async set(key: string, value: string, encrypted = false): Promise<void> {
    if (value === '') {
      await this.prisma.platformSetting.deleteMany({ where: { key } });
      return;
    }
    const stored = encrypted ? this.crypto.encrypt(value) : value;
    await this.prisma.platformSetting.upsert({
      where: { key },
      update: { value: stored, encrypted },
      create: { key, value: stored, encrypted },
    });
  }

  /** Effective Stripe config (DB override → env fallback). */
  async stripeConfig(): Promise<{
    secretKey: string;
    webhookSecret: string;
    publishableKey: string;
  }> {
    const env = this.config.get<AppConfig['stripe']>('stripe')!;
    return {
      secretKey: (await this.get(KEY.stripeSecret)) || env.secretKey || '',
      webhookSecret: (await this.get(KEY.stripeWebhook)) || env.webhookSecret || '',
      publishableKey:
        (await this.get(KEY.stripePublishable)) || env.publishableKey || '',
    };
  }

  async paypalConfig(): Promise<{ clientId: string; clientSecret: string }> {
    const env = this.config.get<AppConfig['paypal']>('paypal')!;
    return {
      clientId: (await this.get(KEY.paypalClientId)) || env.clientId || '',
      clientSecret:
        (await this.get(KEY.paypalClientSecret)) || env.clientSecret || '',
    };
  }

  /** Masked gateway config for the owner UI — never returns raw secrets. */
  async gatewayConfig() {
    const stripe = await this.stripeConfig();
    const paypal = await this.paypalConfig();
    const mask = (v: string) => (v ? `••••${v.slice(-4)}` : '');
    return {
      stripe: {
        configured: !!stripe.secretKey,
        secretKeyMasked: mask(stripe.secretKey),
        webhookSecretSet: !!stripe.webhookSecret,
        publishableKey: stripe.publishableKey,
      },
      paypal: {
        configured: !!paypal.clientId && !!paypal.clientSecret,
        clientId: paypal.clientId,
        clientSecretSet: !!paypal.clientSecret,
      },
    };
  }

  /** Apply owner edits; only provided fields are changed. Secrets are encrypted. */
  async setGatewayConfig(dto: GatewayConfigInput): Promise<void> {
    if (dto.stripeSecretKey !== undefined)
      await this.set(KEY.stripeSecret, dto.stripeSecretKey.trim(), true);
    if (dto.stripeWebhookSecret !== undefined)
      await this.set(KEY.stripeWebhook, dto.stripeWebhookSecret.trim(), true);
    if (dto.stripePublishableKey !== undefined)
      await this.set(KEY.stripePublishable, dto.stripePublishableKey.trim(), false);
    if (dto.paypalClientId !== undefined)
      await this.set(KEY.paypalClientId, dto.paypalClientId.trim(), false);
    if (dto.paypalClientSecret !== undefined)
      await this.set(KEY.paypalClientSecret, dto.paypalClientSecret.trim(), true);
  }
}
