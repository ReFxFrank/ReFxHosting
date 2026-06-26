import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http2 from 'http2';
import { createPrivateKey, KeyObject, sign as signEs256 } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { uuidv7 } from '../common/util/uuid';
import { AppConfig } from '../config/configuration';

/** The notification an event wants delivered to a user's devices. */
export interface PushMessage {
  title: string;
  body: string;
  /** App-icon badge count (optional). */
  badge?: number;
  /** Routed on by the iOS app (top-level, alongside `aps`). */
  type: 'server.state' | 'billing.invoice' | 'support.reply' | 'status.incident';
  /** Extra top-level fields the app reads, e.g. { serverId } / { ticketId }. */
  data?: Record<string, string | number>;
}

const APNS_HOST_PROD = 'api.push.apple.com';
const APNS_HOST_SANDBOX = 'api.sandbox.push.apple.com';
// Apple requires the auth JWT to be < 1h old and rejects regeneration more than
// once per ~20 min. Refresh on a 30-min cadence: comfortably inside both bounds.
const TOKEN_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
// Apple reasons that mean the token is dead — prune it so we stop trying.
const DEAD_TOKEN_REASONS = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic']);

/**
 * APNs push delivery using token-based auth (.p8 / ES256 JWT) over HTTP/2.
 *
 * Implemented directly on Node's built-in `http2` + `crypto` rather than pulling
 * in `apns2`/`node-apn`: this service compiles to CommonJS (apns2 v11+ is
 * ESM-only and breaks `require()` interop here) and adds zero dependencies — no
 * supply-chain or deploy-break risk. Swap to a package later if we move to ESM.
 *
 * Best-effort by contract: every public method swallows its own errors so a push
 * failure can never break the request that triggered it.
 */
@Injectable()
export class PushService implements OnModuleDestroy {
  private readonly logger = new Logger(PushService.name);
  private readonly cfg: AppConfig['apns'];
  private readonly host: string;

