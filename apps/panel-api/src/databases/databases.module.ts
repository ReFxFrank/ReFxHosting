import { Module } from '@nestjs/common';
import { DatabasesService } from './databases.service';
import { DatabasesController } from './databases.controller';

/**
 * Server databases (ServerDatabase rows). Passwords stored encrypted via the
 * @Global CryptoService; plaintext returned only on create/rotate.
 */
@Module({
  controllers: [DatabasesController],
  providers: [DatabasesService],
})
export class DatabasesModule {}
