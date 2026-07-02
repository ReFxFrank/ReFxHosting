import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { StatusWebhook } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CryptoService } from "../common/crypto/crypto.service";
import { uuidv7 } from "../common/util/uuid";
import {
  JOB,
  QUEUE,
  StatusWebhookEvent,
  WebhookDeliveryJob,
} from "../queues/queue.constants";

/** Public-safe view of a webhook subscription (never exposes the secret). */
export interface WebhookView {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  description: string | null;
  lastDeliveryAt: string | null;
  lastStatus: number | null;
  createdAt: string;
}

/**
 * True if `ip` (v4 or v6 literal) is in a range a webhook must never target —
 * loopback, private (RFC1918/ULA), link-local (incl. 169.254.169.254 cloud
 * metadata), CGNAT, and unspecified. Blocks the SSRF vector where a staffer with
 * only `content.manage` points a webhook at an internal/metadata address.
 */
function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 127 || a === 10) return true; // unspecified, loopback, private
    if (a === 169 && b === 254) return true; // link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    if (
      lower.startsWith("fe80") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb")
    )
      return true; // link-local fe80::/10
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA fc00::/7
    // IPv4-mapped (::ffff:a.b.c.d) — re-check the embedded v4.
    const m = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isBlockedIp(m[1]);
    return false;
  }
  return false;
}

function toView(w: StatusWebhook): WebhookView {
  return {
    id: w.id,
    url: w.url,
    events: w.events,
    isActive: w.isActive,
    description: w.description,
    lastDeliveryAt: w.lastDeliveryAt ? w.lastDeliveryAt.toISOString() : null,
    lastStatus: w.lastStatus,
    createdAt: w.createdAt.toISOString(),
  };
}

/**
 * Outbound status-webhook subscriptions + dispatch. Operators register a target
 * URL (panel mints a signing secret); on a component status change or an
 * incident create/update/resolve the panel enqueues a signed delivery per active
 * subscriber. Payloads carry ONLY public status/incident fields.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    @InjectQueue(QUEUE.WEBHOOK_DELIVERY) private readonly queue: Queue,
  ) {}

  /**
   * Create a subscription. Returns the one-time plaintext signing secret (stored
   * only AES-256-GCM encrypted) — the operator pastes it into the bot to verify
   * the `X-ReFx-Signature` HMAC.
   */
  /**
   * Reject webhook URLs that (or whose DNS resolves to) a private/loopback/
   * link-local/metadata address, so a `content.manage` staffer can't turn the
   * panel into an SSRF proxy against internal services. DNS is resolved here;
   * delivery-time re-resolution (DNS-rebinding defence) is a follow-up.
   */
  private async assertPublicUrl(raw: string): Promise<void> {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      throw new BadRequestException("Invalid webhook URL");
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      throw new BadRequestException("Webhook URL must be http(s)");
    }
    const host = u.hostname.replace(/^\[|\]$/g, "");
    let addrs: string[];
    if (isIP(host)) {
      addrs = [host];
    } else {
      try {
        addrs = (await lookup(host, { all: true })).map((a) => a.address);
      } catch {
        throw new BadRequestException("Webhook host does not resolve");
      }
    }
    if (!addrs.length || addrs.some(isBlockedIp)) {
      throw new BadRequestException(
        "Webhook URL resolves to a disallowed (internal/loopback/metadata) address",
      );
    }
  }

  async create(
    url: string,
    events: string[] | undefined,
    createdById?: string,
    description?: string,
  ): Promise<WebhookView & { secret: string }> {
    await this.assertPublicUrl(url);
    const secret = `whsec_${this.crypto.token(24)}`;
    const record = await this.prisma.statusWebhook.create({
      data: {
        id: uuidv7(),
        url,
        secretEnc: this.crypto.encrypt(secret),
        events: events ?? [],
        description: description ?? null,
        createdById: createdById ?? null,
      },
    });
    return { ...toView(record), secret };
  }

  async list(): Promise<WebhookView[]> {
    const rows = await this.prisma.statusWebhook.findMany({
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toView);
  }

  async update(
    id: string,
    patch: {
      url?: string;
      events?: string[];
      isActive?: boolean;
      description?: string;
    },
  ): Promise<WebhookView> {
    await this.requireOne(id);
    if (patch.url !== undefined) await this.assertPublicUrl(patch.url);
    const record = await this.prisma.statusWebhook.update({
      where: { id },
      data: {
        ...(patch.url !== undefined ? { url: patch.url } : {}),
        ...(patch.events !== undefined ? { events: patch.events } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        ...(patch.description !== undefined
          ? { description: patch.description }
          : {}),
      },
    });
    return toView(record);
  }

  async remove(id: string): Promise<void> {
    await this.requireOne(id);
    await this.prisma.statusWebhook.delete({ where: { id } });
  }

  private async requireOne(id: string): Promise<void> {
    const found = await this.prisma.statusWebhook.findUnique({ where: { id } });
    if (!found) throw new NotFoundException("Webhook not found");
  }

  /**
   * Fan an event out to every active subscriber whose filter matches. Builds the
   * raw body ONCE so the signed and delivered bytes are identical, and enqueues a
   * BullMQ job per webhook (attempts: 3 + backoff = at-least-once). Best-effort:
   * never throws into the caller (incident/admin flows fire-and-forget).
   */
  async dispatch(event: StatusWebhookEvent, data: unknown): Promise<void> {
    let hooks: StatusWebhook[];
    try {
      hooks = await this.prisma.statusWebhook.findMany({
        where: { isActive: true },
      });
    } catch (e) {
      this.logger.warn(`webhook dispatch skipped (db): ${String(e)}`);
      return;
    }
    if (!hooks.length) return;

    const timestamp = new Date().toISOString();
    const body = JSON.stringify({ event, timestamp, data });

    for (const h of hooks) {
      if (h.events.length && !h.events.includes(event)) continue;
      const job: WebhookDeliveryJob = {
        webhookId: h.id,
        event,
        deliveryId: uuidv7(),
        body,
      };
      await this.queue
        .add(JOB.DELIVER_WEBHOOK, job, {
          removeOnComplete: true,
          removeOnFail: 200,
        })
        .catch((e) =>
          this.logger.warn(`failed to enqueue webhook ${h.id}: ${String(e)}`),
        );
    }
  }
}
