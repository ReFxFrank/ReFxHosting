import { Module } from '@nestjs/common';
import { SupportService } from './support.service';
import { SupportController } from './support.controller';
import { SupportResolver } from './support.resolver';

/**
 * Support / helpdesk feature module: tickets, canned responses, knowledge base
 * and ticket categories. PrismaModule and AuthModule (guards) are @Global, so
 * no extra imports are required here.
 */
@Module({
  controllers: [SupportController],
  providers: [SupportService, SupportResolver],
  exports: [SupportService],
})
export class SupportModule {}
