# P0 Hardening Report — Data & Payment Safety

Branch: `hardening/p0-payment-data-safety` (local only — **not pushed**, per the
engagement rules: no push/deploy/production access). Base: current `main` HEAD
(`8bfb840`). All findings below were re-verified against current code, not the
original review commit.

> **Verdict up front:** the platform is **pilot-ready with conditions**, not yet
> unconditionally production-ready. The highest-severity data-loss and
> money-safety defects in P0 are fixed and regression-tested; the remaining P0
> items (DB-enforced uniqueness, durable dunning schedule, webhook inbox) and all
> of P1/P2 are specified in the continuation plan and must land before an
> unconditional production sign-off. Evidence and ranking below.

---

## 1. Executive summary — what was fixed

| ID | Fix | Severity | Status |
|----|-----|----------|--------|
| **P0-A** | Migrations fail closed — removed auto `db push --accept-data-loss` + auto `migrate resolve` on deploy failure; non-zero exit; seed failures fatal in prod; CI drift job; recovery runbook | Critical (silent data loss) | **Done + tested** |
| **P0-B** | Checkout DTO accepts `expressBackups` + strict `attribution` (was 400-ing every attributed/referral/express order under `forbidNonWhitelisted`) | High (broken checkout) | **Done + tested** |
| **P0-C** | Reserve a provisionable server (template/node/capacity/allocation) **before** charging; roll back if reservation fails | Critical (charge with no server) | **Done + tested** |
| **P0-D** | Cancel-at-period-end subs now expire + stop servers (were free forever); immediate cancel now suspends the server | High (revenue leak / never-ending free service) | **Done + tested** |
| **P0-E** | PayPal-managed subs excluded from the Stripe renewal/dunning sweep; never Stripe-charged or suspended for lacking a Stripe method | High (wrongful suspension / double-charge) | **Done + tested** |
| **P0-F** | Stripe `Idempotency-Key` on charge + refund; PayPal `PayPal-Request-Id` on refund | High (duplicate charges/refunds) | **Partial — done + tested** (order/capture idempotency deferred) |
| **P0-G** | Paid/refunded invoices immutable (delete refused); full refund + Stripe/PayPal reversal/dispute revokes entitlement (suspends servers); refund recording idempotent; Stripe refund/dispute webhooks handled | High (refunded service stays live; ledger deletable) | **Partial — done + tested** |
| **P0-H** | DB-enforced invariants (unique payment ref, one-server-per-sub, price uniqueness, atomic invoice sequence) | High (concurrency races) | **Specified — see continuation plan** |

New/updated tests: **+25** (573 → **598** panel-api unit tests green). Full suite,
typecheck, and lint pass on the branch.

---

## 2. Confirmed findings (verified in current code)

Each was reproduced by reading current `main`, with file:line evidence.

1. **Migrations self-heal destructively** — `infra/docker/Dockerfile.migrate`
   `run-migrate.sh`: `prisma migrate deploy || reconcile`, where `reconcile()`
   ran `prisma db push --accept-data-loss` then `migrate resolve --applied` for
   every migration. Confirmed.
2. **Checkout DTO rejects storefront fields** — `create-order.dto.ts` had neither
   `expressBackups` nor `attribution`; `main.ts` sets `forbidNonWhitelisted:true`;
   `apps/web/app/(store)/order/page.tsx:425-426` sends both. Confirmed (fires only
   when attribution/express is present, i.e. every referral/utm/express order).
3. **Charge before provisionability** — `orders.service.ts` settled payment
   (`markInvoicePaid`/`payInvoice`) before `servers.create`, which runs the
   template-whitelist/capacity/allocation checks. Synchronous-settle paths
   (credit, gift card, $0) could take money then fail to create a server, with no
   recovery record. Confirmed.
4. **Cancel-at-period-end never expires** — `findDueSubscriptions`/
   `findPastDueSubscriptions` filter `cancelAtPeriodEnd:false`, and nothing else
   expires them; the `renewSubscription` EXPIRED branch was unreachable for them.
   Confirmed. Immediate cancel updated DB state but never suspended the server.
   Confirmed.
