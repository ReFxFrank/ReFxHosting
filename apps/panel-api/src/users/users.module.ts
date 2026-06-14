import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController, SubUsersController } from './users.controller';
import { UsersResolver } from './users.resolver';

/**
 * Users feature module: self-service profile, admin user lifecycle and
 * per-server sub-user management. PrismaModule, CryptoModule and AuthModule
 * (which exports the guards) are @Global, so no extra imports are needed here.
 */
@Module({
  controllers: [UsersController, SubUsersController],
  providers: [UsersService, UsersResolver],
  exports: [UsersService],
})
export class UsersModule {}
