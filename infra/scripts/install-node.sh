#!/usr/bin/env bash
# =============================================================================
# ReFx Hosting — Linux node-agent installer
# Supports: Ubuntu, Debian, AlmaLinux, Rocky Linux (systemd + x86_64/aarch64)
#
# Usage:
#   sudo ./install-node.sh --panel-url https://api.refx.example --token <NODE_TOKEN>
#   # or via env:
#   PANEL_URL=... NODE_TOKEN=... sudo ./install-node.sh
#
# The NODE_TOKEN is the bootstrap token shown in the admin panel when you
# create the node (Admin → Nodes → Add). The agent uses it once to register
# and receive its signed configuration.
# =============================================================================
set -euo pipefail

# ---- defaults ---------------------------------------------------------------
PANEL_URL="${PANEL_URL:-}"
NODE_TOKEN="${NODE_TOKEN:-}"
AGENT_VERSION="${AGENT_VERSION:-latest}"
REPO="refxfrank/refxhosting"
INSTALL_DIR="/usr/local/bin"
DATA_DIR="/var/lib/refx"
CONFIG_DIR="/etc/refx"
RUN_USER="refx"
SKIP_DOCKER="${SKIP_DOCKER:-false}"

log()  { printf '\033[1;32m[refx]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[refx]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[refx]\033[0m %s\n' "$*" >&2; exit 1; }

# ---- args -------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --panel-url) PANEL_URL="$2"; shift 2;;
    --token)     NODE_TOKEN="$2"; shift 2;;
    --version)   AGENT_VERSION="$2"; shift 2;;
    --skip-docker) SKIP_DOCKER=true; shift;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    *) die "Unknown argument: $1";;
  esac
done

[[ $EUID -eq 0 ]] || die "Must run as root (use sudo)."
[[ -n "$PANEL_URL" ]] || die "--panel-url is required."
[[ -n "$NODE_TOKEN" ]] || die "--token is required."

# ---- preflight: ensure --panel-url points at panel-api, not the web UI ------
# The #1 setup mistake is pointing the agent at the website instead of the API.
# The agent registers at <panel-url>/api/v1/agent/register; panel-api serves a
# JSON liveness probe at /health, whereas the web UI returns its HTML 404 there.
preflight_panel_url() {
  local base="${PANEL_URL%/}"
  # The agent appends /api/v1 itself — strip it if the user included it.
  case "$base" in
    */api/v1|*/api)
      warn "panel-url should not include /api or /api/v1 (the agent adds it) — trimming."
      base="${base%/api*}"; PANEL_URL="$base";;
  esac
  local body
  if ! body="$(curl -fsS --max-time 8 "${base}/health" 2>/dev/null)"; then
    warn "Could not reach ${base}/health yet — the panel may be down or the port blocked."
    warn "Confirm this is the panel-API URL (default port 4000) and that port is open."
    warn "Continuing anyway; the agent retries registration until it succeeds."
    return
  fi
  if printf '%s' "$body" | grep -qiE '<!doctype html|<html|_next'; then
    die "panel-url '${base}' is serving the WEB UI, not panel-api.
     Use the panel-API URL — default port 4000 — e.g. http://your-host:4000 (not the website)."
  fi
  log "Panel API reachable at ${base}"
}
preflight_panel_url

# ---- detect distro & arch ---------------------------------------------------
. /etc/os-release || die "Cannot read /etc/os-release."
log "Detected: ${PRETTY_NAME:-$ID}"
case "$ID" in
  ubuntu|debian) PKG="apt";;
  almalinux|rocky|rhel|centos) PKG="dnf";;
  *) warn "Untested distro '$ID' — continuing best-effort."; PKG="dnf";;
esac

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) GOARCH="amd64";;
  aarch64|arm64) GOARCH="arm64";;
  *) die "Unsupported architecture: $ARCH";;
esac

# ---- install Docker (unless skipped / present) ------------------------------
install_docker() {
  if command -v docker >/dev/null 2>&1; then
    log "Docker already installed: $(docker --version)"
    return
  fi
  [[ "$SKIP_DOCKER" == "true" ]] && { warn "Skipping Docker install (--skip-docker)."; return; }
  log "Installing Docker Engine..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
}
install_docker

# ---- create user & directories ----------------------------------------------
if ! id -u "$RUN_USER" >/dev/null 2>&1; then
  log "Creating system user '$RUN_USER'"
  useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$RUN_USER"
fi
# Allow the agent to talk to the Docker socket.
if getent group docker >/dev/null 2>&1; then
  usermod -aG docker "$RUN_USER"
