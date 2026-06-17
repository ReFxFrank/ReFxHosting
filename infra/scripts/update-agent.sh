#!/usr/bin/env bash
#
# update-agent.sh — rebuild the ReFx node agent from source and restart it.
#
# Run as your NORMAL user (the one that owns the repo). It builds the binary as
# you (so Go uses your PATH/cache), then uses sudo only to (re)start the agent,
# which runs as root for Docker-socket + state-dir access.
#
# It auto-detects how the agent runs:
#   * systemd unit `refx-agent.service` present -> swap binary + systemctl restart
#   * otherwise                                 -> stop the process + relaunch (nohup)
#
# Override defaults with env vars if your layout differs:
#   REFX_AGENT_CONFIG=/path/to/node-agent.yaml
#   REFX_AGENT_LOG=/var/log/refx-agent.log
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AGENT_DIR="$REPO_ROOT/apps/node-agent"
BIN="$AGENT_DIR/refx-agent"
CONFIG="${REFX_AGENT_CONFIG:-$REPO_ROOT/node-agent.yaml}"
LOG="${REFX_AGENT_LOG:-/var/log/refx-agent.log}"

echo "==> Pulling latest (git)"
git -C "$REPO_ROOT" pull origin main

echo "==> Building agent"
# Go is commonly installed to /usr/local/go/bin, which a non-login shell (like
# `bash update-agent.sh`) doesn't have on PATH. Add it if `go` isn't found.
command -v go >/dev/null 2>&1 || export PATH="$PATH:/usr/local/go/bin"
command -v go >/dev/null 2>&1 || {
  echo "ERROR: 'go' not found. Install Go 1.25+ (https://go.dev/dl/) or, better," >&2
  echo "       use the panel's 'Update agent' button once a release is published." >&2
  exit 1
}
( cd "$AGENT_DIR" && go build -o ./refx-agent.new ./cmd/refx-agent )

if systemctl list-unit-files 2>/dev/null | grep -q '^refx-agent\.service'; then
  echo "==> systemd unit found; swapping binary + restarting service"
  mv -f "$AGENT_DIR/refx-agent.new" "$BIN"
  sudo systemctl restart refx-agent
  sudo systemctl --no-pager --lines=0 status refx-agent || true
else
  echo "==> No systemd unit; restarting the background process (as root)"
  sudo pkill -f refx-agent || true
  sleep 1
  mv -f "$AGENT_DIR/refx-agent.new" "$BIN"
  sudo bash -c "nohup '$BIN' --config '$CONFIG' > '$LOG' 2>&1 &"
  sleep 1
  pgrep -af refx-agent || echo "WARNING: no refx-agent process found after start — check $LOG"
fi

echo "==> Done. Running game servers re-attach automatically; node returns to ONLINE shortly."
