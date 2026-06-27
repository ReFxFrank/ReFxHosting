package runtime

import (
	"bytes"
	"context"
	"fmt"
	"path"
	"regexp"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/network"
)

// ansiRe strips the ANSI colour escapes steamcmd emits (e.g. "Public...\x1b[0mOK"),
// which otherwise split the markers we match on.
var ansiRe = regexp.MustCompile("\x1b\\[[0-9;]*m")

// steamLoginScript warms steamcmd (a separate self-update run, so the actual
// login is fast enough that a 30-second mobile Guard code survives) and then logs
// in once. The machine-auth (sentry) is written under $HOME, which is the
// node-level steam home — so a subsequent install with the same account reuses it
// and needs no further code. Credentials arrive via env (never the argv of the
// outer container) and are passed to steamcmd's +login.
const steamLoginScript = `set -uo pipefail
export HOME="$VHOME"
mkdir -p "$HOME"
SC="$HOME/steamcmd"
if [ ! -x "$SC/steamcmd.sh" ]; then
  mkdir -p "$SC"
  curl -sSL https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz | tar zxf - -C "$SC" || { echo "REFX: failed to fetch steamcmd"; exit 3; }
fi
# Warm steamcmd (self-update) first so the login below is near-instant.
"$SC/steamcmd.sh" +quit </dev/null >/dev/null 2>&1 || true
# Log in. Guard code (if any) is steamcmd's 3rd +login arg. stdin is /dev/null so
# a Steam Guard prompt (e.g. "send fresh code" with no code, or a wrong code) can
# NEVER hang waiting for input — steamcmd fails fast, while the login attempt has
# already triggered Steam to email a fresh code.
if [ -n "${SG:-}" ]; then
  "$SC/steamcmd.sh" +login "$SU" "$SP" "$SG" +quit </dev/null
else
  "$SC/steamcmd.sh" +login "$SU" "$SP" +quit </dev/null
fi`

// steamLoginImage is the default throwaway image used to run the login probe.
const steamLoginImage = "ghcr.io/parkervcp/steamcmd:debian"

// RunSteamLogin authenticates the game-download Steam account on this node and
// caches its machine-auth, so future installs for owned-game eggs (Arma 3, DayZ,
// …) need no Steam Guard code. It pre-warms steamcmd then logs in once, on demand
// — decoupled from the queued install, so a short-lived mobile Guard code is used
// while still fresh. Returns the captured steamcmd output and whether login
// succeeded.
func (d *DockerRuntime) RunSteamLogin(
	ctx context.Context,
	image, username, password, guard string,
) (string, bool, error) {
	steamHome := d.ensureSteamHome()
	if steamHome == "" {
		return "", false, fmt.Errorf("no steam home configured on this node")
	}
	if strings.TrimSpace(username) == "" || strings.TrimSpace(password) == "" {
		return "", false, fmt.Errorf("steam username and password are required")
	}
	if strings.TrimSpace(image) == "" {
		image = steamLoginImage
	}

	// Per-account home under the node steam home (mounted at containerSteamHome),
	// matching the path installs use ($REFX_NODE_STEAM_HOME/<username>).
	vhome := path.Join(containerSteamHome, username)
	cfg := &container.Config{
		Image:      image,
		Entrypoint: []string{"bash"},
		Cmd:        []string{"-c", steamLoginScript},
		Env: []string{
			"VHOME=" + vhome,
			"SU=" + username,
			"SP=" + password,
			"SG=" + guard,
		},
		Labels: map[string]string{labelManaged: "true"},
	}
	host := &container.HostConfig{
		Mounts: []mount.Mount{{Type: mount.TypeBind, Source: steamHome, Target: containerSteamHome}},
	}

	// Make sure the image is present (best-effort; create will also error clearly).
	pullCh := make(chan InstallProgress, 16)
	go func() { _ = d.pull(ctx, image, pullCh); close(pullCh) }()
	for range pullCh { // drain
	}

	name := "refx-steam-login"
	_ = d.cli.ContainerRemove(ctx, name, container.RemoveOptions{Force: true})
	created, err := d.cli.ContainerCreate(ctx, cfg, host, &network.NetworkingConfig{}, nil, name)
	if err != nil {
		return "", false, fmt.Errorf("create steam-login container: %w", err)
	}
	defer func() {
		_ = d.cli.ContainerRemove(context.Background(), created.ID, container.RemoveOptions{Force: true})
	}()

	statusCh, errCh := d.cli.ContainerWait(ctx, created.ID, container.WaitConditionNotRunning)
	if err := d.cli.ContainerStart(ctx, created.ID, container.StartOptions{}); err != nil {
		return "", false, fmt.Errorf("start steam-login container: %w", err)
	}

	var buf bytes.Buffer
	if logs, lerr := d.cli.ContainerLogs(ctx, created.ID, container.LogsOptions{
		ShowStdout: true, ShowStderr: true, Follow: true,
	}); lerr == nil {
		defer logs.Close()
		streamDockerLogs(logs, func(line []byte) {
			if buf.Len() < 64<<10 { // cap captured output at 64 KiB
				buf.Write(line)
				buf.WriteByte('\n')
			}
		})
	}

	var exit int64 = -1
	select {
	case e := <-errCh:
		if e != nil {
			return buf.String(), false, fmt.Errorf("wait steam-login: %w", e)
		}
	case st := <-statusCh:
		exit = st.StatusCode
	case <-time.After(5 * time.Minute):
		return buf.String(), false, fmt.Errorf("steam-login timed out")
	case <-ctx.Done():
		return buf.String(), false, ctx.Err()
	}

	ok := steamLoginSucceeded(buf.String(), exit)
	return buf.String(), ok, nil
}

// steamLoginSucceeded interprets steamcmd output. steamcmd's exit code is
// unreliable (it can exit 0 having printed a Guard prompt, and the bootstrap can
// fail before login), so success REQUIRES an explicit positive marker — never the
// exit code alone. The unused exit param is kept for call-site clarity.
func steamLoginSucceeded(out string, _ int64) bool {
	// Strip ANSI colour codes first — steamcmd splits otherwise-contiguous markers
	// with them (e.g. "to Steam Public...\x1b[0mOK") and injects extra text inside
	// others ("Waiting for user info...<compat>OK"), so match the clean text.
	low := strings.ToLower(ansiRe.ReplaceAllString(out, ""))
	// Definitive success: the login-result line ("...to Steam Public...OK") or the
	// legacy "Logged in OK". A successful login also prints the benign line "Steam
	// Guard code provided." — checking success FIRST keeps that from misfiring.
	if strings.Contains(low, "to steam public...ok") ||
		strings.Contains(low, "logged in ok") {
		return true
	}
	// Otherwise, any of these means the login did not complete.
	for _, bad := range []string{
		"to steam public...failed", "failed login", "login failure",
		"invalid password", "two-factor code mismatch", "rate limit exceeded",
		"account logon denied", "invalid login auth code", "steam guard code:",
		"two_factor", "set_steam_guard", "permission denied", "failed to fetch steamcmd",
	} {
		if strings.Contains(low, bad) {
			return false
		}
	}
	return false
}
