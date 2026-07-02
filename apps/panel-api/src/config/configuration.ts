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
  agentTlsPinning: boolean;
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
    /** Cover the request query string in the panel->agent HMAC signature. */
    signQuery: boolean;
  };
  stripe: {
    secretKey: string;
    webhookSecret: string;
    publishableKey: string;
  };
  paypal: {
    clientId: string;
    clientSecret: string;
    mode: string;
  };
  billing: {
    invoiceNumberPrefix: string;
    defaultCurrency: string;
    schedulerEnabled: boolean;
  };
  support: {
    /** Auto-resolve/close stale tickets on a schedule. */
    autoResolveEnabled: boolean;
    /** Days a ticket awaiting the customer can idle before auto-RESOLVE (0=off). */
    autoResolveDays: number;
    /** Days a RESOLVED ticket can idle before auto-CLOSE (0=off). */
    autoCloseDays: number;
  };
  throttle: {
    ttl: number;
    limit: number;
  };
  apns: {
    /** Contents of the .p8 token-signing key (PEM). Empty disables push. */
    keyP8: string;
    keyId: string;
    teamId: string;
    bundleId: string;
    /** true -> api.push.apple.com, false -> api.sandbox.push.apple.com */
    production: boolean;
  };
  web: {
    /** URL the status feed pings to report Web Dashboard health. */
    healthUrl: string;
  };
}

const toInt = (v: string | undefined, fallback: number): number => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
};

const toList = (v: string | undefined): string[] =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export default (): AppConfig => {
  const config: AppConfig = {
    env: process.env.NODE_ENV ?? "development",
    port: toInt(process.env.PORT, 4000),
    apiPrefix: process.env.API_PREFIX ?? "api/v1",
    panelUrl: process.env.PANEL_URL ?? "http://localhost:3000",
    rpId: process.env.PANEL_RP_ID ?? "localhost",
    rpName: process.env.PANEL_RP_NAME ?? "ReFx Hosting",
    // When on, the panel pins each node's agent TLS cert (verifies it against the
    // stored cert) instead of accepting any cert. Off by default so existing
    // self-signed setups keep working until operators pin per node.
    agentTlsPinning:
      (process.env.AGENT_TLS_PINNING ?? "false").toLowerCase() === "true",
    corsOrigins: toList(process.env.CORS_ORIGINS) || ["http://localhost:3000"],
    database: {
      url: process.env.DATABASE_URL ?? "",
    },
    redis: {
      host: process.env.REDIS_HOST ?? "localhost",
      port: toInt(process.env.REDIS_PORT, 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      db: toInt(process.env.REDIS_DB, 0),
    },
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret",
      refreshSecret: process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret",
      // Access tokens are silently refreshed; a 1h default (was 15m) cuts refresh
      // churn so sessions feel stable. Refresh tokens last 30 days.
      accessTtl: toInt(process.env.JWT_ACCESS_TTL, 3600),
      refreshTtl: toInt(process.env.JWT_REFRESH_TTL, 2592000),
      // Dedicated secret for the short-lived MFA login challenge token. Falls back
      // to a derived value so the challenge is still unforgeable in dev/test.
      mfaSecret:
        process.env.JWT_MFA_SECRET ??
        `${process.env.JWT_ACCESS_SECRET ?? "dev-access-secret"}:mfa`,
      mfaTtl: toInt(process.env.JWT_MFA_TTL, 300), // 5 minutes
    },
    secretsEncKey: process.env.SECRETS_ENC_KEY ?? "0".repeat(64),
    email: {
      host: process.env.SMTP_HOST || undefined,
      port: toInt(process.env.SMTP_PORT, 587),
      user: process.env.SMTP_USER || undefined,
      password: process.env.SMTP_PASSWORD || undefined,
      from: process.env.SMTP_FROM || "ReFx Hosting <no-reply@refx.example>",
      secure: (process.env.SMTP_SECURE ?? "").toLowerCase() === "true",
    },
    agent: {
      requestTimeoutMs: toInt(process.env.AGENT_REQUEST_TIMEOUT_MS, 15000),
      // ON by default: the panel covers the query string (?path/?mode/?wipe) in the
      // request signature so an on-path attacker can't tamper with it. Every agent
      // since v1.0.10 dual-accepts (verifies the with-query form first, then falls
      // back to path-only), so this is a no-op for non-query routes and safe on any
      // current node. Set AGENT_SIGN_QUERY=false ONLY if a node still runs a
      // pre-v1.0.10 agent mid-rollout. See apps/node-agent internal/api/middleware.
      signQuery:
        (process.env.AGENT_SIGN_QUERY ?? "true").toLowerCase() === "true",
    },
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY ?? "",
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? "",
    },
    paypal: {
      clientId: process.env.PAYPAL_CLIENT_ID ?? "",
      clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? "",
      mode: process.env.PAYPAL_MODE ?? "sandbox",
    },
    billing: {
      invoiceNumberPrefix: process.env.INVOICE_NUMBER_PREFIX ?? "INV",
      defaultCurrency: process.env.DEFAULT_CURRENCY ?? "USD",
      // The renewal/dunning cron sweep. Defaults on; set BILLING_SCHEDULER=false to
      // disable (e.g. when running a separate dedicated scheduler process).
      schedulerEnabled:
        (process.env.BILLING_SCHEDULER ?? "true").toLowerCase() !== "false",
    },
    support: {
      autoResolveEnabled:
        (process.env.SUPPORT_AUTORESOLVE ?? "true").toLowerCase() !== "false",
      autoResolveDays: toInt(process.env.SUPPORT_AUTORESOLVE_DAYS, 7),
      autoCloseDays: toInt(process.env.SUPPORT_AUTOCLOSE_DAYS, 3),
    },
    throttle: {
      ttl: toInt(process.env.THROTTLE_TTL, 60),
      limit: toInt(process.env.THROTTLE_LIMIT, 120),
    },
    apns: {
      // The .p8 may be supplied directly (APNS_KEY_P8) or base64-encoded
      // (APNS_KEY_P8_BASE64) to survive single-line env files; literal "\n"
      // escapes are normalised back to real newlines either way.
      // Prefer the base64 form when provided — it survives single-line env files
      // (raw multi-line .p8 in an env_file gets truncated to its first line). Only
      // fall back to a raw APNS_KEY_P8 when no base64 is set.
      keyP8: (process.env.APNS_KEY_P8_BASE64
        ? Buffer.from(process.env.APNS_KEY_P8_BASE64, "base64").toString("utf8")
        : process.env.APNS_KEY_P8 || ""
      ).replace(/\\n/g, "\n"),
      keyId: process.env.APNS_KEY_ID ?? "",
      teamId: process.env.APNS_TEAM_ID ?? "",
      bundleId: process.env.APNS_BUNDLE_ID ?? "",
      production:
        (process.env.APNS_PRODUCTION ?? "false").toLowerCase() === "true",
    },
    web: {
      // Defaults to the public panel URL's health route; in compose, override to
      // the internal service (http://web:3000/api/health) for a reliable check.
      healthUrl:
        process.env.WEB_HEALTH_URL ??
        `${process.env.PANEL_URL ?? "http://localhost:3000"}/api/health`,
    },
  };

  // NOTE: production-readiness checks (insecure secrets, wildcard CORS, http
  // public URL, …) live in `runPreflight` (config/preflight.ts), invoked at boot
  // in main.ts so they can abort startup — not here, to keep this factory pure.
  return config;
};
