# API Specification

`panel-api` (NestJS, `:4000`) is the single public API surface. It exposes a
versioned **REST** API under `/api/v1`, a **GraphQL** endpoint at `/graphql` for
read-heavy aggregate queries, and an auto-generated **OpenAPI/Swagger** document
at `/docs`. Entity, enum, and field names below match
[`database/prisma/schema.prisma`](../database/prisma/schema.prisma) verbatim; the
data model is described in [02 — Database Schema](02-database.md) and the overall
request flow in [01 — System Architecture](01-architecture.md).

The `web` app does not hand-write API calls: the `shared` package consumes the
generated OpenAPI client, giving the frontend a compile-time-typed contract that
tracks the API automatically.

## Conventions

| Aspect | Convention |
|--------|------------|
| Base URL | `https://<panel-host>/api/v1` |
| Transport | HTTPS only (TLS 1.3); plaintext is rejected |
| Content type | `application/json; charset=utf-8` for request/response bodies |
| Identifiers | UUID v7 (time-sortable) for all entity IDs; `Server.shortId` is the user-facing short identifier |
| Money | Integer minor units (`amountMinor`, `totalMinor`, …) plus ISO 4217 `currency` |
| Timestamps | RFC 3339 / ISO 8601 UTC (e.g. `2026-06-14T10:22:31Z`) |
| Naming | JSON fields are `camelCase`, matching the Prisma model fields |

## Authentication

The API accepts two credential types. Every authenticated response is also
governed by RBAC (`GlobalRole`) and, for server-scoped routes, by `SubUser`
permissions.

### JWT (access + refresh)

Interactive clients (`web`, mobile) authenticate with a short-lived **access
token** and a long-lived **refresh token**:

- **Access token** — JWT bearer, ~15 min TTL, sent as `Authorization: Bearer <jwt>`.
  Carries `sub` (user id), `globalRole`, and token type. Stateless: any
  `panel-api` replica can verify it without a database round-trip.
- **Refresh token** — opaque, ~30 day TTL, bound to a `Session` row. Only its
  SHA-256 (`Session.refreshHash`) is stored. `POST /auth/refresh` rotates the
  refresh token (revoking the old `Session`) and issues a new access token.
- **2FA** — when a user has TOTP (`totpEnabledAt`) or a `WebAuthnCredential`,
  `POST /auth/login` returns a `mfaRequired` challenge instead of tokens; the
  client completes it via `POST /auth/login/totp` or the WebAuthn assertion flow.
  `RecoveryCode`s are accepted as a fallback.

### API keys

Programmatic clients use an `ApiKey` sent as `Authorization: Bearer <key>`:

- The key is `<prefix>.<secret>`. The 8-char `prefix` (e.g. `rfx_a1b2`) is stored
  and shown in the UI; only the SHA-256 `keyHash` of the full key is persisted.
- **Scopes** — `ApiKeyScope`: `READ`, `WRITE`, `ADMIN`. A key may only perform
  operations within its granted scopes (`READ` for `GET`, `WRITE` for mutations,
  `ADMIN` for administrative routes), intersected with the owner's `GlobalRole`.
- **`allowedIps`** — optional CIDR allowlist enforced per request.
- **Lifecycle** — keys honour `expiresAt`/`revokedAt`; `lastUsedAt` is updated on
  use.

```mermaid
flowchart TB
  REQ[Incoming request] --> AUTH{Credential type}
  AUTH -->|Bearer JWT| JWT[Verify signature + expiry]
  AUTH -->|Bearer API key| AK[Match prefix → keyHash<br/>check scopes + allowedIps + expiry]
  JWT --> RBAC[RBAC: GlobalRole]
  AK --> RBAC
  RBAC --> SCOPE{Server-scoped route?}
  SCOPE -->|yes| SUB[Check owner / SubUser.permissions]
  SCOPE -->|no| OK[Handler]
  SUB --> OK
  OK --> AUDIT[Mutation → AuditLog]
```

