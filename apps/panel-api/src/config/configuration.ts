/**
 * Typed application configuration derived from environment variables.
 * Loaded once by ConfigModule (see app.module.ts) and consumed via
 * ConfigService.get<AppConfig['...']>('...').
 */

export interface AppConfig {
  env: string;
  port: number;
  apiPrefix: string;
  panelUrl: string;
  rpId: string;
  rpName: string;
  corsOrigins: string[];
  database: {
    url: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: number;
    refreshTtl: number;
    mfaSecret: string;
    mfaTtl: number;
  };
  secretsEncKey: string;
  email: {
    host?: string;
    port: number;
    user?: string;
    password?: string;
    from: string;
    secure: boolean;
  };
  agent: {
    requestTimeoutMs: number;
  };
  stripe: {
    secretKey: string;
    webhookSecret: string;
  };
  paypal: {
    clientId: string;
    clientSecret: string;
    mode: string;
  };
  billing: {
    invoiceNumberPrefix: string;
    defaultCurrency: string;
  };
  throttle: {
    ttl: number;
    limit: number;
  };
}

const toInt = (v: string | undefined, fallback: number): number => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

const toList = (v: string | undefined): string[] =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: toInt(process.env.PORT, 4000),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  panelUrl: process.env.PANEL_URL ?? 'http://localhost:3000',
  rpId: process.env.PANEL_RP_ID ?? 'localhost',
  rpName: process.env.PANEL_RP_NAME ?? 'ReFx Hosting',
  corsOrigins: toList(process.env.CORS_ORIGINS) || ['http://localhost:3000'],
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: toInt(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: toInt(process.env.REDIS_DB, 0),
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
    accessTtl: toInt(process.env.JWT_ACCESS_TTL, 900),
    refreshTtl: toInt(process.env.JWT_REFRESH_TTL, 2592000),
    // Dedicated secret for the short-lived MFA login challenge token. Falls back
    // to a derived value so the challenge is still unforgeable in dev/test.
    mfaSecret:
      process.env.JWT_MFA_SECRET ??
      `${process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret'}:mfa`,
    mfaTtl: toInt(process.env.JWT_MFA_TTL, 300), // 5 minutes
  },
  secretsEncKey:
    process.env.SECRETS_ENC_KEY ??
    '0'.repeat(64),
  email: {
    host: process.env.SMTP_HOST || undefined,
    port: toInt(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || undefined,
    password: process.env.SMTP_PASSWORD || undefined,
    from: process.env.SMTP_FROM || 'ReFx Hosting <no-reply@refx.example>',
    secure: (process.env.SMTP_SECURE ?? '').toLowerCase() === 'true',
  },
  agent: {
    requestTimeoutMs: toInt(process.env.AGENT_REQUEST_TIMEOUT_MS, 15000),
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  },
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID ?? '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? '',
    mode: process.env.PAYPAL_MODE ?? 'sandbox',
  },
  billing: {
    invoiceNumberPrefix: process.env.INVOICE_NUMBER_PREFIX ?? 'INV',
    defaultCurrency: process.env.DEFAULT_CURRENCY ?? 'USD',
  },
  throttle: {
    ttl: toInt(process.env.THROTTLE_TTL, 60),
    limit: toInt(process.env.THROTTLE_LIMIT, 120),
  },
});