fi
install -d -o "$RUN_USER" -g "$RUN_USER" -m 0750 "$DATA_DIR" "$DATA_DIR/servers" "$DATA_DIR/backups"
install -d -o "$RUN_USER" -g "$RUN_USER" -m 0750 "$CONFIG_DIR"

# ---- download the agent binary ----------------------------------------------
BIN_NAME="refx-agent-linux-${GOARCH}"
if [[ "$AGENT_VERSION" == "latest" ]]; then
  DL_URL="https://github.com/${REPO}/releases/latest/download/${BIN_NAME}"
else
  DL_URL="https://github.com/${REPO}/releases/download/${AGENT_VERSION}/${BIN_NAME}"
fi
log "Downloading agent: $DL_URL"
TMP="$(mktemp)"
curl -fSL "$DL_URL" -o "$TMP" || die "Download failed. Build locally with 'make' in apps/node-agent if no release exists yet."
# Verify checksum if published alongside.
if curl -fsSL "${DL_URL}.sha256" -o "${TMP}.sha256" 2>/dev/null; then
  (cd "$(dirname "$TMP")" && echo "$(cut -d' ' -f1 "${TMP}.sha256")  $(basename "$TMP")" | sha256sum -c -) \
    || die "Checksum verification failed."
  log "Checksum verified."
fi
# Install the binary into the data dir (owned by the non-root run user) so the
# agent can self-update in place (download → swap → re-exec) without root. Also
# symlink it onto PATH for convenience.
install -o "$RUN_USER" -g "$RUN_USER" -m 0755 "$TMP" "${DATA_DIR}/refx-agent"
ln -sfn "${DATA_DIR}/refx-agent" "${INSTALL_DIR}/refx-agent"
rm -f "$TMP" "${TMP}.sha256"

# ---- write config -----------------------------------------------------------
log "Writing ${CONFIG_DIR}/config.yaml"
umask 077
cat > "${CONFIG_DIR}/config.yaml" <<EOF
# ReFx node-agent configuration (generated by install-node.sh)
# Schema matches apps/node-agent/config.example.yaml. The bootstrap token is used
# once to register; afterwards the agent persists its identity to
# <data_dir>/agent.state and the token can be removed.
data_dir: "${DATA_DIR}"

panel:
  url: "${PANEL_URL}"
  bootstrap_token: "${NODE_TOKEN}"
  # Set true only if the panel uses a self-signed/internal TLS cert.
  skip_tls_verify: false

# Inbound HTTPS control API the panel calls. On first start the agent self-signs
# a TLS cert (fingerprint reported to the panel); replace with a real one in prod.
api:
  bind_addr: "0.0.0.0:8443"

# Embedded SFTP server (per-server credentials issued by the panel).
sftp:
  bind_addr: "0.0.0.0:2022"

# Runtime backend: docker | native_process | windows_container.
runtime:
  default: docker

log:
  level: info

# Backup storage. Default = this node's local disk (<data_dir>/backups).
# For offsite backups + fast direct downloads (presigned URLs), point at any
# S3-compatible store (AWS S3, Cloudflare R2, Backblaze B2, MinIO):
# backup:
#   driver: s3
#   s3:
#     endpoint: ""        # custom endpoint for R2/B2/MinIO; empty for AWS
#     region: us-east-1
#     bucket: refx-backups
#     access_key: ""
#     secret_key: ""
#     use_path_style: false  # true for MinIO (and some R2 setups)
EOF
chown "$RUN_USER:$RUN_USER" "${CONFIG_DIR}/config.yaml"
chmod 0600 "${CONFIG_DIR}/config.yaml"

# ---- firewall (best effort) -------------------------------------------------
if command -v ufw >/dev/null 2>&1; then
  ufw allow 8443/tcp || true
  ufw allow 2022/tcp || true
elif command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port=8443/tcp || true
  firewall-cmd --permanent --add-port=2022/tcp || true
  firewall-cmd --reload || true
fi

# ---- systemd unit -----------------------------------------------------------
log "Installing systemd unit"
install -m 0644 "$(dirname "$0")/refx-agent.service" /etc/systemd/system/refx-agent.service 2>/dev/null || \
cat > /etc/systemd/system/refx-agent.service <<'EOF'
[Unit]
Description=ReFx Hosting node agent
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=refx
Group=refx
ExecStart=/usr/local/bin/refx-agent --config /etc/refx/config.yaml
Restart=on-failure
RestartSec=5
LimitNOFILE=1048576
# Never kill the agent's children (native game servers) on restart/update.
KillMode=process
AmbientCapabilities=CAP_NET_BIND_SERVICE
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now refx-agent

log "Agent installed and started. It will now register with the panel."
log "Check status:  systemctl status refx-agent"
log "Follow logs:   journalctl -u refx-agent -f"
