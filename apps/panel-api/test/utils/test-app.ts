import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, Reflector } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication, Provider, Type } from '@nestjs/common';

import configuration from '../../src/config/configuration';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../../src/common/interceptors/transform.interceptor';

import { PrismaService } from '../../src/prisma/prisma.service';
import { CryptoService } from '../../src/common/crypto/crypto.service';
import { EmailService } from '../../src/email/email.service';
import { ApiKeyService } from '../../src/auth/api-key.service';
import { UsersService } from '../../src/users/users.service';
import { SettingsService } from '../../src/platform/settings.service';
import { NotificationsService } from '../../src/platform/notifications.service';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/auth/guards/roles.guard';
import { PermissionGuard } from '../../src/auth/guards/permission.guard';

import { createPrismaMock, type PrismaMock } from './prisma.mock';

/**
 * The effective REST path prefix. src/main.ts sets the global prefix to `api/v1`
 * (the version lives in the prefix; URI versioning is intentionally NOT enabled,
 * to avoid a doubled `/api/v1/v1` segment). A `@Controller('auth')` route thus
 * resolves to `/api/v1/auth`. Routes excluded from the prefix (health, metrics)
 * are hit at the root (`/health`, `/metrics`).
 */
export const PREFIX = '/api/v1';

/**
 * A jest-mocked PrismaService — every model method is a jest.fn() returning
 * `null`/`[]` by default. Tests override the specific calls they exercise.
 */
export type { PrismaMock } from './prisma.mock';

export interface TestAppHandles {
  app: INestApplication;
  prisma: PrismaMock;
  jwt: JwtService;
  /** Convenience: mint an access token for the given user claims. */
  signAccess: (claims: {
    sub: string;
    email: string;
    role?: string;
  }) => Promise<string>;
  close: () => Promise<void>;
}

export interface BuildTestAppOptions {
  controllers?: Type<unknown>[];
  /** Feature providers under test (services, gateways, etc.). */
  providers?: Provider[];
  /**
   * Extra providers registered by token → value. Used for queues, the agent
   * client and payment gateways. These are added directly as providers (not
   * `overrideProvider`) so tokens that the feature module would normally supply
   * — e.g. BullMQ queue tokens — are available in the test context.
   */
  overrides?: Array<{ token: unknown; useValue: unknown }>;
}

/**
 * Builds a Nest application that mirrors production wiring (same global prefix,
 * URI versioning, ValidationPipe, exception filter and response transform as
 * src/main.ts) but with all external I/O mocked. The real auth guards, the JWT
 * passport strategy and ConfigService are used so routing/guards/validation are
 * exercised for real.
 */
export async function buildTestApp(
  opts: BuildTestAppOptions = {},
): Promise<TestAppHandles> {
  const prisma = createPrismaMock();

  const builder = Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
      PassportModule,
      JwtModule.register({}),
    ],
    controllers: opts.controllers ?? [],
    providers: [
      // Infra (real implementations, with Prisma mocked below).
      CryptoService,
      // Real EmailService; with SMTP unconfigured it uses jsonTransport and
      // never opens a socket or throws, so auth flows resolve cleanly.
      EmailService,
      ApiKeyService,
      UsersService,
      SettingsService,
      // Depends only on (mocked) Prisma; commonly pulled in transitively via
      // BillingService, so provide it here rather than in every billing spec.
      NotificationsService,
      JwtStrategy,
      // Auth guards (real).
      JwtAuthGuard,
      RolesGuard,
      PermissionGuard,
      // Prisma is mocked.
      { provide: PrismaService, useValue: prisma },
      ...(opts.overrides ?? []).map((o) => ({
        provide: o.token as never,
        useValue: o.useValue,
      })),
      ...(opts.providers ?? []),
    ],
  });

  const moduleRef: TestingModule = await builder.compile();

  const app = moduleRef.createNestApplication();

  // --- Mirror src/main.ts global configuration ---------------------------
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'metrics', 'graphql', 'docs'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  const reflector = app.get(Reflector);
  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));
  app.useGlobalInterceptors(new TransformInterceptor(reflector));

  await app.init();

  const jwt = app.get(JwtService);
  const signAccess = (claims: { sub: string; email: string; role?: string }) =>
    jwt.signAsync(
      {
        sub: claims.sub,
        email: claims.email,
        role: claims.role ?? 'CUSTOMER',
        type: 'access',
      },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: 900 },
    );

  return {
    app,
    prisma,
    jwt,
    signAccess,
    close: () => app.close(),
  };
}

export { createPrismaMock };
