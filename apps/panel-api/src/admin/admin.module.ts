import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { NodesModule } from '../nodes/nodes.module';
import { TemplatesModule } from '../templates/templates.module';
import { UsersModule } from '../users/users.module';
import { BillingModule } from '../billing/billing.module';
import { ServersModule } from '../servers/servers.module';

/**
 * Admin module. Aggregates the admin-only surface and imports the feature
 * modules whose services it delegates to. AlertsService and AuditService are
 * exported by the @Global PlatformModule, so they need no explicit import.
 */
@Module({
  imports: [
    NodesModule,
    TemplatesModule,
    UsersModule,
    BillingModule,
    ServersModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
