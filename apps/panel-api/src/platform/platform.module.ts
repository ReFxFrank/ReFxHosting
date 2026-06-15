import { Global, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsInterceptor } from './metrics.interceptor';
import { AuditService } from './audit.service';
import { NotificationsService } from './notifications.service';
import { AlertsService } from './alerts.service';
import { PlatformResolver } from './platform.resolver';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { AuditController } from './audit.controller';
import { NotificationsController } from './notifications.controller';
import { AlertsController } from './alerts.controller';

/**
 * Platform module: observability (health, Prometheus metrics), audit log
 * browsing, in-app notifications and global alerts.
 *
 * Marked @Global so MetricsService and NotificationsService can be injected by
 * any other feature module (e.g. to record business gauges or enqueue user
 * notifications) without re-importing this module. PrismaModule and AuthModule
 * (guards) are themselves @Global, so no imports are required here.
 */
@Global()
@Module({
  controllers: [
    HealthController,
    MetricsController,
    AuditController,
    NotificationsController,
    AlertsController,
  ],
  providers: [
    MetricsService,
    MetricsInterceptor,
    AuditService,
    NotificationsService,
    AlertsService,
    PlatformResolver,
  ],
  exports: [MetricsService, NotificationsService, AlertsService, AuditService],
})
export class PlatformModule {}
