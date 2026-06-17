import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailPreviewController } from './email-preview.controller';

/**
 * Email is Global so any feature module (auth, billing, support) can inject
 * EmailService without re-importing providers. The preview controller is
 * dev-only (its routes 404 in production).
 */
@Global()
@Module({
  controllers: [EmailPreviewController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
