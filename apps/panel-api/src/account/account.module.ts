import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { UsersModule } from '../users/users.module';

/**
 * Account self-service module. AuthService, ApiKeyService and
 * NotificationsService come from @Global AuthModule / PlatformModule; UsersModule
 * provides UsersService for profile reads/updates.
 */
@Module({
  imports: [UsersModule],
  controllers: [AccountController],
})
export class AccountModule {}
