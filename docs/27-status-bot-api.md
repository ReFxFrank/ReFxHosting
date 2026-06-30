# Status bot API (Helios integration)

Two additive, read-only-friendly capabilities for machine clients (e.g. the
**Helios** Discord bot) that consume the public status feed. Both are additive;
the public `GET /api/v1/status` response is unchanged.

## 1. Per-node metrics — `GET /api/v1/status/nodes`

Region/node rollups (same shape as the public feed) **enriched** with optional
per-node live metrics. Requires a `status:read` API token.

- **Auth:** present the token as `Authorization: Bearer <token>` **or**
  `X-Api-Key: <token>`.
- **Scope:** create the token under **Account → API keys** with only the
  **`STATUS_READ`** scope. Such a token is *isolated to the status feed* — it
  cannot read account, billing, server or admin data (enforced globally).
- **Errors:** `401` (missing/invalid/revoked/expired token), `403` (token lacks
  `status:read`).
- **Rate limit:** ~30 requests/minute/token.
- **Cache:** the aggregate is cached ~10s (reuses the same heartbeat collector
  that feeds `/admin/metrics`).

```jsonc
{
  "success": true,
  "data": {
    "updatedAt": "2026-06-30T12:00:00.000Z",
    "regions": [{
      "code": "ca-east", "name": "CA east", "status": "operational",
      "nodesUp": 2, "nodesTotal": 2,
      "nodes": [{
        "name": "refx-ca-east-bhs", "status": "operational",
        "cpuPercent": 31.4,
        "memoryUsedMb": 18342, "memoryTotalMb": 65536, "memoryPercent": 28,
        "diskUsedGb": 220, "diskTotalGb": 960, "diskPercent": 23,
        "serversOnline": 12
      }]
    }]
  }
}
```

Every metric field is **optional** — a node that hasn't reported a heartbeat yet
degrades to just `{ name, status, serversOnline }`.

## 2. Real-time status webhooks (push)

Configure under **Admin → Status incidents → Status webhooks**: enter a target
URL; the panel stores it with a generated signing secret (shown once, AES-GCM
encrypted at rest). The panel POSTs on:

- `incident.created`, `incident.updated`, `incident.resolved`
- `component.status_changed`

```jsonc
{
  "event": "incident.created",
  "timestamp": "2026-06-30T12:00:00.000Z",
  "data": { /* public incident or component fields only — no PII */ }
}
```

**Headers** on every delivery:

| Header | Value |
|---|---|
| `X-ReFx-Signature` | `sha256=<hex>` = HMAC-SHA256(secret, **raw body**) |
| `X-ReFx-Event` | the event type |
| `X-ReFx-Delivery` | unique id, stable across retries |

**Verify** by recomputing the HMAC over the raw request body and comparing in
constant time. **Delivery** is at-least-once with ~3 retries + exponential
backoff on any non-2xx; dedupe on `X-ReFx-Delivery`. Payloads contain only the
public incident/component fields already on `/status` — never customer, billing
or server data.

> Implementation: `apps/panel-api/src/status/status-read.guard.ts`,
> `status.service.ts#getNodes`, `apps/panel-api/src/webhooks/*`. Swagger documents
> the endpoint and the `status-token` scheme at `/docs`.
