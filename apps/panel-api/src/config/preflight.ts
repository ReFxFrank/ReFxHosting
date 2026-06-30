import { AppConfig } from "./configuration";

/**
 * Production preflight: catch insecure / footgun configuration BEFORE the panel
 * starts taking real traffic (and real money).
 *
 * Split into two severities:
 *  - `errors`   — would expose customer data or break the security model. In
 *                 production these abort boot (unless ALLOW_INSECURE_CONFIG=true).
 *  - `warnings` — operationally important but not an immediate breach (e.g. email
 *                 won't deliver, no payment gateway configured). Always logged.
 *
 * `evaluatePreflight` is a PURE function (no env reads, no logging) so it is
 * trivially unit-testable; `runPreflight` wires it to the real config + process,
 * logs, and throws when appropriate.
 */

export interface PreflightResult {
  errors: string[];
  warnings: string[];
}

const DEV_SECRET_DEFAULTS = new Set([
  "dev-access-secret",
  "dev-refresh-secret",
  "change-me-access-secret",
  "change-me-refresh-secret",
  "change-me-mfa-secret",
]);

const ZERO_KEY = "0".repeat(64);
const HEX64 = /^[0-9a-fA-F]{64}$/;

/** A password/secret that still carries an obvious placeholder value. */
const looksPlaceholder = (v: string): boolean =>
  /change[-_ ]?me|changeme|placeholder|example|xxx+|your[-_ ]|todo/i.test(v);

/**
 * Evaluate a config snapshot for production-readiness. `isProd` is passed in so
 * the same logic can be exercised in tests without touching NODE_ENV; when
 * false, everything is reported as warnings (nothing is fatal in dev).
 */
