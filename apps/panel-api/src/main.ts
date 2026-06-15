import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory, HttpAdapterHost, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, raw } from 'express';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const reflector = app.get(Reflector);

  const port = config.get<AppConfig['port']>('port')!;
  const apiPrefix = config.get<AppConfig['apiPrefix']>('apiPrefix')!;
  const corsOrigins = config.get<AppConfig['corsOrigins']>('corsOrigins')!;

  // Stripe webhooks need the raw body for signature verification; everything
  // else uses parsed JSON.
  app.use('/api/v1/billing/webhooks/stripe', raw({ type: '*/*' }));
  app.use(
    json({
      limit: '5mb',
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
    exclude: ['health', 'metrics', 'graphql', 'docs'],
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

  // Swagger / OpenAPI
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ReFx Hosting — Panel API')
    .setDescription('Central panel API: auth, servers, nodes, billing, support.')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'X-Api-Key', in: 'header' }, 'apiKey')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  // Drain Prisma on shutdown.
  app.enableShutdownHooks();
  const prisma = app.get(PrismaService);
  await prisma.enableShutdownHooks(app);

  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`panel-api listening on :${port} (docs at /docs, gql at /graphql)`);
}

bootstrap();
