import { Global, Module } from '@nestjs/common';
import { PushService } from './push.service';

/**
 * Mobile push (APNs). Global so any feature module (agent callbacks, billing,
 * support) can inject PushService without re-wiring providers — same pattern as
 * EmailModule. Token registration endpoints live on AccountController.
 */
@Global()
@Module({
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