Authorization detail (roles, per-server permissions, node trust) lives in
[08 — Security Architecture](08-security.md).

## Versioning

The REST API is versioned in the path: `/api/v1`. Breaking changes ship under a
new prefix (`/api/v2`) with the previous version supported through a deprecation
window. Non-breaking, additive changes (new fields, new endpoints) are made
in-place within a version. The OpenAPI document at `/docs` always reflects the
deployed version; the `shared` client is regenerated from it.

## Pagination

List endpoints use **cursor-based** pagination, which is efficient and stable
under concurrent inserts. Because IDs are UUID v7 (time-sortable), the cursor is
an opaque, base64-encoded position derived from the row's id (and sort key where
applicable).

**Query parameters**

| Param | Default | Description |
|-------|---------|-------------|
| `limit` | `25` (max `100`) | Page size |
| `cursor` | — | Opaque cursor from a previous `nextCursor` |
| `order` | `desc` | `asc` / `desc` by creation time |

**Envelope**

```json
{
  "data": [ /* items */ ],
  "page": {
    "limit": 25,
    "nextCursor": "MDE5MGYyZTQtN...",
    "hasMore": true
  }
}
```

A `null` `nextCursor` (or `hasMore: false`) indicates the final page.

## Error format

All errors return a consistent JSON envelope with the appropriate HTTP status.

```json
{
  "error": {
    "code": "SERVER_NOT_FOUND",
    "message": "No server matches the supplied identifier.",
    "details": [
      { "field": "serverId", "issue": "unknown" }
    ],
    "requestId": "req_0190f2e4-7c9b-7a31-9e22-7d1f0a2b3c4d"
  }
}
```

| Field | Description |
|-------|-------------|
| `code` | Stable, machine-readable error code (e.g. `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL`) |
| `message` | Human-readable summary; safe to surface in UI |
| `details` | Optional array of field-level issues (validation, conflicts) |
| `requestId` | Correlation id echoed in the `X-Request-Id` header and in logs/`AuditLog` for support |

Common status codes: `400` validation, `401` unauthenticated, `403` forbidden
(role/scope/permission), `404` not found, `409` conflict (e.g. `Allocation`
already bound), `422` unprocessable (invalid state transition), `429` rate
limited, `5xx` server errors.

## Rate limiting

Rate limits are enforced with **Redis token buckets** keyed by credential
(user id or API key prefix) and route class. Limits are stricter for unauthenticated
and auth endpoints. Every response carries standard headers:

| Header | Meaning |
|--------|---------|
| `X-RateLimit-Limit` | Requests allowed in the current window |
| `X-RateLimit-Remaining` | Requests remaining |
| `X-RateLimit-Reset` | Unix epoch seconds until the window resets |
| `Retry-After` | Seconds to wait (sent with `429`) |

A `429` response uses the standard error envelope with `code: "RATE_LIMITED"`.

## Webhooks

### Outbound (ReFx → your endpoint)

The platform emits signed outbound webhooks on domain events so customers and
integrations can react without polling. Payloads mirror the relevant entity
state; events are delivered at-least-once with exponential-backoff retries.

| Event | Trigger |
|-------|---------|
| `server.state.changed` | `Server.state` transition (e.g. `STARTING` → `RUNNING`) |
| `server.installed` | Install/reinstall completes |
| `server.game.switched` | `GameSwitchLog` appended (game switch) |
| `backup.completed` / `backup.failed` | `Backup.state` reaches `COMPLETED` / `FAILED` |
| `invoice.paid` / `invoice.payment_failed` | `Invoice`/`Payment` settlement |
| `subscription.state.changed` | `SubscriptionState` transition |
| `ticket.created` / `ticket.updated` | Helpdesk activity |
| `node.state.changed` | `NodeState` transition (admin webhooks) |

Each delivery includes an `X-ReFx-Signature` HMAC header over the raw body, an
event id, and a timestamp; verify the signature and treat the event id as an
idempotency key.

### Inbound (gateways → ReFx)

