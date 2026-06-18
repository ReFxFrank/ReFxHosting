# API Keys & the "Agent Ops" Bot

Scoped API keys can carry **fine-grained permissions on the key itself**
(`ApiKey.permissions`), giving an external bot a narrow least-privilege grant
**without** assigning it a broad `GlobalRole`. The bot is just a normal
`CUSTOMER` user whose key carries the permission strings below.

This is purely additive to the existing human (JWT) authorization: a human
principal has no `apiKeyId`, so the API-key path is skipped for them and the
`@Roles` / `@RequirePermissions` checks apply unchanged.

## How it works

- `ApiKey.permissions: String[]` is selected during authentication and exposed on
  the principal as `AuthUser.apiKeyPermissions`
  (`apps/panel-api/src/auth/api-key.service.ts`).
- Routes the bot may reach are annotated with `@ApiPermissions(...)`
  (`apps/panel-api/src/common/decorators/api-permissions.decorator.ts`,
  metadata key `API_PERMISSIONS_KEY`).
- Both `RolesGuard` and `PermissionGuard` call the shared helper `apiKeyAllows`
  (`apps/panel-api/src/auth/guards/api-key-permission.util.ts`): if the principal
  has an `apiKeyId`, the route declares `@ApiPermissions`, and the key carries
  **all** of those permissions, the guard returns `true` **before** the normal
  role / server-ownership / scope-ceiling checks. Routes without
  `@ApiPermissions` are never reachable by the bot.

## Permission strings → endpoint they govern

| Permission | Endpoint(s) | Guard |
| --- | --- | --- |
| `support.ticket.read` | `GET /support/tickets`, `GET /support/tickets/:id` | JwtAuthGuard + service scoping |
| `support.category.read` | `GET /support/categories` | JwtAuthGuard |
| `support.kb.read` | `GET /support/kb-articles` | JwtAuthGuard |
| `support.ticket.note.create` | `POST /support/tickets/:id/messages` | JwtAuthGuard + service boundary |
| `support.ticket.update` | `PATCH /support/tickets/:id` | RolesGuard (humans) + service boundary |
| `nodes.read` | `GET /nodes`, `GET /nodes/:id`, `GET /nodes/:id/capacity` | RolesGuard |
| `servers.read` | `GET /servers/:serverId`, `GET /servers/:serverId/game-history` | PermissionGuard |

The canonical list lives in `API_KEY_PERMISSIONS`
(`apps/panel-api/src/common/permissions.ts`); the issuance endpoints reject
unknown strings. These strings are deliberately **not** granted to any seeded
system role — they exist only for API keys.

## The two HARD safety boundaries (enforced server-side)

Both are enforced in `apps/panel-api/src/support/support.service.ts`, so they
hold regardless of what the bot (or any caller) sends:

1. **A bot may only post INTERNAL notes.** In `addMessage`, an API-key caller
   must hold `support.ticket.note.create`, and `isInternal` is **forced to
   `true`** — a bot can never post a customer-facing reply.
2. **A bot may only re-categorise / re-prioritise a ticket.** In `updateTicket`,
   an API-key caller must hold `support.ticket.update`, and any DTO field other
   than `categoryId` / `priority` (e.g. `state`, `assigneeId`) is rejected with
   a `ForbiddenException`.

For read scoping, a key holding `support.ticket.read` is treated as staff in
`listTickets` / `getTicket` (sees all tickets and internal notes). A normal
(non-bot) customer key is unaffected — it still sees only its own tickets.

## Issuing the bot's key (operator steps)

1. Create a low-privilege **`CUSTOMER`** user for the bot (no staff role).
2. Log in as that user (obtain a JWT).
3. Create the scoped key:

   ```http
   POST /account/api-keys
   Authorization: Bearer <bot user JWT>
   Content-Type: application/json

   {
     "name": "Agent Ops",
     "scopes": ["READ", "WRITE"],
     "allowedIps": ["<egress-ip>/32"],
     "expiresAt": "2026-12-31T00:00:00.000Z",
     "permissions": [
       "support.ticket.read",
       "support.category.read",
       "support.kb.read",
       "support.ticket.note.create",
       "support.ticket.update",
       "nodes.read",
       "servers.read"
     ]
   }
   ```

   (`POST /auth/api-keys` accepts the same body.)

4. The response returns the **plaintext key once** (the `key` field). It is never
   stored or retrievable again — capture it immediately and store it in the
   bot's secret manager.

The bot then authenticates with the `x-api-key: refx_...` header. `READ+WRITE`
scopes are issued so the bot clears the `PermissionGuard` write-scope ceiling on
any server route — though `apiKeyAllows` returns `true` for `servers.read`
before that ceiling is reached anyway.
