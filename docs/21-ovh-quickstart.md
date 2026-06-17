# OVH Small-Scale Production Runbook

A concrete, copy-paste path from **two fresh OVH boxes** to a production ReFx
Hosting deployment that can sell game/voice servers: **one small VPS** for the
control plane (panel-api + web + Postgres + Redis + MinIO) and **one dedicated
node** for game/voice servers. Add more nodes later by repeating Part 2.

For the Kubernetes path see [19 — Production Deployment](19-production-deployment.md);
for local dev see [18 — Installation](18-installation.md). This runbook is the
"small but real" middle ground using Docker Compose on a single panel host.

> Replace `refx.gg` with your domain and `api.refx.gg` with your API subdomain
> throughout. Commands assume Ubuntu 22.04/24.04 LTS on both boxes.

---

## Topology

```
                      ┌──────────────────────────────┐
  players / customers │  Node (dedicated, Ubuntu)    │
  ── game/voice ─────►│  refx-agent + Docker         │
  ── SFTP :2022 ─────►│  game ports + :2022          │
                      └──────────────┬───────────────┘
                                     │  :8443 control (panel → node)
                                     │  node → panel HTTPS (register/heartbeat)
  ┌──────────────────────────────┐  │
  │  Panel VPS (Ubuntu)          │◄─┘
  │  Caddy (TLS) → web :3000     │
  │             → panel-api :4000│
  │  Postgres / Redis / MinIO    │   (all bound to 127.0.0.1)
  └──────────────────────────────┘
        ▲ https://refx.gg (web) , https://api.refx.gg (api)
```

**DNS (do this first** — Caddy needs it for TLS):
- `refx.gg` → panel VPS IP
- `api.refx.gg` → panel VPS IP
- (optional) `node1.refx.gg` → node IP, for nicer SFTP host display

---

## Part 1 — Panel VPS (control plane)

### 1.1 Base box
```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install git curl ufw
# Docker Engine + compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # log out/in so this applies
```

### 1.2 Firewall (only 80/443/SSH public)
```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```
Postgres/Redis/MinIO/web/api stay on `127.0.0.1` (compose `BIND_HOST`), so they
are never exposed — Caddy is the only thing public.

### 1.3 Clone + configure
```bash
git clone https://github.com/refxfrank/refxhosting.git
cd refxhosting
cp .env.example .env
```

Generate real secrets:
```bash
echo "SECRETS_ENC_KEY=$(openssl rand -hex 32)"
echo "JWT_ACCESS_SECRET=$(openssl rand -hex 48)"
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 48)"
echo "JWT_MFA_SECRET=$(openssl rand -hex 48)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
```

Edit `.env` and set **at least** these (leave the rest at defaults to start):
```ini
NODE_ENV=production
BIND_HOST=127.0.0.1

# secrets from above
SECRETS_ENC_KEY=...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
JWT_MFA_SECRET=...

# Postgres — the password must match in BOTH places
POSTGRES_PASSWORD=<the-generated-one>
DATABASE_URL=postgresql://refx:<the-generated-one>@postgres:5432/refx?schema=public

# Public URLs (must be https once Caddy is up)
PANEL_URL=https://refx.gg
CORS_ORIGINS=https://refx.gg
PANEL_RP_ID=refx.gg
TRUST_PROXY=1

# BAKED INTO THE WEB BUNDLE AT BUILD TIME — must be your API origin, https.
NEXT_PUBLIC_API_URL=https://api.refx.gg

# Object storage (MinIO runs locally; fine to start). Change the secret.
MINIO_ROOT_PASSWORD=<openssl rand -hex 24>
S3_SECRET_KEY=<same as MINIO_ROOT_PASSWORD>

# First owner login password (email is owner@refx.example)
SEED_OWNER_PASSWORD=<a-strong-password>
```

> **Gotcha:** `NEXT_PUBLIC_API_URL` is compiled into the browser bundle at build
> time and its scheme must match the site (an `https://` page can't call an
> `http://` API). If you change it later you must rebuild the web image.

### 1.4 Bring up the lean stack
The default Compose profile is exactly what you want (Postgres, Redis, MinIO,
migrate, panel-api, web) — OpenSearch/observability/RabbitMQ are behind opt-in
profiles and stay off.

```bash
docker compose -f infra/docker/docker-compose.yml --env-file .env up -d --build
```

This builds the images, runs DB migrations **and the seed** (one-shot `migrate`
service), then starts panel-api and web. First run seeds an **owner** account
(`owner@refx.example` / your `SEED_OWNER_PASSWORD`) and the default catalog.

Verify locally:
```bash
curl -s localhost:4000/health        # -> JSON ok
docker compose -f infra/docker/docker-compose.yml ps
```

### 1.5 TLS reverse proxy (Caddy)
```bash
sudo apt -y install debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt -y install caddy
```