Payment gateways post to dedicated, signature-verified endpoints. These are not
under `/api/v1` auth — they validate the gateway signature instead.

| Endpoint | Source | Purpose |
|----------|--------|---------|
| `POST /api/v1/billing/webhooks/stripe` | Stripe | Verified via the configured signing secret. Handles `invoice.paid` / `invoice.payment_succeeded`, `checkout.session.completed`, `payment_intent.succeeded`, and `invoice.payment_failed` / `charge.failed` → settles `Invoice`/`Payment`/`Subscription` **idempotently** (deduped by invoice + gateway ref) |
| `POST /webhooks/paypal` | PayPal | Equivalent billing-agreement / payment events |

Billing reconciliation and dunning are detailed in
[07 — Billing Architecture](07-billing.md).

## GraphQL

`/graphql` complements REST for **read-heavy aggregate queries** where REST would
require many round-trips — dashboards, nested server views, billing summaries.
The same JWT/API-key auth, RBAC, and `SubUser` permission checks apply per field
resolver. Mutations remain primarily on REST (which drives BullMQ orchestration);
GraphQL focuses on composition of reads.

```graphql
query Dashboard {
  me {
    id
    email
    servers(first: 10) {
      edges {
        node {
          shortId
          name
          state            # ServerState
          node { name region { code } }
          template { name version }
          latestStat { cpuPct memUsedMb players }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
    subscriptions(state: ACTIVE) {
      state              # SubscriptionState
      product { name type }
      currentPeriodEnd
    }
  }
}
```

## Endpoint reference (REST)

All paths are relative to `/api/v1`. "Auth/role" lists the minimum credential and
role/scope; server-scoped routes additionally accept the `Server` owner or a
`SubUser` with the noted permission.

### Auth & identity

| Method | Path | Auth/role | Description |
|--------|------|-----------|-------------|
| `POST` | `/auth/register` | public | Create account (`UserState.PENDING_VERIFICATION`) |
| `POST` | `/auth/login` | public | Email + password; returns tokens or an MFA challenge |
| `POST` | `/auth/login/totp` | MFA ticket | Complete TOTP challenge |
| `POST` | `/auth/refresh` | refresh token | Rotate refresh `Session`, issue new access token |
| `POST` | `/auth/logout` | JWT | Revoke current `Session` |
| `GET`  | `/users/me` | JWT/READ | Current `User` profile |
| `PATCH`| `/users/me` | JWT/WRITE | Update profile, locale, timezone |
| `GET`  | `/users/me/api-keys` | JWT/READ | List own `ApiKey`s (prefix only) |
| `POST` | `/users/me/api-keys` | JWT/WRITE | Create key (returns full secret once) |
| `DELETE`| `/users/me/api-keys/:id` | JWT/WRITE | Revoke key |
| `GET`  | `/users` | ADMIN | List/search users (admin) |
| `PATCH`| `/users/:id` | ADMIN | Update `UserState`/`globalRole` |

### Servers

