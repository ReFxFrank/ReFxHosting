import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';

/**
 * Account self-service module. Controllers only — AuthService, ApiKeyService and
 * NotificationsService come from @Global AuthModule / PlatformModule.
 */
@Module({
  controllers: [AccountController],
})
export class AccountModule {}
