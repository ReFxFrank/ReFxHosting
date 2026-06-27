# 27 — Web hosting (app-container plans)

A design for offering **web hosting** alongside game servers, as tiered products —
"option 2": **app-container hosting**. A customer buys a plan (WordPress, static
site, Node.js, …), gets a managed container, maps a domain, and we issue SSL
automatically. Reuses ~80% of the platform; the only genuinely new infrastructure
is the **reverse-proxy + ACME + domain** layer.

## What we reuse as-is

- **Billing / products / tiers** — a web plan is a `HARDWARE_TIER` product priced on
  CPU/RAM/disk, identical to games (see docs/25). No billing changes.
- **Node agent runtime** — a web app is a resource-limited Docker container, exactly
  like a game server. The `Runtime` interface, limits, stats, lifecycle all apply.
- **SFTP + file manager** — customers upload site files the same way.
- **Templates** — app types (WordPress/nginx/Node) are templates, like eggs.

## The one new thing: HTTP routing + SSL + domains

Game servers get a **unique port**; websites share **80/443** and route by
**hostname**. So each web node runs a reverse proxy that terminates TLS and proxies
by `Host:` to the right app container.

- **Reverse proxy: Caddy** (chosen) — automatic Let's Encrypt issuance/renewal per
  domain with near-zero config; a small admin API to add/remove sites at runtime.
  (Traefik is the alternative; Caddy wins on auto-HTTPS simplicity.)
- Caddy runs as a node service (container) listening on 80/443, on the **web** nodes
  only. App containers expose an **internal** port on the node network; Caddy proxies
  `https://<domain>` → `http://<app-container>:<port>`.
- **Wildcard convenience domain**: every site also gets `https://<shortId>.apps.refx.gg`
  (wildcard cert) so it's live the instant it's provisioned, before the customer
  points a real domain.

## Data model (chosen: REUSE Server/GameTemplate, not parallel models)

A web app **is a `Server`** with `serverType = WEB_APP` — it reuses provisioning,
limits, stats, lifecycle, SFTP, the file manager, and the existing `ServerDatabase`
relation (free phase-3 databases). Implemented in `schema.prisma`:

- `ServerType += WEB_APP` — the authoritative discriminator (web apps are filtered
  out of the game dashboards/lists exactly like voice servers already are).
- `GameTemplate.kind: TemplateKind (GAME | WEB)` — web app types (`wordpress`,
  `static-nginx`, `nodejs`, `php-apache`) are templates with `kind = WEB`; each
  carries its container image, internal port, install steps, and vars (PHP version,
  DB toggle). The storefront lists `kind = GAME` for games and `kind = WEB` for web.
- `ProductType += WEB_HOSTING` — web plans are products of this type (HARDWARE_TIER
  billing, same engine).
- **New `Domain` model**: `id`, `serverId`, `hostname` (unique), `isPrimary`,
  `sslStatus (PENDING|ACTIVE|FAILED)`, `verifiedAt`. One web app ↔ many domains.

> Migration: run `prisma migrate dev --name web_hosting` against the panel DB to
> generate + apply it (schema is committed; the migration is generated on the DB,
> never hand-written).

## Panel ↔ agent additions

- Agent gains a tiny **proxy-control** call set: `POST /api/v1/proxy/site`
  `{domain, upstream, webAppId}` and `DELETE /api/v1/proxy/site/{domain}`. The agent
  translates these into Caddy admin-API calls. Caddy handles cert issuance.
- **Domain verification** before issuing: panel checks the domain's A/AAAA (or a TXT
  challenge) points at the node IP, sets `Domain.sslStatus`, then asks the agent to
  add the site. Surfaces "point your A record to `<ip>`" in the UI.

## Customer UX (new screens)

- **Order**: pick a web plan + app type (WordPress/static/Node) + region, same flow
  as a game order.
- **Web app dashboard**: status, the `*.apps.refx.gg` URL, **Domains** tab (add a
  domain → see the DNS target + live SSL status), file manager, SFTP, "PHP version",
  logs, restart. Most panels reuse existing server components.
- **Databases** (phase 3): provision a MySQL/MariaDB DB + show credentials.

## Phasing

1. **MVP — provision + convenience domain.** `WebApp` model, `WEB` kind + storefront
   split, `static-nginx` and `wordpress` templates, agent hosts the container, Caddy
   service on the web node, auto `*.apps.refx.gg`. Sellable: a working site on a ReFx
   subdomain, file manager + SFTP. No custom domains yet.
2. **Custom domains + SSL.** `Domain` model, proxy-control API, DNS verification,
   per-domain Let's Encrypt, the Domains UI.
3. **Managed extras.** Databases (MySQL + phpMyAdmin), PHP version switch, one-click
   app catalog, cron, email (or punt email to a third party — email is its own beast).

## Open decisions (defaults chosen, change if you disagree)

- Proxy: **Caddy** (auto-HTTPS). • Convenience domain: **`*.apps.refx.gg`** (needs a
  wildcard DNS record + cert). • DB model: **per-site MariaDB container** in phase 3
  (isolation) vs a shared DB server. • Web nodes are **tagged** so web apps schedule
  only onto nodes running Caddy (game nodes stay game-only, or a node can do both).

## Pricing

Same engine as games (docs/25): price web tiers on RAM at the standard rate, or set a
web-specific `$/GB` if web density (many small sites) justifies it. A `static-nginx`
plan is tiny (256–512 MB); WordPress 512 MB–1 GB. Revisit the rate once real density
is known.

_Status: design. Phase 1 implementation next._