| Method | Path | Auth/role | Description |
|--------|------|-----------|-------------|
| `GET`  | `/servers` | READ | List servers visible to the caller (owner + `SubUser` grants) |
| `POST` | `/servers` | WRITE / ADMIN | Provision a `Server` (admin or via product purchase) |
| `GET`  | `/servers/:id` | READ + server access | Server detail |
| `PATCH`| `/servers/:id` | WRITE + server access | Update name, `startupCommand`, `ServerVariable`s |
| `DELETE`| `/servers/:id` | ADMIN | Soft-delete / decommission |
| `POST` | `/servers/:id/power` | WRITE + `console.power` | Power action (see body below) |
| `POST` | `/servers/:id/command` | WRITE + `console.command` | Send console command |
| `GET`  | `/servers/:id/stats` | READ | Recent `ServerStat` samples |
| `POST` | `/servers/:id/reinstall` | WRITE + server access | Trigger reinstall (`REINSTALLING`) |
| `POST` | `/servers/:id/switch-game` | WRITE + server access | Switch `GameTemplate` (`SWITCHING_GAME`), append `GameSwitchLog` |
| `GET`  | `/servers/:id/backups` | READ | List `Backup`s |
| `POST` | `/servers/:id/backups` | WRITE + `backup.create` | Create a backup |
| `POST` | `/servers/:id/backups/:bid/restore` | WRITE + `backup.restore` | Restore a backup |
| `GET`  | `/servers/:id/databases` | READ | List `ServerDatabase`s |
| `POST` | `/servers/:id/databases` | WRITE | Provision a database |
| `GET`  | `/servers/:id/schedules` | READ | List `Schedule`s |
| `POST` | `/servers/:id/schedules` | WRITE | Create cron `Schedule` + `ScheduleTask`s |
| `GET`  | `/servers/:id/sub-users` | READ + owner | List `SubUser` grants |
| `POST` | `/servers/:id/sub-users` | WRITE + owner | Grant scoped access |
| `PATCH`| `/servers/:id/minecraft` | `startup.update` | Set loader (vanilla/paper/fabric/forge/neoforge) + version |
| `GET`  | `/servers/:id/mods/search\|versions\|installed` | `files.read` | Modrinth mod/plugin browse (loader/version-aware) |
| `POST` | `/servers/:id/mods/install` · `DELETE …/mods/:file` | `files.write` | Install / remove a mod jar |
| `GET`  | `/servers/:id/modpacks/search\|versions` | `files.read` | Browse Modrinth **modpacks** + versions |
| `POST` | `/servers/:id/modpacks/install` | `control.reinstall` | Queue a modpack install (auto loader/version switch, mods + config) |

### Nodes & infrastructure (admin)

| Method | Path | Auth/role | Description |
|--------|------|-----------|-------------|
| `GET`  | `/regions` | READ | List `Region`s |
| `GET`  | `/nodes` | ADMIN | List `Node`s + health (`NodeState`) |
| `POST` | `/nodes` | ADMIN | Register a `Node`, mint bootstrap token |
| `GET`  | `/nodes/:id` | ADMIN | Node detail + capacity |
| `PATCH`| `/nodes/:id` | ADMIN | Update capacity / `maintenance` |
| `GET`  | `/nodes/:id/heartbeats` | ADMIN | Recent `NodeHeartbeat` samples |
| `GET`  | `/nodes/:id/allocations` | ADMIN | List `Allocation`s |
| `POST` | `/nodes/:id/allocations` | ADMIN | Add `IP:port` allocations |
| `GET`  | `/game-templates` | READ | List `GameTemplate`s (catalog) |
| `POST` | `/game-templates` | ADMIN | Author/version a template |

### Billing

| Method | Path | Auth/role | Description |
|--------|------|-----------|-------------|
| `GET`  | `/products` | READ | Catalog (`ProductType`, `Price`s) |
| `GET`  | `/subscriptions` | READ | Caller's `Subscription`s |
| `POST` | `/subscriptions` | WRITE | Purchase a product (creates `Subscription` + provisions `Server`) |
| `POST` | `/subscriptions/:id/cancel` | WRITE | Set `cancelAtPeriodEnd` / disable `autoRenew` |
| `GET`  | `/invoices` | READ | List `Invoice`s |
| `GET`  | `/invoices/:id` | READ | Invoice detail (line items, tax) |
| `GET`  | `/invoices/:id/pdf` | READ | Redirect to `pdfUrl` |
| `GET`  | `/payment-methods` | READ | List `PaymentMethod`s |
| `POST` | `/payment-methods` | WRITE | Attach a gateway payment method |

### Support

