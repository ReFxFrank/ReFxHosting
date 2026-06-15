import { Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';

/**
 * GameTemplate ("egg") module. Exposes no controllers of its own — the admin
 * egg editor is surfaced via AdminController and the public template list via
 * CatalogController; both delegate to TemplatesService. PrismaModule is @Global.
 */
@Module({
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
