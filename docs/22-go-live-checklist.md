# 22 — Go-Live Checklist (taking paying customers)

The master runbook for turning the ReFx Hosting **foundation** into a live
business that safely takes real money. This is the single source of truth we work
down together; check items off as they land.

Each task is tagged:

- 👤 **You** — a business/account/external action only the operator can do.
- 🛠️ **Code/config** — something that lives in this repo (we can do it here).
- 🤝 **Both** — needs your inputs + a repo change.

Status legend: ✅ done · ⚠️ partial / needs config · ❌ not started.

> **The minimum gate to flip "accepting payments" on** is everything in
> **Track A–E** plus the **pre-launch smoke test (Track I)**. Tracks F–H harden
> and grow the business and can trail the first customers by days, not months.

---

## Track A — Business & legal foundation 👤

You can't take card payments or publish a Terms of Service without these.

- [ ] **Legal entity** registered (LLC / Ltd / sole trader as appropriate). Needed
      for Stripe/PayPal business accounts, the ToS "operating entity", and tax.
- [ ] **Business bank account** for payouts.
- [ ] **Live Stripe account**, business-verified, payouts enabled.
- [ ] **Live PayPal Business account**, with a REST app (live client id/secret).
- [ ] **Domain** registered (the brand domain, e.g. `refx.gg`) + DNS access.
- [ ] **Transactional email provider** (Postmark / SES / Resend / Mailgun) — a
      dedicated sending domain, not a personal Gmail.