export function evaluatePreflight(
  config: AppConfig,
  isProd: boolean,
): PreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- Secrets at rest (AES-256-GCM master key) ------------------------------
  if (config.secretsEncKey === ZERO_KEY) {
    errors.push(
      'SECRETS_ENC_KEY is the all-zero default — every "encrypted" secret ' +
        "(gateway keys, TOTP seeds, SFTP/DB passwords) is trivially decryptable. " +
        "Generate one: openssl rand -hex 32",
    );
  } else if (!HEX64.test(config.secretsEncKey)) {
    errors.push(
      "SECRETS_ENC_KEY must be exactly 64 hex chars (32 bytes). " +
        "Generate one: openssl rand -hex 32",
    );
  }

  // --- JWT signing secrets ---------------------------------------------------
  const { accessSecret, refreshSecret } = config.jwt;
  if (DEV_SECRET_DEFAULTS.has(accessSecret) || looksPlaceholder(accessSecret)) {
    errors.push(
      "JWT_ACCESS_SECRET is a known/placeholder value — anyone can forge access " +
        "tokens. Generate one: openssl rand -hex 48",
    );
  } else if (accessSecret.length < 32) {
    errors.push(
      "JWT_ACCESS_SECRET is too short (use ≥32 chars; openssl rand -hex 48).",
    );
  }
  if (
    DEV_SECRET_DEFAULTS.has(refreshSecret) ||
    looksPlaceholder(refreshSecret)
  ) {
    errors.push(
      "JWT_REFRESH_SECRET is a known/placeholder value — refresh tokens are " +
        "forgeable. Generate one: openssl rand -hex 48",
    );
  } else if (refreshSecret.length < 32) {
    errors.push(
      "JWT_REFRESH_SECRET is too short (use ≥32 chars; openssl rand -hex 48).",
    );
  }
  if (accessSecret && accessSecret === refreshSecret) {
    errors.push(
      "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are identical — use two distinct " +
        "random values so an access token can never be replayed as a refresh token.",
    );
  }

  // --- Database --------------------------------------------------------------
  if (!config.database.url) {
    errors.push("DATABASE_URL is not set.");
  } else if (looksPlaceholder(config.database.url)) {
    errors.push(
      'DATABASE_URL still contains a placeholder password (e.g. "change-me…"). ' +
        "Set a strong Postgres password.",
    );
  }

  // --- Public origins / CORS / TLS scheme ------------------------------------
  if (config.corsOrigins.includes("*")) {
    errors.push(
      'CORS_ORIGINS contains "*" — with credentialed requests this is both ' +
        "insecure and rejected by browsers. List the exact web origins.",
    );
  } else if (config.corsOrigins.length === 0) {
    // main.ts falls back to `origin: true` (reflect ANY origin) when the list is
    // empty, and CORS runs with credentials — so any website could make
    // credentialed cross-origin calls. Require explicit origins in production.
    errors.push(
      "CORS_ORIGINS is empty — the API would reflect ANY origin with credentials " +
        "enabled. List your exact web origin(s), e.g. https://refx.gg.",
    );
  }
  for (const origin of config.corsOrigins) {
    if (origin.startsWith("http://") && !isLocal(origin)) {
      warnings.push(
        `CORS origin ${origin} is plain http — production browsers should reach ` +
          "the panel over https.",
      );
    }
  }
  if (config.panelUrl.startsWith("http://") && !isLocal(config.panelUrl)) {
    errors.push(
      `PANEL_URL is plain http (${config.panelUrl}) — email links, WebAuthn and ` +
        "redirects must be https in production. An https page cannot call an http API.",
    );
  } else if (isLocal(config.panelUrl)) {
    warnings.push(
      `PANEL_URL points at localhost (${config.panelUrl}) — set it to your public ` +
        "site so verification/reset emails link correctly.",
    );
  }

  // --- WebAuthn relying party ------------------------------------------------
  if (config.rpId === "localhost") {
    warnings.push(
      'PANEL_RP_ID is "localhost" — passkeys will not work on your real domain. ' +
        "Set it to your registrable domain (e.g. refx.gg).",
    );
  }

  // --- Email delivery --------------------------------------------------------
  if (!config.email.host) {
    warnings.push(
      "SMTP_HOST is not set — password-reset, email-verification and receipt " +
        "emails will NOT be delivered (logging transport only).",
    );
  }

  // --- Payment gateways ------------------------------------------------------
  const stripeLive = config.stripe.secretKey.startsWith("sk_live_");
  const stripeConfigured =
    !!config.stripe.secretKey && !looksPlaceholder(config.stripe.secretKey);
  const paypalConfigured =
    !!config.paypal.clientId && !looksPlaceholder(config.paypal.clientId);
  if (!stripeConfigured && !paypalConfigured) {
    warnings.push(
      "No payment gateway is configured (Stripe/PayPal) — customers cannot pay. " +
        "Set keys in Owner → Payments or via env before launch.",
    );
  }
  if (stripeConfigured && !config.stripe.webhookSecret) {
    warnings.push(
      "STRIPE_WEBHOOK_SECRET is empty — Stripe webhooks will fail signature " +
        "verification, so invoices/checkouts will not settle automatically.",
    );
  }
  if (stripeConfigured && !stripeLive) {
    warnings.push(
      "STRIPE_SECRET_KEY is a test key (sk_test_…) — real cards will be declined.",
    );
  }
  if (paypalConfigured && config.paypal.mode !== "live") {
    warnings.push(
      'PAYPAL_MODE is not "live" — PayPal runs against the sandbox, real ' +
        "payments will not process.",
    );
  }

  // --- Panel ↔ agent trust ---------------------------------------------------
  if (!config.agentTlsPinning) {
    warnings.push(
      "AGENT_TLS_PINNING is off — the panel accepts any node agent TLS cert. " +
        "Pin each node (Admin → Nodes → Pin certificate) once registered.",
    );
  }

  // In non-production, nothing is fatal: surface everything as advisory.
  if (!isProd) {
    return { errors: [], warnings: [...errors, ...warnings] };
  }
  return { errors, warnings };
}

/** localhost / loopback / *.local origins are fine to be http in any env. */
function isLocal(url: string): boolean {
  return /(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/.test(
    url,
  );
}

/**
 * Run the preflight against the live config + process env, log the outcome, and
 * (in production) throw if there are blocking errors unless explicitly overridden
 * with ALLOW_INSECURE_CONFIG=true. Returns the result for callers/tests.
 */
export function runPreflight(
  config: AppConfig,
  logger: Pick<Console, "error" | "warn" | "log"> = console,
): PreflightResult {
  const isProd = config.env === "production";
  const result = evaluatePreflight(config, isProd);

  for (const w of result.warnings) logger.warn(`[preflight] WARN: ${w}`);

  if (result.errors.length === 0) {
    if (isProd) logger.log("[preflight] production config checks passed.");
    return result;
  }

  for (const e of result.errors) logger.error(`[preflight] ERROR: ${e}`);

  const override =
    (process.env.ALLOW_INSECURE_CONFIG ?? "").toLowerCase() === "true";
  if (isProd && !override) {
    throw new Error(
      `Refusing to start: ${result.errors.length} blocking configuration ` +
        "error(s) above. Fix them, or set ALLOW_INSECURE_CONFIG=true to override " +
        "(NOT recommended — only for emergency access).",
    );
  }
  if (isProd && override) {
    logger.error(
      "[preflight] ALLOW_INSECURE_CONFIG=true — starting DESPITE blocking " +
        "errors. This is unsafe; fix the config.",
    );
  }
  return result;
}
