# refx.gg environment map

This is the file that turns the deploy skill from generic advice into an executable runbook.
Most of it is now filled from the repo; the remaining `TODO(frank)` lines are genuinely
operational facts the code can't know (your host provider, your nodes, restore-test dates,
your customers' timezone). Update it when infra changes — a stale runbook is worse than none,
because it's trusted.

**Never put secrets in this file.** Reference where a secret lives, not what it is.

## Architecture in one line

Central panel = **one Next.js app** (`apps/web`, marketing + customer dashboard + admin, `:3000`)
+ **NestJS API** (`apps/panel-api`, REST + GraphQL + BullMQ, `:4000`), backed by Postgres/Redis/S3.
Game servers run on **separate host nodes**, each running the Go **node-agent** (`:8443` control,
`:2022` SFTP) — the agent is NOT part of compose or k8s; it's installed on bare nodes and
self-updates from GitHub Releases. **The panel and the nodes are different blast radii — that
distinction is the whole point of the change-class table in SKILL.md.**

## Services

| Service | What it does | Repo / path | Host / image | Deploy command | Health check |
|---|---|---|---|---|---|
| Marketing + control panel | One Next.js app: public marketing (`(public)`: /games, /knowledge-base, /tools, pricing) **and** authenticated dashboard/admin | `apps/web` | image `ghcr.io/refxfrank/refxhosting-web`; compose service `web` `:3000` (build ctx = `apps/web`, self-contained) | compose: `infra/scripts/update-panel.sh` → `docker compose up -d --build web`; k8s: `helm upgrade` | `GET /` (compose `wget localhost:3000/`) |
| API / backend | NestJS brain — servers, billing, auth, queues, agent control | `apps/panel-api` | image `ghcr.io/refxfrank/refxhosting-panel-api`; compose `panel-api` `:4000` (build ctx = repo root, needs `database/prisma`) | `infra/scripts/update-panel.sh` (pull main → migrate job → `up -d --build panel-api web`); k8s `helm upgrade` (pre-upgrade Prisma migrate Job) | **`GET /health` at ROOT** (not `/api/v1/health`) → `{status, uptime, checks:{database}}` via `SELECT 1` |
| Node daemon / agent | Go binary, runs game servers on each host node | `apps/node-agent` | **host-installed** via `infra/scripts/install-node.{sh,ps1}`; NOT compose/k8s; `:8443` control + `:2022` SFTP | Panel **"Update agent"** button → `POST /api/v1/admin/nodes/:id/update-agent` (agent self-updates to latest GitHub Release), or `infra/scripts/update-agent.sh` on the box | agent heartbeat to panel on `:8443`; installer preflights the panel `/health` |
| Database | PostgreSQL 16 | managed in prod | prod: managed Postgres (Helm expects external); dev: compose `postgres:16-alpine` `:5432` | migrations via Prisma (`update-panel.sh` migrate job / Helm migrate Job) | `pg_isready` |
| Cache / queue | Redis 7 — cache, BullMQ jobs, rate-limit | managed in prod | prod: managed Redis; dev: compose `redis:7-alpine` `:6379` | n/a (data store) | `redis-cli ping` |
| Object storage | S3/R2 — server backups + ticket/upload attachments | `S3_*` env | prod: Cloudflare R2 / S3; dev: compose `minio` `:9000`/`:9001` (+ `createbuckets` one-shot) | n/a | `/minio/health/live` (dev) |
| Proxy / edge | **Host-installed reverse proxy (Caddy or nginx)** terminating TLS in front of the loopback-bound app | `infra/reverse-proxy/Caddyfile.example`, `nginx.conf.example` | on the panel host, NOT compose | edit host proxy config + reload the proxy | TLS handshake + panel reachable + **WS console streams** |
| Voice hosting | TeamSpeak 3 — runs as a normal server from a template | `database/seed/templates/teamspeak3.json` | via node-agent, like any game | (game onboarding / node) | in-panel server state |
| Web hosting | Static site hosting (`WEB` kind template) | `database/seed/templates/static-nginx.json` | via node-agent | (game onboarding / node) | in-panel server state |
| Observability (opt-in) | Prometheus + Alertmanager + Grafana + Loki + Promtail + node-exporter | `infra/docker` (profile `observability` / `full`) | compose profile only | `docker compose --profile observability up -d` | Prometheus `/-/healthy`, Grafana `/api/health` |