`/etc/caddy/Caddyfile`:
```caddyfile
refx.gg {
    reverse_proxy 127.0.0.1:3000
}
api.refx.gg {
    reverse_proxy 127.0.0.1:4000
}
```
```bash
sudo systemctl reload caddy
```
Caddy auto-provisions Let's Encrypt certs (DNS must already point here) and
proxies WebSockets (the live console) automatically.

### 1.6 First login
Browse to **https://refx.gg**, sign in as `owner@refx.example` with your
`SEED_OWNER_PASSWORD`. Immediately: change the password, enable 2FA, and
(optionally) create your real admin user.

---

## Part 2 — Game/Voice node (dedicated box)

### 2.1 Create the node in the panel
In the panel: **Admin → Nodes → Add**. Set its public hostname/IP and an
**allocation port range** for game servers (e.g. `27000–28000`). Save — the panel
shows a **bootstrap token**. Copy it.

### 2.2 Install the agent

There's no published agent release yet, so the node **builds the agent from
source** (this is also what `update-agent.sh` does). It needs **Go 1.25** (newer
than Ubuntu's apt Go) and Docker. As root:

```bash
# Docker
curl -fsSL https://get.docker.com | sh && systemctl enable --now docker

# Go 1.25 (to build the agent)
curl -fsSL https://go.dev/dl/go1.25.0.linux-amd64.tar.gz -o /tmp/go.tgz
rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tgz
echo 'export PATH=$PATH:/usr/local/go/bin' >/etc/profile.d/go.sh && export PATH=$PATH:/usr/local/go/bin

# Build (clone owned by your admin user so update-agent.sh can rebuild later)
apt -y install git
git clone https://github.com/refxfrank/refxhosting.git /opt/refxhosting
( cd /opt/refxhosting/apps/node-agent && go build -o refx-agent ./cmd/refx-agent )
ln -sf /opt/refxhosting/apps/node-agent/refx-agent /usr/local/bin/refx-agent

# refx user + data dirs (the agent runs non-root, with Docker access)
useradd --system --home-dir /var/lib/refx --shell /usr/sbin/nologin refx 2>/dev/null || true
usermod -aG docker refx
install -d -o refx -g refx -m 0750 /var/lib/refx /var/lib/refx/servers /var/lib/refx/backups
install -d -o refx -g refx -m 0750 /etc/refx

# Config (paste the bootstrap token from 2.1; use the API URL, not the website)
cat >/etc/refx/config.yaml <<EOF
data_dir: /var/lib/refx
panel:
  url: https://api.refx.gg
  bootstrap_token: <NODE_TOKEN>
  skip_tls_verify: false
api:
  bind_addr: 0.0.0.0:8443
sftp:
  bind_addr: 0.0.0.0:2022
runtime:
  default: docker
log:
  level: info
EOF
chown refx:refx /etc/refx/config.yaml && chmod 600 /etc/refx/config.yaml

# systemd service (runs /usr/local/bin/refx-agent -> the source build)
cp /opt/refxhosting/infra/scripts/refx-agent.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now refx-agent
```

Verify:
```bash
systemctl status refx-agent
journalctl -u refx-agent -f      # watch it register
```
The node should flip to **online** in Admin → Nodes within a few seconds.

> Later updates: `cd /opt/refxhosting && bash infra/scripts/update-agent.sh`
> (run as your admin user; rebuilds + restarts via systemd).

### 2.3 Node firewall
The installer opens `8443` (panel→agent control) and `2022` (SFTP). Also open the
**game/voice port range** you set in 2.1, e.g.:
```bash
sudo ufw allow 27000:28000/tcp
sudo ufw allow 27000:28000/udp
sudo ufw allow OpenSSH
sudo ufw enable
```
Lock `8443` down to the panel VPS IP if you want (optional hardening):
```bash
sudo ufw allow from <PANEL_VPS_IP> to any port 8443 proto tcp
```

### 2.4 RAID & data
On a 2×NVMe box choose **RAID-1** at OVH install time for customer-data safety
(or RAID-0 + rely on off-site backups). Server data lives under `/var/lib/refx`.

---

## Part 3 — Go live (first sellable product)

1. **Region & node**: Admin → ensure your region exists and the node is assigned
   to it and **online**.
2. **Steam games (optional now)**: Admin → Settings → Steam — set the
   game-download account that owns Arma 3 / DayZ (+ a one-time Steam Guard code).
3. **Products**: Admin → Products. The seed ships a default catalog; edit/clone
   to set your **hardware tiers** (game servers) and **per-slot** pricing (voice).
4. **Payments**: Admin → Settings/Payments — add live Stripe and/or PayPal keys
   and register their webhooks (`/api/v1/billing/webhooks/...`). Verify in
   sandbox first.
5. **Email**: Admin → Settings → Email — point SMTP at your provider and send a
   test (verification / receipts need this).
6. **Test order**: place a real order end-to-end (pay → invoice settles →
   server provisions on the node → console streams). You're live.

---

## Part 4 — Ongoing operations

**Update the panel** (pull, rebuild, migrate, restart — data stores untouched):
```bash
cd ~/refxhosting && bash infra/scripts/update-panel.sh
```

### Node operations

> **Game node ≠ panel box — don't mix them up.** A game node runs **only** the
> `refx-agent` service + game/voice Docker containers. There is **no
> `docker compose` / panel stack on a node** — you manage it with `systemctl`,
> not `docker compose`. The panel (web/API/Postgres/Redis) lives on a **separate
> VPS**; `docker compose …` commands belong there, not on a node.

The node fleet (each is a separate OVH box you SSH into by name):

| Node hostname | Region | Role |
|---------------|--------|------|
| `refx-ca-east-bhs` | Canada East — OVH Beauharnois (BHS) | game + voice |
| `refx-us-east-va`  | US East — OVH Vint Hill, VA (VIN)   | game + voice |

Per-node conventions (identical on every node):

| Thing | Value |
|-------|-------|
| SSH / admin user | `ubuntu` (sudo) — **don't** work as root day-to-day |
| Agent service | `refx-agent` (systemd), runs as the non-root **`refx`** user |
| Agent repo (build/update) | `/opt/refxhosting` (owned by `ubuntu`) |
| Agent config | `/etc/refx/config.yaml` (owned by `refx`, mode 600) |
| Server data | `/var/lib/refx` |

The commands are the same on each node — you just SSH into the box you want
first. Run them as `ubuntu`; they use `sudo` where needed.

**On `refx-ca-east-bhs`:**
```bash
ssh ubuntu@refx-ca-east-bhs            # or its IP
sudo systemctl start refx-agent        # start the node
sudo systemctl stop refx-agent         # stop it (running game servers keep running)
sudo systemctl restart refx-agent      # restart (servers re-attach in a few seconds)
sudo systemctl status refx-agent       # is it active?
sudo journalctl -u refx-agent -f       # live logs (Ctrl-C to exit)
cd /opt/refxhosting && bash infra/scripts/update-agent.sh   # update: rebuild + restart
sudo reboot                            # full box reboot (rarely needed)
```

**On `refx-us-east-va`:**
```bash
ssh ubuntu@refx-us-east-va             # or its IP
sudo systemctl start refx-agent
sudo systemctl stop refx-agent
sudo systemctl restart refx-agent
sudo systemctl status refx-agent
sudo journalctl -u refx-agent -f
cd /opt/refxhosting && bash infra/scripts/update-agent.sh
sudo reboot
```

No-SSH option: **Admin → Nodes → (node) → Restart agent** does the agent restart
from the panel, and **Clear Steam cache** wipes that node's cached steamcmd
sessions. Restarting the agent never stops running game servers — they keep
running and re-attach automatically.

Other service controls (same on any node): `sudo systemctl enable refx-agent`
(auto-start on boot), `disable`, `is-active`, `is-enabled`. To fully stop and
prevent restart: `sudo systemctl stop refx-agent && sudo pkill -f refx-agent`
then confirm with `pgrep -af refx-agent` (should print nothing).

**Backups (do this before you have real customers):**
- DB: `docker compose -f infra/docker/docker-compose.yml exec postgres pg_dump -U refx refx | gzip > refx-$(date +%F).sql.gz` on a cron, shipped off-box.
- Game-server backups: configure the agent's backup target to **OVH Object
  Storage (S3)** instead of local MinIO for off-box safety at scale.
- VPS-level: enable OVH snapshots/automated backups on the panel VPS.

**Health:** `https://api.refx.gg/health` and `/metrics` (mounted at the root,
not under `/api/v1`). Add the `observability` Compose profile later for
Grafana dashboards once the panel box has spare RAM.

---

## Security checklist

- [ ] All secrets in `.env` are freshly generated (not the `change-me` defaults).
- [ ] `SECRETS_ENC_KEY` is backed up securely — losing it makes encrypted
      secrets (TOTP/SFTP/Steam) unrecoverable.
- [ ] Owner password changed + 2FA enabled.
- [ ] Only 80/443/SSH public on the panel VPS; data stores on `127.0.0.1`.
- [ ] Node exposes only `8443` (ideally panel-IP-only), `2022`, and the game
      port range.
- [ ] HTTPS everywhere; `NEXT_PUBLIC_API_URL`, `PANEL_URL`, `CORS_ORIGINS`,
      `PANEL_RP_ID` all use the real domain.
- [ ] Off-box backups (DB + game data) running on a schedule.
- [ ] (Optional) `AGENT_TLS_PINNING=true` after pinning each node's cert in
      Admin → Nodes.

---

## Sizing reference (starting point)

| Box | OVH pick | Runs |
|-----|----------|------|
| Panel | VPS ~4 vCPU / 8 GB / 80–160 GB NVMe | panel-api, web, Postgres, Redis, MinIO |
| Node | Dedicated, high-clock (e.g. Ryzen 7 9800X3D, 64 GB, 2×NVMe, 1 Gbps, game anti-DDoS) | refx-agent + Docker; game **and** voice servers |

Run voice (TeamSpeak) on the same node to start. Add a second node by repeating
Part 2 when the first fills up — the panel's node-capacity checks will tell you.
