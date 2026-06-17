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

### 2.2 Install the agent (one-liner)

The installer downloads the prebuilt agent from the latest GitHub release,
installs Docker, creates the non-root `refx` user, writes the config, opens
firewall ports, and registers a systemd service. As root:

```bash
curl -fsSL https://raw.githubusercontent.com/refxfrank/refxhosting/main/infra/scripts/install-node.sh -o install-node.sh
sudo bash install-node.sh --panel-url https://api.refx.gg --token <NODE_TOKEN>
```
> Use the **API** URL (`https://api.refx.gg`), not the website — the installer
> checks and refuses the web UI. The agent binary lands in the refx-owned data
> dir so the panel's **Update agent** button can self-update it later.

Verify:
```bash
systemctl status refx-agent
journalctl -u refx-agent -f      # watch it register; Ctrl-C to stop
```
The node should flip to **online** in Admin → Nodes within a few seconds.

> Updates from here are **no-SSH**: Admin → Nodes → **Update agent** (or
> Update all). `infra/scripts/update-agent.sh` (build-from-source) remains as a
> fallback if you ever need it.

### 2.3 Node firewall
The installer opens `8443` (panel→agent control) and `2022` (SFTP). Two things to
add/tighten:

```bash
# Open the game/voice port range you set on the node in 2.1
sudo ufw allow 27000:28000/tcp
sudo ufw allow 27000:28000/udp
sudo ufw allow OpenSSH
sudo ufw enable
```

**Lock 8443 to the panel only** (recommended — otherwise internet scanners hit
it and you'll see harmless but noisy `TLS handshake error` lines in the agent
log):
```bash
sudo ufw delete allow 8443/tcp
sudo ufw allow from <PANEL_VPS_IP> to any port 8443 proto tcp
sudo ufw reload
```
The panel→agent channel is HMAC-signed (a scanner can't do anything even if it
connects), so this is defense-in-depth + log hygiene, not a fix for a breach.

### 2.4 RAID & data
On a 2×NVMe box choose **RAID-1** at OVH install time for customer-data safety
(or RAID-0 + rely on off-site backups). Server data lives under `/var/lib/refx`.

---

## Part 2W — Windows node (alternative to the Ubuntu node)

ReFx runs natively on Windows too — the agent installs as a real **Windows
Service** and can host servers via Docker Desktop (Docker runtime) or directly as
native processes (native runtime). Use a Windows node for games that only ship a
Windows server build; otherwise the Ubuntu node above is simpler and cheaper.

> The panel VPS (Part 1) is unchanged — this only replaces *a node*. You can run
> Ubuntu and Windows nodes side by side in the same panel.

### 2W.1 Prerequisites (on the Windows box)
- **Windows Server 2022 or 2025** (64-bit), fully updated.
- Logged in as a user with **Administrator** rights.
- For the **Docker runtime**: install **Docker Desktop** and confirm "Engine
  running" before installing the agent. For **native** hosting you can skip Docker.
- Create the node in the panel exactly as in **2.1** (Admin → Nodes → Add) and
  copy its **bootstrap token**.

### 2W.2 Install the agent (PowerShell, as Administrator)
The installer downloads the prebuilt `refx-agent-windows-amd64.exe`, writes its
config, opens the firewall, and registers the auto-starting `refx-agent` service.

```powershell
cd $env:TEMP
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest `
  -Uri "https://raw.githubusercontent.com/refxfrank/refxhosting/main/infra/scripts/install-node.ps1" `
  -OutFile install-node.ps1 -UseBasicParsing
powershell -ExecutionPolicy Bypass -File .\install-node.ps1 `
  -PanelUrl https://api.refx.gg -Token <NODE_TOKEN> -Version latest
```
> Use the **API** URL (`https://api.refx.gg`), not the website — the installer
> checks and refuses the web UI.

**If the installer fails to parse** (`Unexpected token '}'` or similar), you've
hit GitHub's raw CDN serving a stale cached copy. Download the file pinned to an
exact commit instead (replace `<SHA>` with the latest commit hash of the script),
which bypasses the branch cache:
```powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/refxfrank/refxhosting/<SHA>/infra/scripts/install-node.ps1" -OutFile install-node.ps1 -UseBasicParsing
# sanity check: must print 0 (no stray non-ASCII)
(Select-String -Path .\install-node.ps1 -Pattern ([char]0x2014)).Count
```

### 2W.3 Verify
```powershell
Get-Service refx-agent                        # Status should be Running
Get-NetTCPConnection -LocalPort 8443,2022 -State Listen |
  Select-Object LocalAddress,LocalPort,State  # both listening
Get-EventLog -LogName Application -Source refx-agent -Newest 50   # logs
```
The node should flip to **online** in Admin → Nodes within a few seconds.

### 2W.4 Firewall — lock 8443 to the panel
The installer opens `8443` (control) and `2022` (SFTP) to everyone. Restrict the
control port to your panel VPS (same rationale as the Ubuntu node — defense in
depth + log hygiene):
```powershell
Set-NetFirewallRule -DisplayName "ReFx Agent 8443" -RemoteAddress <PANEL_VPS_IP>
```
Open your game/voice port range as you deploy servers, e.g.:
```powershell
New-NetFirewallRule -DisplayName "ReFx Game TCP" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 27000-28000
New-NetFirewallRule -DisplayName "ReFx Game UDP" -Direction Inbound -Action Allow -Protocol UDP -LocalPort 27000-28000
```

### 2W.5 Operations (Windows)
| Action | Command (PowerShell, Admin) |
|--------|------------------------------|
| Status | `Get-Service refx-agent` |
| Start / Stop / Restart | `Start-Service refx-agent` / `Stop-Service refx-agent` / `Restart-Service refx-agent` |
| Live logs | `Get-EventLog -LogName Application -Source refx-agent -Newest 50` (or the data dir) |
| Config | `C:\ProgramData\ReFx\config\config.yaml` |
| Binary | `C:\Program Files\ReFx\agent\refx-agent.exe` |
| Server data | `C:\ProgramData\ReFx\data` |

**Updates are no-SSH**: Admin → Nodes → **Update agent** works on Windows too —
the service-aware binary swaps itself and the Service Control Manager restarts it
automatically (running game servers keep running and re-attach). No need to RDP in
to update.

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

| Node hostname | Region | OS | Role |
|---------------|--------|----|------|
| `refx-ca-east-bhs` | Canada East — OVH Beauharnois (BHS) | Ubuntu | game + voice |
| `refx-us-east-va`  | US East — OVH Vint Hill, VA (VIN)   | Ubuntu | game + voice |

> The `systemctl` / `journalctl` commands below are for the **Ubuntu** nodes. For
> a **Windows** node, manage the `refx-agent` service with PowerShell instead —
> see **Part 2W.5** for the equivalent commands.

Per-node conventions (identical on every Ubuntu node):

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
