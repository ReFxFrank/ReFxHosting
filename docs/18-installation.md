# Installation Guide

This guide covers two tasks: bringing up the **control plane** locally with Docker
Compose, and **installing the node agent** on a Linux or Windows host and
registering it as a `Node`. For production (Kubernetes/Helm) see
[19 — Production Deployment](19-production-deployment.md).

## Prerequisites

| Tool | Version | For |
|------|---------|-----|
| Docker + Docker Compose | recent | Local control plane |
| Node.js + pnpm | Node 20+, pnpm 9+ | Running apps outside containers (optional) |
| Go | 1.22+ | Building the agent from source (optional) |
| A host to act as a node | Linux x86_64/arm64 or Windows Server | Running game servers |

## Part 1 — Local control plane (Docker Compose)

The Compose stack under `infra/docker/` brings up `panel-api`, `web`,
PostgreSQL, Redis, OpenSearch, and a local MinIO (S3-compatible) store.

```bash
git clone https://github.com/refxfrank/refxhosting.git
cd refxhosting
cp .env.example .env            # then edit secrets (see table below)
docker compose -f infra/docker/docker-compose.yml up -d
```

On first boot, run migrations and seed the catalog (game templates / "eggs"):

```bash
# Apply the canonical schema and seed sample data
docker compose -f infra/docker/docker-compose.yml exec panel-api \
  pnpm prisma migrate deploy
docker compose -f infra/docker/docker-compose.yml exec panel-api \
  pnpm db:seed
```

Then:

- Web panel: <http://localhost:3000>
- API: <http://localhost:4000> — Swagger UI at `/docs`, GraphQL at `/graphql`
- Health: `GET http://localhost:4000/healthz`

### Core environment variables

Set these in `.env` (copied from `.env.example`). Secrets must be strong and
unique; never commit `.env`.

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string consumed by Prisma ([02 — Database](02-database.md)). |
| `REDIS_URL` | Redis for cache, rate limits, BullMQ queues. |
| `OPENSEARCH_URL` | OpenSearch endpoint for search. |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Object storage for backups and ticket attachments. |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Signing keys for access/refresh JWTs ([08 — Security](08-security.md)). |
| `ENCRYPTION_KEY` | Master/KMS key for AES-256-GCM encryption of `*Enc` columns (TOTP seeds, SFTP/db passwords). |
| `PANEL_URL` / `API_URL` | Public URLs for links, CSRF origin, and agent callbacks. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe gateway ([07 — Billing](07-billing.md)). |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | PayPal gateway. |
| `SMTP_*` | Outbound email (verification, invoices, notifications). |
| `NODE_AGENT_TLS_CA` | CA used to verify agent certificates (node trust model, [08 — Security](08-security.md)). |

### Create the first admin

After seeding, create an `OWNER` account (or use the seeded admin credentials
printed by `db:seed`):

```bash
docker compose -f infra/docker/docker-compose.yml exec panel-api \
  pnpm cli user:create --email you@example.com --role OWNER
```

Log in at <http://localhost:3000>, then enroll 2FA (TOTP or WebAuthn) from the
account security page.

## Part 2 — Register a node

A `Node` is a host that runs `node-agent` and actually executes game servers. The
flow is: create the node in the panel → receive a one-time **bootstrap token** →
run the installer on the host → the agent registers, advertises capacity, and
goes `ONLINE`. The protocol detail is in [06 — Node Agent](06-node-agent.md); the
trust model is in [08 — Security](08-security.md).

```mermaid
sequenceDiagram
  participant Admin
  participant Panel as panel-api
  participant Host as Node host
  participant Agent as node-agent
  Admin->>Panel: Create Node (region, os, fqdn, capacity)
  Panel-->>Admin: Bootstrap token (one-time) + install command
  Admin->>Host: Run install-node.sh / install-node.ps1 with token
  Host->>Agent: Install binary + service + TLS material
  Agent->>Panel: Register (token, advertised capacity, agentVersion)
  Panel-->>Agent: Accept; issue scoped credentials; mark ONLINE
  Agent->>Panel: Heartbeats (NodeHeartbeat) + WS connection
```