5. **Gateway-agnostic renewal** — `renewSubscription` always called
   `this.stripe.charge`; no `sub.gateway` branch; sweeps had no gateway filter →
   a PayPal sub with no Stripe method hit `handlePaymentFailure` → PAST_DUE →
   suspend. Confirmed.
6. **No gateway idempotency** — no Stripe `Idempotency-Key`, no PayPal
   `PayPal-Request-Id` (PayPal even made `invoice_id` unique-per-attempt, the
   opposite of idempotent). Confirmed.
7. **Settlement is check-then-act** — `markInvoicePaid` uses a `findFirst`
   idempotency check + separate `$transaction`, no row lock, no unique backstop on
   `Payment`; side effects gate on a stale in-memory `invoice.state`. Confirmed
   (mitigated but not eliminated — see continuation).
8. **Invoice number = `COUNT()+1`** — `nextInvoiceSequence` counts rows per year;
   collision-prone, saved only by `Invoice.number @unique` throwing. Confirmed.
9. **Refunds/disputes don't revoke entitlement; paid invoices deletable** —
   Stripe refund/dispute webhooks unhandled; refunds never touched the server;
   `deleteInvoice` hard-deleted PAID invoices, cascading the `Payment` ledger.
   Confirmed.
10. **No DB uniqueness** — `Payment.gatewayRef` not unique; `Server.subscriptionId`
    not unique; one-server-per-sub and node-capacity are check-then-act with
    TOCTOU races (port allocation IS race-safe via `@@unique([nodeId,ip,port])`).
    Confirmed.

**Not reproduced / already correct:** port/allocation assignment is race-safe (DB
unique constraint + retry); renewal advances the period exactly once and is
period-gated so a recovered sub isn't re-charged next sweep; scheduler jobs are
multi-instance-safe via deterministic `jobId`s; `markInvoicePaid` is idempotent
on `gatewayRef` for webhook re-delivery of a single invoice.

---

## 3. Files & migrations changed

**Migrations (P0-A):**
- `infra/docker/Dockerfile.migrate` — fail-closed `run-migrate.sh`.
- `infra/scripts/assert-migrate-fail-closed.sh` — regression guard (new).
- `.github/workflows/ci.yml` — `migrations` job (ephemeral PG + drift + guard).
- `docs/25-database-migrations.md` — recovery runbook (new).

**Checkout / provisioning (P0-B, C):**
- `apps/panel-api/src/common/dto/attribution.dto.ts` — strict DTO + shared
  `sanitizeAttribution` (new).
- `apps/panel-api/src/orders/dto/create-order.dto.ts` — `expressBackups` +
  nested `attribution`.
- `apps/panel-api/src/orders/orders.service.ts` — reserve-before-charge + rollback.
- `apps/panel-api/src/auth/dto/auth.dto.ts`, `auth.service.ts` — shared strict DTO.
- `apps/panel-api/src/billing/billing.service.ts` — `abandonUnpaidOrder`,
  attribution re-sanitize.

**Billing lifecycle & refunds (P0-D, E, F, G):**
- `apps/panel-api/src/billing/billing.service.ts` — `expireDueCancellations`,
  `suspendSubscriptionServers`, immediate-cancel suspend, PayPal renewal guard +
  sweep filters, immutable `deleteInvoice`, refund→suspend,
  `findInvoiceIdByPaymentRef`, refund idempotency guard.
- `apps/panel-api/src/billing/billing.scheduler.ts` — expiry sweep wired.
- `apps/panel-api/src/billing/gateways/stripe.gateway.ts` — idempotency keys.
- `apps/panel-api/src/billing/gateways/paypal.gateway.ts` — `PayPal-Request-Id`.
- `apps/panel-api/src/billing/webhooks/stripe-webhook.controller.ts` —
  `charge.refunded` + `charge.dispute.created`.