  private signingKey: KeyObject | null = null;
  private cachedJwt: { value: string; issuedAt: number } | null = null;
  private session: http2.ClientHttp2Session | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.cfg = this.config.get<AppConfig['apns']>('apns')!;
    this.host = this.cfg.production ? APNS_HOST_PROD : APNS_HOST_SANDBOX;
    if (!this.isConfigured()) {
      this.logger.log('APNs not configured (APNS_KEY_P8 empty) — push disabled.');
    }
  }

  // ---- public API ---------------------------------------------------------

  /** Persist/move a device token to this user (upsert on the unique token). */
  async registerToken(userId: string, token: string, platform: string): Promise<void> {
    const trimmed = token?.trim();
    if (!trimmed) return;
    await this.prisma.pushToken.upsert({
      where: { token: trimmed },
      update: { userId, platform },
      create: { id: uuidv7(), userId, token: trimmed, platform },
    });
  }

  /** Remove a token, but only if it belongs to the caller. Idempotent. */
  async removeToken(userId: string, token: string): Promise<void> {
    if (!token?.trim()) return;
    await this.prisma.pushToken.deleteMany({ where: { token: token.trim(), userId } });
  }

  /**
   * Send a push to every device registered to `userId`. Never throws; stale
   * tokens (410 / BadDeviceToken) are pruned as they're discovered.
   */
  async sendToUser(userId: string, message: PushMessage): Promise<void> {
    if (!this.isConfigured()) return;
    let tokens: Array<{ token: string }>;
    try {
      tokens = await this.prisma.pushToken.findMany({
        where: { userId, platform: 'ios' },
        select: { token: true },
      });
    } catch (err) {
      this.logger.warn(`push: failed to load tokens for ${userId}: ${String(err)}`);
      return;
    }
    if (tokens.length === 0) {
      this.logger.debug(`[push-trace] sendToUser ${userId} type=${message.type}: 0 ios tokens, nothing to send`);
      return;
    }
    this.logger.debug(`[push-trace] sendToUser ${userId} type=${message.type}: sending to ${tokens.length} token(s)`);

    const payload = JSON.stringify(this.buildPayload(message));
    await Promise.all(tokens.map((t) => this.sendOne(t.token, payload)));
  }

  // ---- payload ------------------------------------------------------------

  private buildPayload(message: PushMessage): Record<string, unknown> {
    const { title, body, badge, type, data } = message;
    return {
      aps: {
        alert: { title, body },
        sound: 'default',
        ...(badge !== undefined ? { badge } : {}),
      },
      // `type` and the id fields sit at the TOP LEVEL (not inside aps); the app
      // routes on them.
      type,
      ...(data ?? {}),
    };
  }

  // ---- APNs auth (ES256 JWT) ----------------------------------------------

  private isConfigured(): boolean {
    return Boolean(this.cfg.keyP8 && this.cfg.keyId && this.cfg.teamId && this.cfg.bundleId);
  }

  private getSigningKey(): KeyObject {
    if (!this.signingKey) {
      this.signingKey = createPrivateKey(this.cfg.keyP8);
    }
    return this.signingKey;
  }

  /** Provider auth JWT, cached and refreshed on a 30-min cadence. */
  private getAuthToken(): string {
    const now = Date.now();
    if (this.cachedJwt && now - this.cachedJwt.issuedAt < TOKEN_TTL_MS) {
      return this.cachedJwt.value;
    }
    const header = this.b64url(JSON.stringify({ alg: 'ES256', kid: this.cfg.keyId }));
    const claims = this.b64url(
      JSON.stringify({ iss: this.cfg.teamId, iat: Math.floor(now / 1000) }),
    );
    const signingInput = `${header}.${claims}`;
    // EC P-256 + SHA-256, JOSE-style raw r||s signature (ieee-p1363).
    const signature = signEs256(
      'sha256',
      Buffer.from(signingInput),
      { key: this.getSigningKey(), dsaEncoding: 'ieee-p1363' },
    );
    const jwt = `${signingInput}.${this.b64urlBuf(signature)}`;
    this.cachedJwt = { value: jwt, issuedAt: now };
    return jwt;
  }

  private b64url(input: string): string {
    return this.b64urlBuf(Buffer.from(input));
  }

  private b64urlBuf(buf: Buffer): string {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // ---- HTTP/2 transport ---------------------------------------------------

  private getSession(): http2.ClientHttp2Session {
    if (this.session && !this.session.closed && !this.session.destroyed) {
      return this.session;
    }
    const session = http2.connect(`https://${this.host}`);
    // Null the handle on any terminal event so the next send reconnects.
    const drop = () => {
      if (this.session === session) this.session = null;
    };
    session.on('close', drop);
    session.on('goaway', drop);
    session.on('error', (err) => {
      this.logger.warn(`apns session error: ${String(err)}`);
      drop();
    });
    this.session = session;
    return session;
  }

  /** Deliver to one token. Resolves always; prunes the token if Apple says it's dead. */
  private async sendOne(token: string, payload: string): Promise<void> {
    try {
      const { status, reason } = await this.post(token, payload);
      this.logger.debug(`[push-trace] APNs ${this.host} token=${token.slice(0, 12)}… status=${status}${reason ? ' reason=' + reason : ''}`);
      if (status === 200) return;
      if (status === 410 || (status === 400 && reason && DEAD_TOKEN_REASONS.has(reason))) {
        await this.prisma.pushToken.deleteMany({ where: { token } }).catch(() => undefined);
        this.logger.debug(`pruned stale push token (status ${status}, reason ${reason ?? '-'})`);
        return;
      }
      this.logger.warn(`apns send failed: status ${status}, reason ${reason ?? '-'}`);
    } catch (err) {
      // Swallow: a push failure must never break the triggering request.
      this.logger.warn(`apns send error: ${String(err)}`);
    }
  }

  private post(token: string, payload: string): Promise<{ status: number; reason?: string }> {
    return new Promise((resolve, reject) => {
      let session: http2.ClientHttp2Session;
      try {
        session = this.getSession();
      } catch (err) {
        reject(err);
        return;
      }

      const req = session.request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${this.getAuthToken()}`,
        'apns-topic': this.cfg.bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      });
      req.setTimeout(REQUEST_TIMEOUT_MS, () => req.close(http2.constants.NGHTTP2_CANCEL));

      let status = 0;
      const chunks: Buffer[] = [];
      req.on('response', (headers) => {
        status = Number(headers[':status']) || 0;
      });
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        let reason: string | undefined;
        if (status !== 200 && chunks.length) {
          try {
            reason = JSON.parse(Buffer.concat(chunks).toString()).reason;
          } catch {
            // non-JSON body; leave reason undefined
          }
        }
        resolve({ status, reason });
      });
      req.on('error', reject);
      req.end(payload);
    });
  }

  onModuleDestroy(): void {
    this.session?.close();
    this.session = null;
  }
}