**No reverse-proxy or node-agent service exists in `docker-compose.yml`** — app ports bind to
`BIND_HOST` (default `127.0.0.1`) and are fronted by the host proxy. Break the proxy and you lose
the panel with it (see Out-of-band access).

**Real deploy mechanism:** production deploys are **manual** — `infra/scripts/update-panel.sh`
(compose hosts) or `helm upgrade` (k8s). There is **no automated CD** despite what
`docs/12-cicd.md` describes (that staging→prod pipeline and `deploy.yml` are aspirational and not
built). CI (`.github/workflows/ci.yml`) only lints/tests; `release.yml` only builds images + agent
binaries on a `vX.Y.Z` tag.

## Nodes

| Node | Location | Capacity | Customers on it | Drain command |
|---|---|---|---|---|
| TODO(frank) — the repo can't know your live fleet | | | | Panel Admin → Nodes → per-node; agent restart = `POST /admin/nodes/:id/restart-agent` |

**Live source of truth for the fleet = the panel Admin → Nodes page.** Enumerate real nodes here
once (name, location, capacity, customer count) so the runbook can name them.

Per-node port range: `Node.allocationPortStart`–`allocationPortEnd` (default `25565`–`25999`),
configurable per node to match firewall/port-forward rules.

Order to restart nodes in (least-busy first, smallest blast radius): **TODO(frank)** — fill from
the Admin → Nodes list.

> **Important — an agent update does NOT drop customer servers.** The systemd unit uses
> `KillMode=process`, and Docker/native game processes are re-adopted after the agent re-execs,
> so the panel "Update agent" / self-update path leaves running servers up. What *does* drop
> servers is a **host OS reboot** or a **game-image/reinstall rollout**. So "never restart all
> nodes at once" applies to **host reboots and image rollouts**, not agent version bumps —
> stagger those, notify for those.

## Out-of-band access

**The path in that does not depend on the proxy/edge you might be changing.** The app binds to
loopback behind the host reverse proxy, so if you break Caddy/nginx you also lose the panel you'd
use to fix it.

- TODO(frank): your host/VPS provider console + SSH route (Hetzner / OVH / etc. dashboard) — repo can't know it.
- TODO(frank): who/what to contact if the provider itself (or Cloudflare, if fronting) is the problem.

## Backups

| What | Command | Where it lands | Retention | Last restore *tested* |
|---|---|---|---|---|
| Panel database (Postgres) | `infra/scripts/backup-panel-db.sh` (encrypted `pg_dump` → S3/R2; bucket `PANEL_BACKUP_BUCKET`/`PANEL_BACKUP_PREFIX`; surfaced in Admin storage stats via `apps/panel-api/src/common/s3-lite.ts`) | S3 / R2 | TODO(frank) | TODO(frank): **date** |
| Customer server data | Agent `tar.gz` per server (panel **Backups** tab); **node local disk** for standard servers, **S3/R2 instead** for "Express Backups" servers (one backend per backup, not both) | node local disk or S3/R2 | 25 backups/server (a **scheduled** backup drops the oldest unlocked one; a **manual** create hard-fails at the cap — it does not rotate) | test via Backups → restore into a fresh server, then connect |
| Configs / IaC | git (`infra/`) — **`.env` is NOT committed** | git | — | n/a |