### Step 1 — Create the node in the panel

Admin UI → **Nodes → Add Node**, choosing:

- `Region` (e.g. `eu-central`)
- `os` — `LINUX` or `WINDOWS`
- `fqdn` — DNS name the panel uses to reach the agent
- `daemonPort` (default `8443`), `sftpPort` (default `2022`), `scheme` (`https`)
- advertised capacity (`cpuCores`, `memoryMb`, `diskMb`) and overcommit ratios

The panel stores a `tokenHash` (only the hash) and shows the bootstrap token and
an install command **once**.

### Step 2a — Install on Linux (`install-node.sh`)

Run on the node host as root. The script lives at
`infra/scripts/install-node.sh` and is what the panel's install command invokes:

```bash
curl -fsSL https://panel.example.com/install-node.sh | sudo bash -s -- \
  --panel-url https://panel.example.com \
  --token <BOOTSTRAP_TOKEN> \
  --node-id <NODE_UUID>
```

The installer:

1. Detects OS/arch and downloads the matching signed `node-agent` binary
   (checksum-verified, [12 — CI/CD](12-cicd.md)).
2. Installs Docker if `DOCKER`/`SANDBOX` deploy methods are required.
3. Writes `/etc/refx-agent/config.yml` (panel URL, node id, token, ports, TLS).
4. Provisions TLS material and registers a `systemd` service `refx-agent`.
5. Starts the agent, which registers with the panel and begins heartbeating.

```bash
systemctl status refx-agent
journalctl -u refx-agent -f
```

### Step 2b — Install on Windows (`install-node.ps1`)

Run in an elevated PowerShell. The script lives at
`infra/scripts/install-node.ps1`:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
iwr https://panel.example.com/install-node.ps1 -UseBasicParsing | iex; `
  Install-RefxNode `
    -PanelUrl "https://panel.example.com" `
    -Token "<BOOTSTRAP_TOKEN>" `
    -NodeId "<NODE_UUID>"
```

The installer downloads `node-agent-windows-amd64.exe`, writes the config,
provisions TLS, and registers a **Windows Service** (`RefxAgent`). For
`WINDOWS_CONTAINER` deploy targets it verifies the Containers feature / Docker is
present; for `NATIVE_PROCESS` it prepares the SteamCMD path. Check status with:

```powershell
Get-Service RefxAgent
```

### Step 3 — Verify registration

Back in the panel, the node should transition `PROVISIONING → ONLINE`, report
`agentVersion`, and start emitting `NodeHeartbeat` samples (CPU/mem/disk/net). Add
`Allocation`s (IP:port ranges) so servers can be placed, then the node is ready to
host servers.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Node stuck `PROVISIONING` | Agent reachable on `daemonPort` from panel; firewall allows `:8443`; token not expired/already used. |
| TLS handshake errors | `NODE_AGENT_TLS_CA` matches the agent's issued cert; clock skew. |
| No heartbeats | `refx-agent`/`RefxAgent` service running; outbound to panel allowed. |
| Migrations fail on boot | `DATABASE_URL` correct; run `prisma migrate deploy` manually; see [20](20-upgrade-migration.md). |
| Servers won't install | Docker present (for `DOCKER`/`SANDBOX`); disk space; correct `GameTemplate` images ([10 — Game Templates](10-game-templates.md)). |

## Related documents

- [06 — Node Agent](06-node-agent.md) — handshake and protocol detail.
- [08 — Security](08-security.md) — bootstrap tokens, TLS, encryption keys.
- [09 — Infrastructure](09-infrastructure.md) — topology and scaling.
- [19 — Production Deployment](19-production-deployment.md) — Kubernetes/Helm.
