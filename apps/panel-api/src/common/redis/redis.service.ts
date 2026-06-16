import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppConfig } from '../../config/configuration';

/**
 * Thin shared ioredis client for app-level state that must survive across
 * multiple panel-api instances (e.g. the WebAuthn challenge store). BullMQ keeps
 * its own connection; this is the general-purpose key/value client.
 *
 * Connects lazily (on first command) so merely constructing the provider — e.g.
 * during module init or in tests that never touch Redis — opens no socket.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(config: ConfigService) {
    const r = config.get<AppConfig['redis']>('redis')!;
    this.client = new Redis({
      host: r.host,
      port: r.port,
      password: r.password,
      db: r.db,
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
    this.client.on('error', (e) =>
      this.logger.warn(`Redis error: ${e.message}`),
    );
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
