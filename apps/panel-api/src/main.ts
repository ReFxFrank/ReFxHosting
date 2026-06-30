import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory, HttpAdapterHost, Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { json, raw } from "express";
import { AppModule } from "./app.module";
import { AppConfig } from "./config/configuration";
import { runPreflight } from "./config/preflight";
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

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
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
  runPreflight(appConfig);

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
  // eslint-disable-next-line no-console
  console.log(
    `panel-api listening on :${port}` +
      (enableDocs ? " (docs at /docs, gql at /graphql)" : ""),
  );
}

bootstrap();