| Method | Path | Auth/role | Description |
|--------|------|-----------|-------------|
| `GET`  | `/tickets` | READ | List caller's `Ticket`s (all, for `SUPPORT`+) |
| `POST` | `/tickets` | WRITE | Open a ticket |
| `GET`  | `/tickets/:id` | READ + participant | Ticket thread |
| `POST` | `/tickets/:id/messages` | WRITE + participant | Reply (`TicketMessage`; `isInternal` for staff) |
| `PATCH`| `/tickets/:id` | SUPPORT | Update `TicketState`/`TicketPriority`/`assigneeId`/`categoryId` |
| `POST` | `/tickets/:id/assign` | SUPPORT | Assign to a staff member |
| `GET`  | `/staff` | SUPPORT | Staff directory (assignee picker) |
| `GET`/`POST`/`PATCH`/`DELETE` | `/categories[/:id]` | SUPPORT/ADMIN | Ticket categories (name/slug/SLA targets) |
| `GET`/`POST`/`PATCH`/`DELETE` | `/canned-responses[/:id]` | SUPPORT | Canned responses |
| `GET`  | `/kb/articles` | public | Published `KbArticle`s |

### Admin (RBAC, catalog, billing, payments)

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| `GET`/`POST`/`PATCH`/`DELETE` | `/admin/roles[/:id]` | `roles.manage` | Custom roles; `GET /admin/roles/permissions` is the catalog |
| `PATCH`| `/admin/users/:id/role` | `roles.manage` | Assign a role to a user |
| `POST`/`PATCH`/`DELETE` | `/admin/products[/:id]` | `catalog.manage` | Manage products |
| `POST` | `/admin/products/:id/prices` · `PATCH`/`DELETE` `/admin/prices/:id` | `catalog.manage` | Per-interval pricing |
| `POST` | `/admin/invoices/:id/void` · `DELETE …` | `billing.manage` | Void / delete invoices |
| `GET`  | `/admin/payments` | `payments.manage` | Raw payment ledger (owner) |
| `GET`/`PATCH` | `/admin/payments/gateways/config` | `payments.manage` | View / set Stripe & PayPal keys (encrypted; secrets write-only) |

## Examples

### Login

```bash
curl -sX POST https://panel.refx.example/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"skidgaming101@gmail.com","password":"••••••••"}'
```

Tokens issued (no 2FA):

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "refreshToken": "rt_0190f2e4-7c9b-7a31-9e22-7d1f0a2b3c4d",
    "user": {
      "id": "0190f2e4-7c9b-7a31-9e22-7d1f0a2b3c4d",
      "email": "skidgaming101@gmail.com",
      "globalRole": "CUSTOMER",
      "state": "ACTIVE"
    }
  }
}
```

2FA challenge instead of tokens:

```json
{
  "data": {
    "mfaRequired": true,
    "methods": ["TOTP", "WEBAUTHN"],
    "mfaTicket": "mfa_0190f2e4-7c9b-7a31-9e22-7d1f0a2b3c4d"
  }
}
```

### List servers (cursor page)

```bash
curl -s 'https://panel.refx.example/api/v1/servers?limit=2' \
  -H 'Authorization: Bearer eyJhbGciOiJSUzI1NiI...'
```

```json
{
  "data": [
    {
      "id": "0190f2e4-8a01-7b10-9c33-2e5b1d6f0a11",
      "shortId": "a1b2c3d4",
      "name": "Survival SMP",
      "state": "RUNNING",
      "deployMethod": "DOCKER",
      "node": { "id": "0190f2e4-91aa-7c20-8d44-3f6c2e7a1b22", "name": "eu-node-07" },
      "template": { "slug": "minecraft-paper", "name": "Minecraft: Paper", "version": 3 },
      "cpuCores": 2,
      "memoryMb": 4096,
      "createdAt": "2026-05-30T14:02:11Z"
    },
    {
      "id": "0190f2e4-9c12-7d30-8e55-4a7d3f8b2c33",
      "shortId": "e5f6g7h8",
      "name": "Rust Main",
      "state": "OFFLINE",
      "deployMethod": "DOCKER",
      "node": { "id": "0190f2e4-91aa-7c20-8d44-3f6c2e7a1b22", "name": "eu-node-07" },
      "template": { "slug": "rust", "name": "Rust", "version": 5 },
      "cpuCores": 4,
      "memoryMb": 8192,
      "createdAt": "2026-04-18T09:41:55Z"
    }
  ],
  "page": { "limit": 2, "nextCursor": "MDE5MGYyZTQtOWMxMg", "hasMore": true }
}
```

### Server power action

```bash
curl -sX POST \
  'https://panel.refx.example/api/v1/servers/0190f2e4-8a01-7b10-9c33-2e5b1d6f0a11/power' \
  -H 'Authorization: Bearer eyJhbGciOiJSUzI1NiI...' \
  -H 'Content-Type: application/json' \
  -d '{"signal":"start"}'