- [ ] **Tax position** understood: where you're registered for VAT/GST/sales tax,
      and whether you charge it. (The panel computes VAT/GST/US tax from the
      customer's billing address — you must configure the rates/registration.)
- [ ] **Lawyer review** of the policy drafts (Terms / Privacy / AUP / Refunds) for
      your jurisdiction. The repo text is a *starting point, not legal advice.*

---

## Track B — Legal & policy pages 🤝

The pages are wired (`/terms`, `/privacy`, `/acceptable-use`, `/refunds`,
footer links, cookie-consent banner). They render `{{PLACEHOLDER}}`s verbatim
until filled — intentionally. See **[docs/18-launch-legal.md](18-launch-legal.md)**.

- [ ] ⚠️ Fill `apps/web/lib/legal.ts`: `entity`, `registeredAddress`,
      `contactEmail`, `privacyEmail`, `legalEmail`, `jurisdiction`,
      `effectiveDate`.
- [ ] ⚠️ Confirm `SUBPROCESSORS[]` (infra provider + email provider; Stripe /
      PayPal / Apple-APNs pre-filled).
- [ ] ⚠️ Set the refund window + amounts in `app/(public)/refunds/page.tsx`.
- [ ] ⚠️ Set build-time `NEXT_PUBLIC_SITE_DOMAIN` and `NEXT_PUBLIC_BRAND_NAME`.
- [ ] 🛠️ Rebuild `web` after editing (these are baked at build time), then read
      every page end-to-end with fresh eyes.

---

## Track C — Payments, go-live 🤝

Verify in **sandbox** first, then swap to live keys. See
**[docs/07-billing.md](07-billing.md)** and the step-by-step
**[sandbox runbook — docs/28-payment-go-live.md](28-payment-go-live.md)**.

- [ ] 👤 **Stripe**: create a restricted/live API key; add the webhook endpoint
      `POST https://<api-domain>/api/v1/billing/webhooks/stripe` and copy the
      signing secret.
- [ ] 👤 **PayPal**: live REST app; register the webhook and enable
      `PAYMENT.SALE.COMPLETED`, `PAYMENT.CAPTURE.COMPLETED/REFUNDED`, and
      `BILLING.SUBSCRIPTION.CANCELLED/SUSPENDED/EXPIRED`.
- [ ] ⚠️ Enter keys in **Owner → Payments** (encrypted at rest) or env. Confirm
      the webhook secret is set so signature verification passes.
- [ ] 🤝 **Sandbox dry-run**: buy a product on Stripe test + PayPal sandbox →
      confirm the invoice settles, the server provisions, and a renewal/dunning
      cycle behaves. (`billing.service.settlement.spec.ts` covers the engine; this
      verifies the *live wiring*.)
- [ ] 🤝 Verify **recurring**: a PayPal Subscriptions auto-bill cycle and a saved
      Stripe-card off-session renewal both settle.
- [ ] 🤝 Verify a **refund** both ways: from the gateway dashboard (the
      `...REFUNDED` webhook records it) and from **Admin → Invoices → Refund**
      (full/partial — the panel calls the gateway then records a REFUNDED payment).
- [ ] 👤 Configure **tax rates / registration** to match Track A.
- [ ] 🤝 Set real **products, hardware tiers, and per-interval prices** in the
      admin panel (the seeded numbers are placeholders).

---

## Track D — Production infrastructure 🤝

See **[docs/19-production-deployment.md](19-production-deployment.md)** and the
**[OVH quickstart](21-ovh-quickstart.md)**.

- [ ] 🤝 Point DNS: `example.com`/`www` → web, `api.example.com` → panel-api.
- [ ] 🤝 **Reverse proxy + TLS** (Caddy/nginx) terminating HTTPS to the
      loopback-bound ports — ready-to-edit configs in
      **[`infra/reverse-proxy/`](../infra/reverse-proxy/)** (Caddy auto-upgrades the
      console WebSocket; nginx config includes the WS upgrade map).
- [ ] 🛠️ Production `.env`: strong `SECRETS_ENC_KEY` (64-hex), `JWT_ACCESS_SECRET`,
      `JWT_REFRESH_SECRET`; `BIND_HOST=127.0.0.1`, `TRUST_PROXY=1`,
      `CORS_ORIGINS=https://...`, `PANEL_URL=https://...`,
      `NEXT_PUBLIC_API_URL=https://api...` (baked at build).
- [ ] 👤 **Never** commit secrets — they live only in the server's `.env`. Do
      **not** rotate `SECRETS_ENC_KEY` once real encrypted data exists.
- [ ] 🤝 Configure **SMTP** (from Track A) so password reset / verification /
      receipts actually deliver; add **SPF + DKIM + DMARC** DNS records.
- [ ] 🤝 Firewall: open node ports `8443`, `2022`, and the game range; restrict
      Postgres/Redis to the internal network only.
- [ ] 🤝 Consider **agent TLS cert pinning** (`AGENT_TLS_PINNING`) per node.
- [x] ✅ **Production preflight** blocks boot on weak/default secrets, `CORS_ORIGINS`
      that is `*` **or empty**, http `PANEL_URL`, and missing SMTP
      (`apps/panel-api/src/config/preflight.ts`).
- [x] ✅ **Backend not publicly mapped**: Swagger `/docs` is off in prod (opt-in
      `ENABLE_API_DOCS`), and the reverse-proxy samples 404 `/docs` + `/metrics`.
      Verify `curl -o/dev/null -w '%{http_code}' https://api.<domain>/docs` → 404.

**Web hosting (only if selling the Web Hosting line):**
- [ ] 🤝 Stand up at least one **web node**: install the agent + run **Caddy** on
      `:80`/`:443` (admin API on `localhost:2019`, http server `srv0`), and open
      ports **80 + 443** on its firewall. See **[docs/27-web-hosting.md](27-web-hosting.md)**
      and OPERATOR-TODO § B.
- [ ] 🤝 Toggle **"Web hosting enabled"** on that node (Admin → Nodes → Edit). The
      scheduler only places web servers on web-enabled nodes — until one exists,
      the web catalog shows **no available locations** by design.
- [ ] 🤝 **Wildcard DNS** `*.apps.<brand>` → the web node IP, so each site gets an
      instant `https://<id>.apps.<brand>` address before a custom domain is added.

**Voice / TeamSpeak (only if selling >32-slot plans):**
- [ ] 🤝 The free TeamSpeak licence caps a server at **32 slots**. To sell the
      **Plus (64) / Pro (128)** tiers, apply for an **Authorized TeamSpeak Host
      (ATHP)** licence and configure it on the voice node; otherwise sell only the
      32-slot **Community** tier (works out of the box) or hide the others in
      Admin → Products. See OPERATOR-TODO § C.

**Per-server databases (only if offering the MySQL "Databases" feature):**
- [ ] 🤝 Stand up a MySQL/MariaDB server with an admin account that can
      `CREATE USER`/`GRANT`, then add it in **Admin → Operations → Database Hosts**
      (set the **public host** customers connect to) and hit **Test**. Open the
      public port to customers. Until a host exists, the Databases tab shows a
      clear "unavailable" message. (MySQL/MariaDB only for now; Postgres is a
      future provisioner.)

---

## Track E — Data safety & disaster recovery 🛠️

Game-server *volumes* back up to S3 already. The **panel's own Postgres** (users,
billing, subscriptions) is the crown jewels and needs its own backups.

