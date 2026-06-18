# 22 — Outbound Webhooks (Agent Ops integration)

The panel can push domain events to a single external HTTP endpoint (the "Agent
Ops" service, or any receiver). Delivery is **outbound** and is entirely separate
from the **inbound** Stripe/PayPal payment webhooks (`apps/panel-api/src/billing/webhooks/`),
which are untouched by this feature.

Producers call `WebhookService.emit(event, data)`; the call only **enqueues** a
BullMQ job and returns immediately. A worker (`WebhookProcessor`) signs and POSTs
off the request path with retries.

## Envelope

The body is the JSON serialization of a stable envelope, built **once** per emit:

```json
{
  "event": "ticket.created",
  "occurredAt": "2026-06-18T00:00:00.000Z",
  "data": { "ticketId": "…" }
}
```

- `event` — the event name (also sent as a header).
- `occurredAt` — ISO-8601 timestamp of when the event was emitted (fixed across retries).
- `data` — the per-event payload (see below).

## Request headers

Every delivery POST sends:

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `X-ReFx-Event` | the event name |
| `X-ReFx-Delivery` | the delivery id (uuidv7) — **stable across retries**, use it as your idempotency key |
| `X-ReFx-Timestamp` | ISO-8601 send time (set **per attempt**, so it differs between retries) |
| `X-ReFx-Signature` | `sha256=` + hex HMAC-SHA256 of the **raw request body bytes**, keyed by the configured shared secret |

### Verifying the signature

Recompute `HMAC_SHA256(rawBody, sharedSecret)`, hex-encode it, prefix with
`sha256=`, and compare (constant-time) against `X-ReFx-Signature`. The signature
is over the **exact** bytes received — verify before parsing JSON.

## Events and `data` shapes

| Event | `data` |
|-------|--------|
| `ticket.created` | `{ ticketId }` |
| `ticket.updated` | `{ ticketId }` |
| `server.state.changed` | `{ serverId, state }` — emitted only on an actual state transition |
| `node.state.changed` | `{ nodeId, state }` — emitted only on an actual state transition |
| `invoice.payment_failed` | `{ invoiceId, status, amountDueCents, currency, attemptCount, customerEmail? }` — money in integer minor units (cents) |

## Retry semantics

- The worker fetches the current config, then:
  - **no URL/secret configured, or the event is not in the allowlist** → the job
    is acknowledged (skipped) with no error.
  - **2xx response (including 202)** → accepted, job acknowledged.
  - **non-2xx response, network error, or timeout** → the job throws and BullMQ
    retries it (at-least-once delivery): `attempts: 5`,
    `backoff: { type: 'exponential', delay: 5000 }`.
- The **delivery id is stable across all retries** (it is the BullMQ `jobId`),
  so receivers can dedupe on `X-ReFx-Delivery`.
- The body is re-serialized from the fixed stored envelope on each attempt, so the
  signed bytes are identical across retries (only `X-ReFx-Timestamp` changes).
- Each attempt has a request timeout (`AbortController`).

## Configuration

A single target URL, a single shared secret, and an event allowlist. Configure
via admin settings (owner/admin, `settings.manage`) or environment fallbacks.

Admin endpoints:

- `GET /api/v1/admin/settings/webhook` — returns `{ url, events, webhookSecretSet }`
  (the secret value is **never** returned).
- `PATCH /api/v1/admin/settings/webhook` — body `{ url?, secret?, events? }`
  (`events` is a comma-separated string; `secret` is stored AES-256-GCM encrypted).

Settings keys (DB override → env fallback):

| Setting | Storage | Env fallback |
|---------|---------|--------------|
| Target URL | plaintext | `AGENTOPS_WEBHOOK_URL` |
| Shared secret | encrypted | `AGENTOPS_WEBHOOK_SECRET` |
| Event allowlist (CSV) | plaintext | `AGENTOPS_WEBHOOK_EVENTS` |

Setting a field to an empty string clears the DB override (the env fallback
applies again). An event is only delivered if it appears in the allowlist.
