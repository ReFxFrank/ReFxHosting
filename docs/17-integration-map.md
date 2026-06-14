# Frontend ↔ Backend Integration Map

> **Why this exists.** The `web` panel and `panel-api` were built against
> slightly different API designs. This document is the authoritative mapping of
> every route the web client calls (`apps/web/lib/api.ts`, base `/api/v1`) to its
> status on the backend, and the convergence decision for each. It is both an
> honest status artifact and the spec for closing the gap.
>
> Legend: ✅ matches · 🔧 rename/alias needed · 🚧 backend not yet implemented.

The agreed convergence direction is **backend-follows-frontend**: the web UI
defines the product surface, so the backend grows controllers to match those
paths (reusing existing services and the `NodeAgentClient` where the operation is
actually performed on the node).

## Auth & account

| Web call | Backend today | Status | Action |
|----------|---------------|--------|--------|
| `POST /auth/login`, `/register`, `/logout`, `/refresh` | same | ✅ | — |
| `GET /auth/me` | `GET /users/me` | 🔧 | add `GET /auth/me` (alias of users.me) |
| `POST /auth/forgot-password` | — | 🚧 | add password-reset request/confirm |
| `POST /auth/mfa/verify` | `/auth/mfa/totp/verify` | 🔧 | add `/auth/mfa/verify` covering TOTP+WebAuthn |
| `/account/api-keys` (GET/POST/DELETE :id) | `POST /auth/api-keys` only | 🔧🚧 | account-namespaced list/create/**revoke** |
| `/account/mfa/totp/{setup,enable,disable}` | `/auth/mfa/totp/{enroll,verify}` + `DELETE /auth/mfa/totp` | 🔧 | account aliases |
| `/account/notifications`, `/:id/read` | `/platform/notifications*` | 🔧 | account aliases |
| `/account/password` (change) | — | 🚧 | add change-password (verify old → re-hash) |
| `/account/sessions`, `/:id` (list/revoke) | — | 🚧 | expose Session list + revoke |

## Admin

| Web call | Backend today | Status | Action |
|----------|---------------|--------|--------|
| `/admin/nodes`, `/:id`, `/:id/heartbeats` | `/nodes`, `/:id` (+POST heartbeat) | 🔧🚧 | admin-namespaced; add GET heartbeats history |
| `/admin/users`, `/:id` | `/users`, `/:id` | 🔧 | admin aliases (already admin-guarded) |
| `/admin/products`, `/:id` | `/billing/products` | 🔧 | admin CRUD aliases |
| `/admin/templates`, `/:id` | — | 🚧 | **GameTemplate CRUD module** (the "egg editor") |
| `/admin/alerts`, `/:id` | `/platform/alerts` | 🔧 | admin aliases |
| `/admin/audit-logs` | `/platform/audit-logs` | 🔧 | admin alias |
| `/admin/metrics` | `/metrics` (Prometheus text) | 🔧🚧 | add JSON admin metrics summary |

## Storefront / catalog / orders

| Web call | Backend today | Status | Action |
|----------|---------------|--------|--------|
| `/catalog/products`, `/:slug` | `/billing/products` (by id) | 🔧 | public catalog (by slug, active only) |
| `/catalog/categories` | — | 🚧 | public game-category list |
| `/catalog/templates` | — | 🚧 | public template list (for buy flow) |
| `/orders` (create) | — | 🚧 | **checkout/order** → create subscription + provision server |
| `/dashboard` | — | 🚧 | aggregate: active services, usage, billing status |

## Servers (core — mostly matches)

| Web call | Backend today | Status | Action |
|----------|---------------|--------|--------|
| `GET /servers`, `/:id` | same | ✅ | — |
| `POST /servers/:id/power`, `/reinstall`, `/switch-game` | same | ✅ | — |
| `/servers/:id/variables` (GET/PATCH/:env) | same | ✅ | — |
| `/servers/:id/sub-users` (CRUD) | same | ✅ | — |
| `/servers/:id/schedules` (CRUD) | same (no `/run`) | ✅🚧 | add `POST /:sid/run` |
| `/servers/:id/switch-game/templates` | — | 🚧 | list templates allowed by the product whitelist |
| `/servers/:id/upgrade`, `/upgrade/preview` | `PATCH /:id/resize` | 🔧🚧 | add `upgrade` + price `preview` |
| `/servers/:id/command` | (console is WebSocket) | 🚧 | REST one-shot command → agent |
| `/servers/:id/startup` | — | 🚧 | get/set startup command |
| `/servers/:id/files/*` | — | 🚧 | **files module → NodeAgentClient** (list/contents/write/delete/rename/mkdir/chmod/compress/decompress/upload-url/download-url) |
| `/servers/:id/backups/*` | — | 🚧 | **backups module** (list/create/delete/restore/download → agent + `Backup` rows) |
| `/servers/:id/databases/*` | — | 🚧 | **databases module** (list/create/delete/rotate → `ServerDatabase`) |
| `/servers/:id/stats`, `/stats/history` | — | 🚧 | live stats (agent) + history (`ServerStat`) |
| `/servers/:id/sftp`, `/sftp/rotate` | — | 🚧 | SFTP details + password rotation |

## Billing & support

| Web call | Backend today | Status | Action |
|----------|---------------|--------|--------|
| `/billing/invoices`, `/:id` | same | ✅ | — |
| `/billing/invoices/:id/pay` | — | 🚧 | pay an open invoice |
| `/billing/payment-methods` (GET/POST) | same | ✅ | — |
| `/billing/payment-methods/:id` (DELETE), `/:id/default`, `/setup` | — | 🚧 | manage methods + setup intent |
| `/billing/subscriptions`, `/:id/cancel` | same | ✅ | — |
| `/billing/subscriptions/:id/resume` | — | 🚧 | resume a cancel-at-period-end sub |
| `/support/tickets`, `/:id`, `/:id/messages` | same | ✅ | — |
| `/support/kb`, `/:slug` | `/support/kb-articles*` | 🔧 | `kb` alias |

## Closing the gap

Work is tracked by closing each 🔧/🚧 above. New backend modules to add:
`files`, `backups`, `databases`, `stats`, `sftp` (all server sub-resources that
proxy to the node agent), an admin `templates` (GameTemplate CRUD) module, and a
public `catalog` + `orders`/`dashboard` surface. Naming-only items (🔧) are thin
alias controllers delegating to existing, already-tested services.

Until then, the **end-to-end working slice** is: register/login/logout, server
list & detail, power actions, reinstall, **game switching**, variables,
sub-users, schedules, ticket browse/reply, and billing invoice/subscription
browse. The live console works over WebSocket independently of the REST gaps.