**Tests (new):** `create-order.dto.spec.ts`, `orders.service.spec.ts`,
`billing.service.lifecycle.spec.ts`, `billing.service.refunds.spec.ts`.

**No schema migrations were added** — the DB-enforced invariants (P0-H) are
specified below and deferred so they can ship with the required data-cleaning
migrations and a reconciliation of the new CI drift check (see §6).

---

## 4. Security & billing invariants now enforced (app layer)

- No production path auto-reconciles or hides a failed migration; deploy fails
  closed.
- A customer is never charged before a provisionable server + allocation is
  reserved; a reservation failure charges nothing and rolls back.
- Cancel-at-period-end subscriptions terminate at period end and stop serving;
  immediate cancellation stops the server.
- PayPal-managed subscriptions are billed only by PayPal; the Stripe path can
  neither double-charge nor suspend them.
- Retried Stripe charges/refunds and PayPal refunds are idempotent at the gateway.
- Paid/refunded invoices and their payment ledger cannot be deleted.
- A full refund or any reversal/chargeback revokes entitlement (server suspended);
  reversal recording is idempotent.

---

## 5. Tests added & how to run

```bash
cd apps/panel-api
npm test                                   # 598 unit tests (67 suites) — green
npx tsc --noEmit -p tsconfig.build.json    # typecheck — clean
npx eslint <changed files>                 # clean
bash ../../infra/scripts/assert-migrate-fail-closed.sh   # fail-closed guard — passes
```

New specs and what they lock down:
- `create-order.dto.spec.ts` (8) — ordinary / attributed / express / combined
  orders accepted; unknown top-level and attribution keys rejected.
- `orders.service.spec.ts` (2) — reservation precedes settlement; a capacity
  failure charges nothing and rolls back.
- `billing.service.lifecycle.spec.ts` (7) — expiry sweep (+ guarded no
  double-suspend), immediate-cancel suspension, PayPal renewal skip, gateway
  filter on both sweeps.
- `billing.service.refunds.spec.ts` (11) — paid/refunded delete refused,
  full-vs-partial refund suspension, external-reversal idempotency, ref mapping.

Not yet run in this environment (no local Postgres/Redis/Docker): the CI
`migrations` job, Docker image builds, Go agent build, `helm lint/template`, and
web production build. These run in CI; commands are in §7.

---

## 6. Operator-visible behavior/schema changes

- **Migrate container now exits non-zero on a failed migration** and no longer
  self-heals. A previously-green auto-healing deploy will now surface a real
  failure — follow `docs/25-database-migrations.md`. Seed failure is fatal in
  production.
- **Immediate cancellation and full refunds now stop the customer's server(s)**
  (a suspend job). This is new side-effecting behavior on those admin actions.
- **PAID/REFUNDED invoices can no longer be deleted** from the admin UI (the API
  returns 400). Void/refund instead.
- **PayPal subscriptions are no longer touched by the Stripe renewal sweep** — if
  a PayPal renewal webhook is missed, the sub will not be Stripe-charged or
  auto-suspended; it must be reconciled from PayPal (see continuation).
- No schema changes in this branch.

---

## 7. Remaining blockers (ranked)

### P0 (must fix before unconditional production sign-off)
1. **DB-enforced invariants (P0-H).** Add, each with a preceding data-cleaning
   migration and a dry-run against a restored backup:
   - `Payment` unique on `(gateway, gatewayRef)` where `gatewayRef <> ''` — backs
     the settlement idempotency check with a hard constraint.
   - One active server per subscription: partial unique index
     `CREATE UNIQUE INDEX ON "Server"("subscriptionId") WHERE "deletedAt" IS NULL AND "subscriptionId" IS NOT NULL`.
   - Price uniqueness: replace the composite that a nullable `hardwareTierId`
     weakens with two partial unique indexes (tier NULL / tier NOT NULL).
   - Invoice numbering: replace `COUNT()+1` with a Postgres sequence (or an
     upsert on a per-year counter row in the same tx as invoice insert).
   - **Drift-check reconciliation:** the new CI `migrate diff --exit-code` step
     flags raw partial indexes not representable in `schema.prisma`. Either
     express what Prisma can natively and add the partial indexes via a migration
     with a documented `// prisma-migrate-diff:ignore` allowlist step, or gate the
     drift check to datamodel-representable objects. Decide before adding them.
