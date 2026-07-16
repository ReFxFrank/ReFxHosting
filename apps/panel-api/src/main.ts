import "reflect-metadata";
import { ValidationPipe, LogLevel } from "@nestjs/common";
import { NestFactory, HttpAdapterHost, Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { json, raw } from "express";
import { AppModule } from "./app.module";
import { AppConfig } from "./config/configuration";
import { runPreflight } from "./config/preflight";
import { SettingsService } from "./platform/settings.service";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";
import { PrismaService } from "./prisma/prisma.service";

// Prisma returns BigInt for byte-count columns (NodeHeartbeat/ServerStat net*,
// Backup sizeBytes). JSON.stringify throws on BigInt, which 500s those reads —
// teach it to emit a Number so every endpoint serializes cleanly.
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function (
  this: bigint,
) {
  return Number(this);
};

/**
 * Which Nest log levels to emit. `LOG_LEVEL` (error|warn|info|debug|verbose)
 * picks a threshold — that level plus everything more severe. Defaults to
 * `debug` in development and `info` in production, so prod isn't drowned in
 * per-poll debug tracing (e.g. the agent push-trace lines) by default.
 */
function resolveLogLevels(): LogLevel[] {
  const bySeverity: LogLevel[] = [
    "verbose",
    "debug",
    "log",
    "warn",
    "error",
    "fatal",
  ];
  const isProd = (process.env.NODE_ENV ?? "").toLowerCase() === "production";
  const requested = (process.env.LOG_LEVEL ?? "").toLowerCase();
  const alias: Record<string, LogLevel> = { info: "log", trace: "verbose" };
  const threshold = (alias[requested] ??
    (requested as LogLevel)) as LogLevel;
  const start = bySeverity.indexOf(threshold);
  if (start >= 0) return bySeverity.slice(start);
  return isProd ? ["log", "warn", "error", "fatal"] : bySeverity;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: false,
    logger: resolveLogLevels(),
  });
  const config = app.get(ConfigService);
  const reflector = app.get(Reflector);

  // Production preflight: refuse to boot on insecure/footgun config (weak
  // secrets, wildcard CORS, http public URL, placeholder DB password). In
  // non-production this only warns. Override with ALLOW_INSECURE_CONFIG=true.
  const appConfig: AppConfig = {
    env: config.get<AppConfig["env"]>("env")!,
    secretsEncKey: config.get<AppConfig["secretsEncKey"]>("secretsEncKey")!,
    jwt: config.get<AppConfig["jwt"]>("jwt")!,
    database: config.get<AppConfig["database"]>("database")!,
    corsOrigins: config.get<AppConfig["corsOrigins"]>("corsOrigins")!,
    panelUrl: config.get<AppConfig["panelUrl"]>("panelUrl")!,
    rpId: config.get<AppConfig["rpId"]>("rpId")!,
    email: config.get<AppConfig["email"]>("email")!,
    stripe: config.get<AppConfig["stripe"]>("stripe")!,
    paypal: config.get<AppConfig["paypal"]>("paypal")!,
    agentTlsPinning:
      config.get<AppConfig["agentTlsPinning"]>("agentTlsPinning")!,
  } as AppConfig;
  // SMTP can be configured in the owner-editable admin settings (DB) instead of
  // env — the mailer resolves DB-first, so the preflight must judge the same
  // EFFECTIVE config or it false-positives on panels configured via the UI.
  let effectiveEmail = appConfig.email;
  try {
    const emailCfg = await app.get(SettingsService).emailConfig();
    if (emailCfg.host) effectiveEmail = { ...appConfig.email, host: emailCfg.host };
  } catch {
    /* DB unreachable at boot — judge the env view; the app can't run anyway */
  }
  runPreflight({ ...appConfig, email: effectiveEmail });

  // Behind a reverse proxy (Caddy/nginx) the socket peer is the proxy, not the
  // client. Trust the proxy so Express derives req.ip from X-Forwarded-For —
  // otherwise per-IP rate limiting and audit logs all collapse onto the proxy's
  // loopback address. TRUST_PROXY accepts Express's syntax: a hop count ("1"),
  // "loopback", a subnet, or "true". Defaults to one hop (the local proxy).
  const trustProxy = process.env.TRUST_PROXY ?? "1";
  const trustProxyValue = /^\d+$/.test(trustProxy)
    ? Number(trustProxy)
    : trustProxy === "true"
      ? true
      : trustProxy;
  app.getHttpAdapter().getInstance().set("trust proxy", trustProxyValue);

  const port = config.get<AppConfig["port"]>("port")!;
  const apiPrefix = config.get<AppConfig["apiPrefix"]>("apiPrefix")!;
  const corsOrigins = config.get<AppConfig["corsOrigins"]>("corsOrigins")!;

  // Stripe + PayPal webhooks need the raw body for signature verification;
  // everything else uses parsed JSON.
  app.use("/api/v1/billing/webhooks/stripe", raw({ type: "*/*" }));
  app.use("/api/v1/billing/webhooks/paypal", raw({ type: "*/*" }));
  // Direct file uploads stream raw binary straight through to the node agent's
  // jailed file manager. The agent verifies its HMAC over — and caps — the body
  // at 32 MiB, so we buffer a little above that and let FilesService return a
  // clean 413 (pointing at SFTP) for anything larger.
  app.use(
    "/api/v1/servers/:id/files/upload",
    raw({ type: () => true, limit: "40mb" }),
  );
  // Bug-report screenshot uploads: raw image bytes. BugsService caps each at
  // 5 MiB and rejects non-image types; buffer a little above the cap so it can
  // return a clean 413.
  app.use(
    "/api/v1/bugs/:id/attachments",
    raw({ type: () => true, limit: "6mb" }),
  );
  app.use(
    json({
      limit: "5mb",
      // Stash the exact raw bytes so signed agent callbacks can be verified
      // against SHA256(body) without re-serialization drift (the Go agent's
      // json.Encoder appends a trailing newline that JSON.stringify would not).
      verify: (req: any, _res, buf: Buffer) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: false, // Swagger UI + GraphQL Playground assets
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.enableCors({
    origin: corsOrigins.length ? corsOrigins : true,
    credentials: true,
  });

  app.setGlobalPrefix(apiPrefix, {
    exclude: ["health", "metrics", "graphql", "docs"],
  });
  // NOTE: the API version lives in the `api/v1` prefix. We deliberately do NOT
  // also call app.enableVersioning(URI) — that would double the segment to
  // `/api/v1/v1/...`. To introduce real per-route versioning later, switch the
  // prefix to `api`, enable URI versioning, and mark health/metrics
  // VERSION_NEUTRAL.

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(reflector),
  );

  // Swagger / OpenAPI — the full REST surface (every endpoint, DTO and auth
  // scheme) is a recon goldmine, so it is NOT exposed in production by default,
  // exactly like GraphQL introspection/playground (see app.module.ts). Set
  // ENABLE_API_DOCS=true to opt back in (e.g. behind an internal-only route).
  const isProd = config.get<AppConfig["env"]>("env") === "production";
  const enableDocs =
    !isProd || (process.env.ENABLE_API_DOCS ?? "").toLowerCase() === "true";
  if (enableDocs) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("ReFx Hosting — Panel API")
      .setDescription(
        "Central panel API: auth, servers, nodes, billing, support.",
      )
      .setVersion("1.0")
      .addBearerAuth()
      .addApiKey({ type: "apiKey", name: "X-Api-Key", in: "header" }, "apiKey")
      // Narrow status:read token for machine clients (Helios bot) — accepted as a
      // bearer token on GET /status/nodes. See ApiKeyScope.STATUS_READ.
      .addBearerAuth(
        {
          type: "http",
          scheme: "bearer",
          description: "status:read API token",
        },
        "status-token",
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // Drain Prisma on shutdown.
  app.enableShutdownHooks();
  const prisma = app.get(PrismaService);
  await prisma.enableShutdownHooks(app);

  await app.listen(port, "0.0.0.0");

  // Bound how long a single connection may tie up the server so a stalled or
  // slow client (e.g. an in-browser file upload that hangs mid-stream) can't
  // hold a socket open indefinitely and starve everyone else — the failure that
  // took logins down. `requestTimeout` caps the whole request incl. body upload
  // (the browser client caps a file upload at 180s, so 240s leaves margin);
  // `headersTimeout` is the slow-loris guard on the header phase;
  // `keepAliveTimeout` sits just above the proxy's keep-alive to avoid races.
  const httpServer = app.getHttpServer();
  httpServer.requestTimeout = 240_000;
  httpServer.headersTimeout = 60_000;
  httpServer.keepAliveTimeout = 65_000;

  // eslint-disable-next-line no-console
  console.log(
    `panel-api listening on :${port}` +
      (enableDocs ? " (docs at /docs, gql at /graphql)" : ""),
  );
}

bootstrap();