```

Accepted; the action is forwarded to the node-agent and the state transition
streams over the console WebSocket:

```json
{
  "data": {
    "serverId": "0190f2e4-8a01-7b10-9c33-2e5b1d6f0a11",
    "signal": "start",
    "state": "STARTING",
    "requestId": "req_0190f2e4-aa01-7e40-9f66-5b8e4a9c3d44"
  }
}
```

Valid `signal` values: `start`, `stop`, `restart`, `kill`. The resulting
`ServerState` progresses `STARTING` → `RUNNING` (or `STOPPING` → `OFFLINE`); a
non-clean exit yields `CRASHED`.

### Create backup

```bash
curl -sX POST \
  'https://panel.refx.example/api/v1/servers/0190f2e4-8a01-7b10-9c33-2e5b1d6f0a11/backups' \
  -H 'Authorization: Bearer eyJhbGciOiJSUzI1NiI...' \
  -H 'Content-Type: application/json' \
  -d '{"name":"pre-update","ignoredFiles":["logs/*","cache/*"]}'
```

```json
{
  "data": {
    "id": "0190f2e5-1010-7a50-8a77-6c9f5b0d4e55",
    "serverId": "0190f2e4-8a01-7b10-9c33-2e5b1d6f0a11",
    "name": "pre-update",
    "state": "PENDING",
    "storage": "S3",
    "isLocked": false,
    "createdAt": "2026-06-14T10:22:31Z"
  }
}
```

The request is enqueued on BullMQ; the agent archives the volume
(`IN_PROGRESS`), uploads to S3, and the `Backup` finishes `COMPLETED` with
`location`, `sizeBytes`, and `checksum`. A `backup.completed` webhook fires.

### Create ticket

```bash
curl -sX POST https://panel.refx.example/api/v1/tickets \
  -H 'Authorization: Bearer eyJhbGciOiJSUzI1NiI...' \
  -H 'Content-Type: application/json' \
  -d '{
        "subject": "Server stuck in STARTING",
        "priority": "HIGH",
        "categorySlug": "technical",
        "body": "My Paper server a1b2c3d4 will not finish starting."
      }'
```

```json
{
  "data": {
    "id": "0190f2e5-2222-7b60-9b88-7da06c1e5f66",
    "number": 10482,
    "subject": "Server stuck in STARTING",
    "state": "OPEN",
    "priority": "HIGH",
    "requesterId": "0190f2e4-7c9b-7a31-9e22-7d1f0a2b3c4d",
    "createdAt": "2026-06-14T10:25:09Z"
  }
}
```

## OpenAPI & generated client

The full machine-readable contract is served at `/docs` (Swagger UI) with the raw
OpenAPI JSON at `/docs-json`. CI regenerates the typed client into the `shared`
package on contract changes, so `web` always builds against the current API and
contract drift is caught at compile time. See
[05 — Backend Architecture](05-backend.md) for how controllers, DTOs, and guards
produce this document.

## Related documents

- [01 — System Architecture](01-architecture.md) — request/data flows and the agent protocol.
- [02 — Database Schema](02-database.md) — entities and enums referenced above.
- [07 — Billing Architecture](07-billing.md) — subscription, invoice, and webhook reconciliation.
- [08 — Security Architecture](08-security.md) — authentication, RBAC, and API hardening.
