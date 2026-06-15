import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import configuration, { AppConfig } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { EmailModule } from './email/email.module';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';

import { AgentModule } from './agent/agent.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AccountModule } from './account/account.module';
import { NodesModule } from './nodes/nodes.module';
import { ServersModule } from './servers/servers.module';
import { FilesModule } from './files/files.module';
import { BackupsModule } from './backups/backups.module';
import { DatabasesModule } from './databases/databases.module';
import { StatsModule } from './stats/stats.module';
import { SftpModule } from './sftp/sftp.module';
import { BillingModule } from './billing/billing.module';
import { SupportModule } from './support/support.module';
import { PlatformModule } from './platform/platform.module';
import { TemplatesModule } from './templates/templates.module';
import { AdminModule } from './admin/admin.module';
import { CatalogModule } from './catalog/catalog.module';
import { OrdersModule } from './orders/orders.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { QueuesModule } from './queues/queues.module';
import { MetricsInterceptor } from './platform/metrics.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
    }),

    // BullMQ root — shares the Redis connection across all queues.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redis = config.get<AppConfig['redis']>('redis')!;
        return {
          connection: {
            host: redis.host,
            port: redis.port,
            password: redis.password,
            db: redis.db,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: 1000,
            removeOnFail: 5000,
          },
        };
      },
    }),

    // Rate limiting.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const t = config.get<AppConfig['throttle']>('throttle')!;
        return [{ ttl: t.ttl * 1000, limit: t.limit }];
      },
    }),

    // Code-first GraphQL (schema generated from resolvers/models at boot).
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      // Generate the schema in-memory: the production image has no writable
      // `src/` (runs as non-root, only `dist/` is shipped), and we don't need
      // the .gql artifact at runtime.
      autoSchemaFile: true,
      sortSchema: true,
      playground: true,
      context: ({ req }) => ({ req }),
    }),

    // Infra
    PrismaModule,
    CryptoModule,
    AgentModule,
    EmailModule,

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
    QueuesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