2. **Durable dunning schedule (P0-D remainder).** Add `attemptCount` +
   `nextAttemptAt` to `Subscription` (or an `Invoice` dunning record); implement
   the 24h / 72h-suspend / 14d-terminate cadence with fake-clock tests. Today
   dunning retries flatly every hour with no terminal state.
3. **Atomic settlement + webhook inbox (P0-F/G remainder).** A verified
   `WebhookEvent` inbox (provider event id unique, payload hash, state, attempts)
   persisted before ack, processed async/idempotently, returning non-2xx if it
   can't be durably stored; convert `markInvoicePaid` OPEN→PAID to a guarded
   conditional `updateMany`/upsert so concurrent deliveries can't double-apply.
4. **PayPal order/capture idempotency + one-time-PayPal renewal strategy.**
   Requires PayPal **sandbox** validation (out of scope here: no live/sandbox
   credentials).
5. **Node-capacity atomic reservation.** Serialize the capacity check + row
   insert (advisory lock or a capacity-counter row updated in the same tx) to
   close the overcommit race.

### P1 (deployment & node security — not started this session)
Panel image root-lockfile/`npm ci`; stop injecting full `.env` into the web
container; Helm image names/PANEL_URL/metrics-exposure/NetworkPolicy; native
multi-tenant isolation (fail closed until per-server identity + isolation lands);
reject Windows-container/sandbox methods at validation instead of silent
fallback; agent HMAC nonce/replay cache; bind agent TLS fingerprint at bootstrap;
revalidate outbound-webhook destinations at delivery (SSRF/rebinding); redact
query strings/tokens from exception logs; per-account auth throttle + mandatory
MFA for privileged roles; fail-closed agent-update checksum/signature; remove
Promtail Docker-socket access.

### P2 (tests, docs, honesty)
Ephemeral-PG/Redis integration tests for migrations/order-settlement/concurrent
webhooks/renewal-dunning/allocation races; reconcile docs (Next.js version, real
test counts, TeamSpeak pricing, stubbed runtimes, Compose-vs-K8s readiness, iOS
source external, dunning behavior); stop any "production-ready/green" claims not
backed by passing deployment paths.

---

## 8. Safe deployment / migration sequence (do NOT auto-run)

1. Review this branch; run full CI (unit + e2e + the new `migrations` job +
   Docker/Helm/Go/web builds).
2. On a maintenance window, take + verify an encrypted DB backup
   (`infra/scripts/backup-panel-db.sh`).
3. Deploy the migrate container. Because it is now fail-closed, a pre-existing
   drift will stop the deploy — resolve via `docs/25-database-migrations.md`
   before proceeding (do not force).
4. Deploy panel-api + web.
5. Smoke test: an attributed order, an express-backup order, a cancel (immediate
   + at-period-end), a Stripe refund, a PayPal renewal.
6. Before an unconditional production sign-off, land the P0 remainder (§7) —
   especially the DB constraints and webhook inbox — with their data-cleaning
   migrations dry-run against a restored backup.

---

## 9. Verdict

**Pilot-ready with conditions.** The critical data-loss (migrations) and
money-safety (charge-before-provision, cancel/refund entitlement, gateway
routing, gateway idempotency) defects are fixed and regression-tested at the
application layer. **Not yet unconditionally production-ready**: the
DB-enforced invariants, durable dunning schedule, and webhook inbox (P0-H and the
P0-F/G remainder) close the remaining concurrency/replay windows and must land —
with migrations dry-run against production-shaped data — before a full
production sign-off. P1 node/deployment security and P2 integration tests remain
open. Nothing in this branch has been pushed or deployed.