**Restore command** (panel DB, the one you'd run at 2am — write it out in full):

```
TODO(frank): the decrypt + psql restore paired with backup-panel-db.sh.
```

Notes:
- Customer-server **restore is implemented** (agent downloads the archive, tar-extracts into the
  data dir, path-jailed) but its completion is **fire-and-forget — not persisted to a DB status
  field**. Verify a restore by connecting to the restored server, never by a panel status.
- Backups snapshot the **filesystem only** — an attached MySQL database is not in the archive.
- Backup excludes are code-defined per game family in
  `apps/panel-api/src/backups/backup-profiles.util.ts` (not a per-template field).

## Secrets

- **Where they live:** env files — root `.env` (consumed by compose, panel-api, web, Prisma) plus
  `apps/panel-api/.env.example` and `apps/web/.env.example` — **plus** owner-editable,
  AES-256-GCM-encrypted DB overrides for payment-gateway keys (a DB override wins over env).
  k8s uses a Helm-templated `Secret`. **No external secret manager** (no Vault / AWS-SM / GCP-SM).
- **Encrypted at rest** (AES-256-GCM, key `SECRETS_ENC_KEY` = 64 hex): TOTP seeds, SFTP passwords,
  per-server + shared DB passwords, Stripe/PayPal keys, webhook signing secrets. Refresh
  tokens / API keys / recovery codes are SHA-256 **hashed**, not encrypted.
- **Boot preflight** (`apps/panel-api/src/config/preflight.ts`) **blocks a prod boot** on
  placeholder/short/identical JWT secrets, a zero/invalid `SECRETS_ENC_KEY`, or missing SMTP
  (unless `ALLOW_INSECURE_CONFIG`). A misconfigured secret fails fast at boot, not silently.
- Rotation procedure: TODO(frank) — there is no automated rotation. To rotate: update the env (or
  re-set the encrypted DB override) and redeploy the affected service.
- **If a secret is ever printed to a log or console, it is rotated. Not "probably fine".**

## Windows (deploy timing)

- Customers' dominant timezone: **TODO(frank)** — business fact, not in the repo.
- Peak usage: **evenings and weekends** in that timezone (game hosting) — **never deploy into this**.
- Chosen maintenance window: TODO(frank) — a weekday morning, off-peak, in that timezone.
- Rollback watch period after a deploy (suggested defaults): **web ~15 min · panel/API ~30 min ·
  migration or node/image rollout ~60 min**. TODO(frank): confirm.

## Rollback criteria (the real numbers)

| Signal | Baseline | Rollback threshold |
|---|---|---|
| Error rate | TODO(frank): capture from panel `/metrics` (Prometheus) before deploy | > 2× baseline for 5 min |
| Provisioning failures | 0 on the canary | any failure on the canary |
| Panel login failures | 0 | any |
| Running-server count | count from Admin → Nodes before deploy | any unexplained drop |

## Canary provision check

The one check that proves the product works: provision a real server, boot it, connect, delete.

- Automated? **No — there is no automated canary today.** This is the **highest-value automation to
  build on the platform**: a script that buys/provisions a server through the normal path, boots it,
  connects, and deletes it. Until it exists, run it **manually on every deploy**.
- Command / script: TODO(frank) — build it.
- Which game: pick a **fast-installing** one — Minecraft (Paper) or a small non-Steam game
  (Terraria/tShock). **Avoid ARK/ASA/Squad** — huge SteamCMD depots make the canary slow.

## Status page / customer comms

- Status page: **built in** — the platform ships a status + incidents system at `apps/web` `/status`,
  managed from the panel. Use it; update it before customer-visible downtime.
- Announcement channel: TODO(frank) — Discord webhook / channel.
- Who writes the customer-facing message: TODO(frank).

## Monitoring

| What | Where | Alerts to |
|---|---|---|
| Uptime | built-in `/status` + (external monitor?) TODO(frank) | |
| Error rate | panel `/metrics` (Prometheus) → Grafana (observability profile) | TODO(frank) |
| Node resources | node-exporter (observability profile) + agent stats surfaced in panel | |
| Provisioning success | panel audit log + BullMQ queues (no dedicated dashboard yet) | |
| Cost / usage | provider dashboard — TODO(frank) | |

## Edge / DDoS note

There is **no dedicated DDoS/L4 component in the repo.** Edge protection = the host reverse proxy
(Caddy/nginx) plus, if you front the panel with Cloudflare, the `CLIENT_IP_HEADER` handling in
panel-api. When SKILL.md says "infra / proxy / DDoS," on refx.gg that means **the host proxy config
and (if used) your Cloudflare settings** — treat a change to either as the lock-yourself-out class.
