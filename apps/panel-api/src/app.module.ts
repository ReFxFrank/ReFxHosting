import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { BullModule } from "@nestjs/bullmq";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";

import configuration, { AppConfig } from "./config/configuration";
import { PrismaModule } from "./prisma/prisma.module";
import { CryptoModule } from "./common/crypto/crypto.module";
import { EmailModule } from "./email/email.module";
import { PushModule } from "./push/push.module";
import { AuditInterceptor } from "./common/interceptors/audit.interceptor";
import { PasswordChangeInterceptor } from "./common/interceptors/password-change.interceptor";
import { ApiKeyWriteScopeInterceptor } from "./common/interceptors/api-key-write-scope.interceptor";

import { AgentModule } from "./agent/agent.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { AccountModule } from "./account/account.module";
import { NodesModule } from "./nodes/nodes.module";
import { ServersModule } from "./servers/servers.module";
import { FilesModule } from "./files/files.module";
import { BackupsModule } from "./backups/backups.module";
import { DatabasesModule } from "./databases/databases.module";
import { StatsModule } from "./stats/stats.module";
import { SftpModule } from "./sftp/sftp.module";
import { BillingModule } from "./billing/billing.module";
import { SupportModule } from "./support/support.module";
import { PlatformModule } from "./platform/platform.module";
import { TemplatesModule } from "./templates/templates.module";
import { AdminModule } from "./admin/admin.module";
import { CatalogModule } from "./catalog/catalog.module";
import { OrdersModule } from "./orders/orders.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { StatusModule } from "./status/status.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { QueuesModule } from "./queues/queues.module";
import { MetricsInterceptor } from "./platform/metrics.interceptor";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
    }),

    // Cron scheduling (billing renewal/dunning sweep).
    ScheduleModule.forRoot(),

    // BullMQ root — shares the Redis connection across all queues.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redis = config.get<AppConfig["redis"]>("redis")!;
        return {
          connection: {
            host: redis.host,
            port: redis.port,
            password: redis.password,
            db: redis.db,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: 1000,
            removeOnFail: 5000,
          },
        };
      },
    }),

    // Rate limiting. Counters live in Redis (already a hard dependency) so the
    // limits are GLOBAL across panel-api replicas — with the default in-memory
    // store each pod counted independently, letting the effective login/MFA
    // brute-force ceiling scale with the replica count. Single-instance behaves
    // identically; multi-instance is now correctly bounded.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const t = config.get<AppConfig["throttle"]>("throttle")!;
        const r = config.get<AppConfig["redis"]>("redis")!;
        return {
          throttlers: [{ ttl: t.ttl * 1000, limit: t.limit }],
          storage: new ThrottlerStorageRedisService({
            host: r.host,
            port: r.port,
            password: r.password,
            db: r.db,
            // Throttling must never wedge a request path; ioredis retries in the
            // background and the guard fails open if the store is briefly down.
            maxRetriesPerRequest: 1,
          }),
        };
      },
    }),

    // Code-first GraphQL (schema generated from resolvers/models at boot).
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // The Playground UI and schema introspection are powerful recon tools;
        // expose them only outside production. In production both are disabled so
        // the GraphQL schema isn't enumerable by anonymous clients.
        const isProd = config.get<AppConfig["env"]>("env") === "production";
        return {
          // Generate the schema in-memory: the production image has no writable
          // `src/` (runs as non-root, only `dist/` is shipped), and we don't need
          // the .gql artifact at runtime.
          autoSchemaFile: true,
          sortSchema: true,
          playground: !isProd,
          introspection: !isProd,
          context: ({ req }: { req: unknown }) => ({ req }),
        };
      },
    }),

    // Infra
    PrismaModule,
    CryptoModule,
    AgentModule,
    EmailModule,
    PushModule,

    // Features
    AuthModule,
    UsersModule,
    AccountModule,
    NodesModule,
    ServersModule,
    FilesModule,
    BackupsModule,
    DatabasesModule,
    StatsModule,
    SftpModule,
    BillingModule,
    SupportModule,
    PlatformModule,
    TemplatesModule,
    AdminModule,
    CatalogModule,
    OrdersModule,
    DashboardModule,
    StatusModule,
    WebhooksModule,
    QueuesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Runs first among the interceptors so an admin-set temporary password
    // (mustChangePassword=true) blocks the request with a distinguishable 403
    // BEFORE the audit/metrics interceptors subscribe to the handler.
    { provide: APP_INTERCEPTOR, useClass: PasswordChangeInterceptor },
    // Global API-key WRITE-scope ceiling: a READ-scoped key may never drive a
    // mutating (POST/PUT/PATCH/DELETE) request, on ANY controller — including
    // JwtAuthGuard-only surfaces (account, billing, support, orders) that have
    // no PermissionGuard/AdminPermissionGuard to enforce the ceiling. Runs as an
    // interceptor (after guards) so req.user's apiKeyScopes are populated.
    { provide: APP_INTERCEPTOR, useClass: ApiKeyWriteScopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