- [x] ✅ **Panel DB backup tooling**: `infra/scripts/backup-panel-db.sh`
      (`pg_dump` → AES-256 → S3 + retention) and `restore-panel-db.sh`. See
      **[docs/23-backups-dr.md](23-backups-dr.md)**.
- [ ] 🤝 **Configure + schedule it**: set `PANEL_BACKUP_*` in `.env` and add the
      cron entry (daily).
- [ ] 🤝 **Restore drill**: restore the latest backup into a scratch DB and verify
      (the documented drill). Record the date.
- [ ] 🤝 Back up `.env` / `SECRETS_ENC_KEY` to a secure secret store — if it's
      lost, every encrypted secret (gateway keys, TOTP seeds, SFTP creds) is
      unrecoverable.
- [ ] 🤝 Confirm S3/MinIO bucket lifecycle + versioning for game backups.

---

## Track F — Observability & ops 🛠️

The `--profile full` stack ships Prometheus + Grafana + Loki and the panel
exposes `/metrics` + `/health`. The public `/status` page is live.

- [ ] 🤝 Run the **full profile** in prod (or wire external Prometheus/Grafana) —
      now includes an **Alertmanager** service.
- [x] ✅ **Alert rules**: panel-api down, 5xx rate, p95 latency, payment-webhook
      failures, no nodes online, host disk/memory, target down — in
      `infra/docker/prometheus/rules/alerts.yml`, routed by
      `infra/docker/alertmanager/alertmanager.yml`.
- [ ] 🤝 **Wire an Alertmanager receiver** so alerts actually reach you — the
      default is a sink. `infra/docker/alertmanager/alertmanager.yml` ships a
      ready-to-fill **Discord** receiver (easiest for a gaming host) plus
      Slack/email/PagerDuty examples: paste your webhook, uncomment, and
      `infra/scripts/dc restart alertmanager`. (TLS-cert-expiry alert needs
      blackbox_exporter; example included, commented.)
- [ ] 🤝 External **uptime monitor** (independent of your own infra) hitting
      `/health`.
- [ ] 🤝 Define the **incident process** on the `/status` page (who posts, when).

---

## Track G — Abuse, fraud & support readiness 🤝

- [ ] **Rate limiting**: in-memory throttler is active and *fine for a single
      box*. If you scale panel-api to multiple replicas, move to a Redis-backed
      throttler (deferred audit item). *(to build when scaling — Track J)*
- [ ] Anti-fraud posture: Stripe Radar on, decide on chargeback handling, and
      whether new accounts need email verification before provisioning.
- [ ] **Support inbox + SLA**: the in-panel helpdesk is ready; set categories,
      SLA targets, canned responses, and who staffs it.
- [ ] **Onboarding / lifecycle email**: welcome, receipt, renewal reminder,
      dunning, suspension notices (verify copy + deliverability).
- [ ] **Account roles**: create staff accounts with least-privilege RBAC; keep
      the Owner account locked down (strong password + MFA).

---

## Reviewer / demo account (App Store submission) 🛠️

App Store review needs a working demo login. Seed one — with a real, provisioned
sample server so the dashboard is populated — with one command (after
`update-panel.sh` rebuilds the image):

```bash
infra/scripts/dc run --rm panel-api node dist/scripts/seed-reviewer.js
```

Idempotent (re-running reuses the account + its server). Configurable via env:
`REVIEWER_EMAIL`, `REVIEWER_PASSWORD` (else generated + printed),
`REVIEWER_SERVER_NAME`, `REVIEWER_TEMPLATE_SLUG` (default `minecraft`),
`REVIEWER_NODE_ID` (default: first ONLINE node). The script prints the final
email/password — paste them into App Store Connect's demo-account fields.

Fallback (no script): create the user from **Admin → Users → Create user**, then
**Admin → Servers → Create** assigned to that user.

## Track H — iOS app (can trail launch) 👤

