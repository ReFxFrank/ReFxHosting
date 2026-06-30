import { AppConfig } from "./configuration";
import { evaluatePreflight, runPreflight } from "./preflight";

/**
 * The preflight is the last line of defence before the panel takes real money,
 * so the rules that ABORT a production boot are covered explicitly, as is the
 * dev-mode downgrade (nothing fatal) and the emergency override.
 */
describe("production preflight", () => {
  // A config that should pass cleanly in production.
  const goodConfig = (): AppConfig =>
    ({
      env: "production",
      port: 4000,
      apiPrefix: "api/v1",
      panelUrl: "https://refx.gg",
      rpId: "refx.gg",
      rpName: "ReFx Hosting",
      agentTlsPinning: true,
      corsOrigins: ["https://refx.gg", "https://www.refx.gg"],
      database: { url: "postgresql://refx:S3curePg!@postgres:5432/refx" },
      redis: { host: "redis", port: 6379, db: 0 },
      jwt: {
        accessSecret: "a".repeat(96),
        refreshSecret: "b".repeat(96),
        accessTtl: 3600,
        refreshTtl: 2592000,
        mfaSecret: "c".repeat(96),
        mfaTtl: 300,
      },
      secretsEncKey: "a1b2c3d4".repeat(8), // 64 hex chars
      email: {
        host: "smtp.postmarkapp.com",
        port: 587,
        from: "ReFx <no-reply@refx.gg>",
        secure: false,
      },
      agent: { requestTimeoutMs: 15000, signQuery: false },
      stripe: {
        secretKey: "sk_live_abc123",
        webhookSecret: "whsec_abc",
        publishableKey: "pk_live_abc",
      },
      paypal: {
        clientId: "live-client-id",
        clientSecret: "secret",
        mode: "live",
      },
      billing: {
        invoiceNumberPrefix: "INV",
        defaultCurrency: "USD",
        schedulerEnabled: true,
      },
      throttle: { ttl: 60, limit: 120 },
      apns: {
        keyP8: "",
        keyId: "",
        teamId: "",
        bundleId: "",
        production: true,
      },
      web: { healthUrl: "https://refx.gg/api/health" },
    }) as AppConfig;

  it("passes a fully-configured production config with no errors or warnings", () => {
    const { errors, warnings } = evaluatePreflight(goodConfig(), true);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("flags the all-zero SECRETS_ENC_KEY as a blocking error", () => {
    const c = goodConfig();
    c.secretsEncKey = "0".repeat(64);
    const { errors } = evaluatePreflight(c, true);
    expect(errors.some((e) => e.includes("SECRETS_ENC_KEY"))).toBe(true);
  });

  it("flags a non-hex / wrong-length SECRETS_ENC_KEY", () => {
    const c = goodConfig();
    c.secretsEncKey = "not-hex";
    const { errors } = evaluatePreflight(c, true);
    expect(errors.some((e) => e.includes("64 hex"))).toBe(true);
  });

  it("flags dev/placeholder JWT secrets", () => {
    const c = goodConfig();
    c.jwt.accessSecret = "dev-access-secret";
    c.jwt.refreshSecret = "change-me-refresh-secret";
    const { errors } = evaluatePreflight(c, true);
    expect(errors.some((e) => e.includes("JWT_ACCESS_SECRET"))).toBe(true);
    expect(errors.some((e) => e.includes("JWT_REFRESH_SECRET"))).toBe(true);
  });

  it("flags identical access/refresh secrets", () => {
    const c = goodConfig();
    c.jwt.refreshSecret = c.jwt.accessSecret;
    const { errors } = evaluatePreflight(c, true);
    expect(errors.some((e) => e.includes("identical"))).toBe(true);
  });

  it("flags a placeholder DB password and an empty DATABASE_URL", () => {
    const c = goodConfig();
    c.database.url = "postgresql://refx:change-me-postgres@postgres:5432/refx";
    expect(
      evaluatePreflight(c, true).errors.some((e) => e.includes("DATABASE_URL")),
    ).toBe(true);
    c.database.url = "";
    expect(
      evaluatePreflight(c, true).errors.some((e) => e.includes("DATABASE_URL")),
    ).toBe(true);
  });

  it("flags wildcard CORS as an error and http public URL as an error", () => {
    const c = goodConfig();
    c.corsOrigins = ["*"];
    c.panelUrl = "http://refx.gg";
    const { errors } = evaluatePreflight(c, true);
    expect(errors.some((e) => e.includes("CORS_ORIGINS"))).toBe(true);
    expect(errors.some((e) => e.includes("PANEL_URL"))).toBe(true);
  });

  it("flags an empty CORS_ORIGINS as an error (would reflect any origin)", () => {
    const c = goodConfig();
    c.corsOrigins = [];
    const { errors } = evaluatePreflight(c, true);
    expect(errors.some((e) => e.includes("CORS_ORIGINS is empty"))).toBe(true);
  });

  it("allows http for localhost URLs (no error)", () => {
    const c = goodConfig();
    c.panelUrl = "http://localhost:3000";
    const { errors } = evaluatePreflight(c, true);
    expect(errors.some((e) => e.includes("PANEL_URL"))).toBe(false);
  });

  it("warns (not errors) on missing SMTP, no gateways, and pinning off", () => {
    const c = goodConfig();
    c.email.host = undefined;
    c.stripe.secretKey = "";
    c.paypal.clientId = "";
    c.agentTlsPinning = false;
    const { errors, warnings } = evaluatePreflight(c, true);
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes("SMTP_HOST"))).toBe(true);
    expect(warnings.some((w) => w.includes("payment gateway"))).toBe(true);
    expect(warnings.some((w) => w.includes("AGENT_TLS_PINNING"))).toBe(true);
  });

  it("warns when Stripe is a test key or PayPal is in sandbox", () => {
    const c = goodConfig();
    c.stripe.secretKey = "sk_test_abc";
    c.paypal.mode = "sandbox";
    const { warnings } = evaluatePreflight(c, true);
    expect(warnings.some((w) => w.includes("test key"))).toBe(true);
    expect(warnings.some((w) => w.includes("sandbox"))).toBe(true);
  });

  it("downgrades everything to warnings in non-production", () => {
    const c = goodConfig();
    c.secretsEncKey = "0".repeat(64); // would be fatal in prod
    const { errors, warnings } = evaluatePreflight(c, false);
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes("SECRETS_ENC_KEY"))).toBe(true);
  });

  describe("runPreflight", () => {
    const silent = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
    beforeEach(() => jest.clearAllMocks());

    it("throws in production when there are blocking errors", () => {
      const c = goodConfig();
      c.secretsEncKey = "0".repeat(64);
      expect(() => runPreflight(c, silent)).toThrow(/Refusing to start/);
      expect(silent.error).toHaveBeenCalled();
    });

    it("does not throw when ALLOW_INSECURE_CONFIG=true", () => {
      const c = goodConfig();
      c.secretsEncKey = "0".repeat(64);
      const prev = process.env.ALLOW_INSECURE_CONFIG;
      process.env.ALLOW_INSECURE_CONFIG = "true";
      try {
        expect(() => runPreflight(c, silent)).not.toThrow();
      } finally {
        process.env.ALLOW_INSECURE_CONFIG = prev;
      }
    });

    it("does not throw on a clean production config", () => {
      expect(() => runPreflight(goodConfig(), silent)).not.toThrow();
      expect(silent.error).not.toHaveBeenCalled();
    });
  });
});
