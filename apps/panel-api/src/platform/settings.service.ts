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
  stripeStatementDescriptor: 'gateway.stripe.statementDescriptor',
  paypalClientId: 'gateway.paypal.clientId',
  paypalClientSecret: 'gateway.paypal.clientSecret',
  paypalMode: 'gateway.paypal.mode',
  paypalWebhookId: 'gateway.paypal.webhookId',
  smtpHost: 'email.smtp.host',
  smtpPort: 'email.smtp.port',
  smtpUser: 'email.smtp.user',
  smtpPassword: 'email.smtp.password',
  smtpFrom: 'email.smtp.from',
  smtpSecure: 'email.smtp.secure',
} as const;

export interface GatewayConfigInput {
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  stripePublishableKey?: string;
  /** Text shown on the customer's card statement (≤22 chars, branding). */
  stripeStatementDescriptor?: string;
  paypalClientId?: string;
  paypalClientSecret?: string;
  paypalMode?: string; // 'sandbox' | 'live'
  paypalWebhookId?: string;
}

export interface EmailConfigInput {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  from?: string;
  secure?: boolean;
}

export interface EffectiveEmailConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  secure: boolean;
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
    statementDescriptor: string;
  }> {
    const env = this.config.get<AppConfig['stripe']>('stripe')!;
    return {
      secretKey: (await this.get(KEY.stripeSecret)) || env.secretKey || '',
      webhookSecret: (await this.get(KEY.stripeWebhook)) || env.webhookSecret || '',
      publishableKey:
        (await this.get(KEY.stripePublishable)) || env.publishableKey || '',
      statementDescriptor:
        (await this.get(KEY.stripeStatementDescriptor)) ||
        process.env.STRIPE_STATEMENT_DESCRIPTOR ||
        '',
    };
  }

  async paypalConfig(): Promise<{
    clientId: string;
    clientSecret: string;
    mode: string;
    webhookId: string;
  }> {
    const env = this.config.get<AppConfig['paypal']>('paypal')!;
    return {
      clientId: (await this.get(KEY.paypalClientId)) || env.clientId || '',
      clientSecret:
        (await this.get(KEY.paypalClientSecret)) || env.clientSecret || '',
      mode: (await this.get(KEY.paypalMode)) || env.mode || 'sandbox',
      webhookId:
        (await this.get(KEY.paypalWebhookId)) ||
        process.env.PAYPAL_WEBHOOK_ID ||
        '',
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
        statementDescriptor: stripe.statementDescriptor,
      },
      paypal: {
        configured: !!paypal.clientId && !!paypal.clientSecret,
        clientId: paypal.clientId,
        clientSecretSet: !!paypal.clientSecret,
        mode: paypal.mode,
        webhookId: paypal.webhookId,
      },
    };
  }

  // ---- Email (SMTP) ------------------------------------------------------

  /** Effective SMTP config (DB override → env fallback). */
  async emailConfig(): Promise<EffectiveEmailConfig> {
    const env = this.config.get<AppConfig['email']>('email')!;
    const portStr = await this.get(KEY.smtpPort);
    const secureStr = await this.get(KEY.smtpSecure);
    return {
      host: (await this.get(KEY.smtpHost)) || env.host || '',
      port: portStr ? Number(portStr) : env.port || 587,
      user: (await this.get(KEY.smtpUser)) || env.user || '',
      password: (await this.get(KEY.smtpPassword)) || env.password || '',
      from: (await this.get(KEY.smtpFrom)) || env.from || '',
      secure: secureStr ? secureStr === 'true' : !!env.secure,
    };
  }

  /** Masked SMTP config for the owner UI — never returns the raw password. */
  async emailConfigMasked() {
    const cfg = await this.emailConfig();
    return {
      configured: !!cfg.host,
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      from: cfg.from,
      secure: cfg.secure,
      passwordSet: !!cfg.password,
    };
  }

  /** Apply owner email edits; only provided fields change. Password is encrypted. */
  async setEmailConfig(dto: EmailConfigInput): Promise<void> {
    if (dto.host !== undefined) await this.set(KEY.smtpHost, dto.host.trim(), false);
    if (dto.port !== undefined)
      await this.set(KEY.smtpPort, String(dto.port), false);
    if (dto.user !== undefined) await this.set(KEY.smtpUser, dto.user.trim(), false);
    if (dto.password !== undefined)
      await this.set(KEY.smtpPassword, dto.password, true);
    if (dto.from !== undefined) await this.set(KEY.smtpFrom, dto.from.trim(), false);
    if (dto.secure !== undefined)
      await this.set(KEY.smtpSecure, dto.secure ? 'true' : 'false', false);
  }

  /** Apply owner edits; only provided fields are changed. Secrets are encrypted. */
  async setGatewayConfig(dto: GatewayConfigInput): Promise<void> {
    if (dto.stripeSecretKey !== undefined)
      await this.set(KEY.stripeSecret, dto.stripeSecretKey.trim(), true);
    if (dto.stripeWebhookSecret !== undefined)
      await this.set(KEY.stripeWebhook, dto.stripeWebhookSecret.trim(), true);
    if (dto.stripePublishableKey !== undefined)
      await this.set(KEY.stripePublishable, dto.stripePublishableKey.trim(), false);
    if (dto.stripeStatementDescriptor !== undefined)
      // Stripe caps the descriptor at 22 chars and forbids < > \ ' " *.
      await this.set(
        KEY.stripeStatementDescriptor,
        dto.stripeStatementDescriptor.replace(/[<>\\'"*]/g, '').trim().slice(0, 22),
        false,
      );
    if (dto.paypalClientId !== undefined)
      await this.set(KEY.paypalClientId, dto.paypalClientId.trim(), false);
    if (dto.paypalClientSecret !== undefined)
      await this.set(KEY.paypalClientSecret, dto.paypalClientSecret.trim(), true);
    if (dto.paypalMode !== undefined)
      await this.set(
        KEY.paypalMode,
        dto.paypalMode === 'live' ? 'live' : 'sandbox',
        false,
      );
    if (dto.paypalWebhookId !== undefined)
      await this.set(KEY.paypalWebhookId, dto.paypalWebhookId.trim(), false);
  }
}