Backend push + universal-links + store listing are ready; the Swift app ships
outside this repo. See **[docs/18-launch-legal.md](18-launch-legal.md)**.

- [ ] Apple Developer Program enrollment.
- [ ] Configure `APNS_*` env (key id/team id/bundle id, `.p8` in secrets only).
- [ ] App Store Connect: privacy nutrition label, Privacy Policy URL, EULA.
- [ ] Confirm in-app **account deletion** path (the panel already supports
      self-service delete + data export).
- [ ] Set `NEXT_PUBLIC_APP_STORE_URL` once the listing is live.

---

## Track I — Pre-launch smoke test (the gate) 🤝

On the real production stack, with live (or final-sandbox) gateways, run one full
customer lifecycle and watch every side effect:

1. Register → verify email → set MFA.
2. Buy a game server (each gateway) → invoice settles → server provisions →
   appears with IP:port.
3. Start/stop, open the console, edit a file, take a backup.
4. Switch the game → reinstall completes → identity preserved.
5. Upgrade a tier → prorated invoice → applies on payment.
6. Open a support ticket → staff reply → customer push received.
7. Cancel → refund → suspension/expiry behaves; confirm audit-log entries.
8. Delete account → data export + deletion works.

Then exercise the other two product lines (skip a line you aren't selling):

9. **Voice** — buy a TeamSpeak plan → accept the licence on the Voice tab →
   server starts → connect on the voice port → claim admin via the Voice-tab
   token. Confirm the slot cap matches the tier.
10. **Web hosting** — buy a web plan (a web-enabled node must exist) → upload a
    file to `public/` over SFTP/the file manager → it serves on the panel
    address → add a custom domain → DNS verifies → SSL issues automatically.
11. **Knowledge base** — `/knowledge-base` lists the seeded articles (search +
    categories), an article opens with rendered formatting, and the homepage
    hero search routes into it. (The Support tab should no longer say "No
    articles found".)

If all of these pass cleanly on prod, you're ready to take customers.

---

## Track J — What we can build in-repo next 🛠️

Concrete engineering items from the tracks above that need no external accounts:

1. ✅ **Panel Postgres backup tooling** — `pg_dump` → encrypted S3, scheduled, with
   a documented restore drill (Track E). *Done: `infra/scripts/backup-panel-db.sh`,
   `restore-panel-db.sh`, `docs/23-backups-dr.md`.*
2. ✅ **Production preflight validator** — refuses to boot / warns loudly on weak
   secrets, wildcard CORS, http API behind https, placeholder passwords (Track D).
   *Done: `apps/panel-api/src/config/preflight.ts`.*
3. ✅ **`.env.production.example`** — a fully-annotated production template wiring all
   the prod flags in one place (Track D). *Done.*
4. ✅ **Alerting rules** — Prometheus alert rules + an Alertmanager service for the
   ops signals in Track F. *Done: `infra/docker/prometheus/rules/alerts.yml`,
   `infra/docker/alertmanager/`.*
5. ✅ **Reverse-proxy configs** — ready-to-use Caddy/nginx files for the
   web + api split (Track D). *Done: `infra/reverse-proxy/`.*
6. **Redis-backed rate limiter** — when multi-replica scaling is on the roadmap
   (Track G). *Still open.*
7. ✅ **Voice + Web Hosting product lines** — TeamSpeak (flat slot-capped tiers)
   and web hosting (catalog → order → provision → custom domain + auto-SSL), with
   web-aware node scheduling (`Node.supportsWeb`). *Done — see web/voice items in
   Track D + the smoke test.*
8. ✅ **Customer knowledge base** — 40 published articles + a public
   `/knowledge-base` and a homepage hero search. *Done.*
9. ✅ **Admin refunds + payment webhook hardening** — `POST /admin/invoices/:id/refund`
   (full/partial via the gateway) and a resilient Stripe webhook, plus the
   sandbox runbook (`docs/28-payment-go-live.md`). *Done.*
10. ✅ **Per-server databases** — real MySQL/MariaDB provisioning on an
    admin-managed `DatabaseHost` (encrypted creds), with an admin UI. *Done.*
11. ✅ **Lifecycle hardening** — suspend truly cuts access (console/files/SFTP) +
    reliable kill, install retries, and a stuck-server reconciler cron. *Done.*

---

_Last updated: 2026-07-01. Keep this file current as items land._
