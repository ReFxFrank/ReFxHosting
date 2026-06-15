import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';

/**
 * Email is Global so any feature module (auth, billing, support) can inject
 * EmailService without re-importing providers.
 */
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
