package api

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"time"
)

// updateRepo is the GitHub repo whose latest release the agent self-updates from.
const updateRepo = "refxfrank/refxhosting"

// updateHTTP downloads the (~tens of MB) agent binary with a generous timeout.
var updateHTTP = &http.Client{Timeout: 5 * time.Minute}

// handleSteamCacheClear wipes the node-level steamcmd home (all cached account
// sessions/sentry files), then recreates it empty. Used by the panel's admin
// "clear Steam cache" action so a deauthorised/old account leaves no cached
// session on the node. The next install re-authenticates the current account
// (a one-time Steam Guard code may be required again).
func (s *Server) handleSteamCacheClear(w http.ResponseWriter, _ *http.Request) {
	dir := s.deps.SteamHomeDir
	if dir == "" {
		writeError(w, http.StatusNotImplemented, "no steam home configured on this node")
		return
	}
	if err := os.RemoveAll(dir); err != nil {
		writeError(w, http.StatusInternalServerError, "clear steam cache: "+err.Error())
		return
	}
	if err := os.MkdirAll(dir, 0o750); err != nil {
		writeError(w, http.StatusInternalServerError, "recreate steam home: "+err.Error())
		return
	}
	s.log.Info().Str("dir", dir).Msg("cleared node steam cache (panel request)")
	writeJSON(w, http.StatusOK, map[string]string{"status": "cleared"})
}

// handleSteamLogin authenticates the node's game-download Steam account on demand
// and caches its machine-auth (sentry), so owned-game installs (Arma 3, DayZ, …)
// need no further Steam Guard code. It pre-warms steamcmd then logs in once, while
// the panel-supplied (short-lived) Guard code is still fresh. Returns whether the
// login succeeded plus a tail of steamcmd's output for the admin UI.
func (s *Server) handleSteamLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Guard    string `json:"guard"`
		Image    string `json:"image"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req)
	}
	if strings.TrimSpace(req.Username) == "" || strings.TrimSpace(req.Password) == "" {
		writeError(w, http.StatusBadRequest, "steam username and password are required")
		return
	}
	out, ok, err := s.deps.Manager.RunSteamLogin(
		r.Context(), req.Image, req.Username, req.Password, req.Guard,
	)
	if err != nil {
		writeError(w, http.StatusBadGateway, "steam login: "+err.Error())
		return
	}
	tail := out
	if len(tail) > 4000 { // return only the relevant tail of the steamcmd log
		tail = "…" + tail[len(tail)-4000:]
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": ok, "output": tail})
}

// handleAgentRestart restarts the agent in place at the panel's request. It
// responds first, then re-executes the same binary (see reExecAgent) after a
// short delay so the HTTP reply flushes. Running game-server containers are
// untouched and get re-adopted when the fresh process boots, so this is a
// non-disruptive "reconnect/reload" rather than a host reboot.
func (s *Server) handleAgentRestart(w http.ResponseWriter, _ *http.Request) {
	if !agentRestartSupported {
		writeError(w, http.StatusNotImplemented,
			"agent self-restart is not supported on this platform")
		return
	}

	s.log.Info().Msg("panel requested agent restart; re-executing shortly")
	writeJSON(w, http.StatusOK, map[string]string{"status": "restarting"})
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	go func() {
		// Give the response time to reach the panel before we replace the process.
		time.Sleep(750 * time.Millisecond)
		if err := reExecAgent(); err != nil {
			s.log.Error().Err(err).Msg("agent re-exec failed")
		}
	}()
}

// handleAgentUpdate self-updates the agent to the latest published release: it
// downloads the prebuilt binary for this OS/arch, verifies its SHA-256, swaps
// it in over the running binary (atomic rename — Linux keeps the live process's
// old inode, the new file takes the path), then re-execs. Running game-server
// containers are untouched and re-adopted by the fresh process. No SSH needed.
//
// A private repo's release assets aren't downloadable anonymously, so the panel
// passes a read-only GitHub token in the request body; the agent uses it via the
// API to locate + download the asset, and never persists it.
func (s *Server) handleAgentUpdate(w http.ResponseWriter, r *http.Request) {
	if !agentRestartSupported {
		writeError(w, http.StatusNotImplemented, "agent self-update is not supported on this platform")
		return
	}
	self, err := os.Executable()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "locate agent binary: "+err.Error())
		return
	}

	var req struct {
		GithubToken string `json:"githubToken"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req)
	}
	token := strings.TrimSpace(req.GithubToken)

	asset := fmt.Sprintf("refx-agent-%s-%s", goruntime.GOOS, goruntime.GOARCH)
	if goruntime.GOOS == "windows" {
		asset += ".exe"
	}
	binURL, sumURL, err := resolveAgentAsset(asset, token)
	if err != nil {
		writeError(w, http.StatusBadGateway, "resolve release: "+err.Error())
		return
	}

	tmp := filepath.Join(filepath.Dir(self), ".refx-agent.update")
	if err := downloadTo(binURL, tmp, token); err != nil {
		writeError(w, http.StatusBadGateway, "download agent: "+err.Error())
		return
	}
	// Verify checksum (published alongside the binary as <asset>.sha256).
	if sumURL != "" {
		if want, e := httpGetText(sumURL, token); e == nil {
			fields := strings.Fields(want)
			got, herr := sha256File(tmp)
			if len(fields) == 0 || herr != nil || !strings.EqualFold(fields[0], got) {
				_ = os.Remove(tmp)
				writeError(w, http.StatusBadGateway, "agent checksum verification failed")
				return
			}
		}
	}
	if err := os.Chmod(tmp, 0o755); err != nil {
		_ = os.Remove(tmp)
		writeError(w, http.StatusInternalServerError, "chmod: "+err.Error())
		return
	}
	if goruntime.GOOS == "windows" {
		// A running .exe is locked on Windows: you can't overwrite it, but you can
		// rename it. Move the live binary aside, then drop the new one in its place;
		// the old file is freed once this process exits on re-exec.
		old := self + ".old"
		_ = os.Remove(old) // clear a leftover from a previous update (now unlocked)
		if err := os.Rename(self, old); err != nil {
			_ = os.Remove(tmp)
			writeError(w, http.StatusInternalServerError, "move running binary: "+err.Error())
			return
		}
		if err := os.Rename(tmp, self); err != nil {
			_ = os.Rename(old, self) // roll back
			writeError(w, http.StatusInternalServerError, "swap binary: "+err.Error())
			return
		}
	} else if err := os.Rename(tmp, self); err != nil {
		_ = os.Remove(tmp)
		writeError(w, http.StatusInternalServerError, "swap binary: "+err.Error())
		return
	}

	s.log.Info().Str("binary", self).Msg("agent updated to latest release; re-executing")
	writeJSON(w, http.StatusOK, map[string]string{"status": "updating"})
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	go func() {
		time.Sleep(750 * time.Millisecond)
		if err := reExecAgent(); err != nil {
			s.log.Error().Err(err).Msg("re-exec after update failed")
		}
	}()
}

// resolveAgentAsset returns the download URL for the agent binary + its .sha256.
// Without a token it uses the public latest-download URLs; with a token it queries
// the GitHub API for the (private) release's asset API URLs.
func resolveAgentAsset(asset, token string) (binURL, sumURL string, err error) {
	if token == "" {
		base := "https://github.com/" + updateRepo + "/releases/latest/download/" + asset
		return base, base + ".sha256", nil
	}
	var rel struct {
		Assets []struct {
			Name string `json:"name"`
			URL  string `json:"url"`
		} `json:"assets"`
	}
	if err := apiGetJSON(
		"https://api.github.com/repos/"+updateRepo+"/releases/latest", token, &rel,
	); err != nil {
		return "", "", err
	}
	for _, a := range rel.Assets {
		switch a.Name {
		case asset:
			binURL = a.URL
		case asset + ".sha256":
			sumURL = a.URL
		}
	}
	if binURL == "" {
		return "", "", fmt.Errorf("asset %q not found in latest release", asset)
	}
	return binURL, sumURL, nil
}

func apiGetJSON(url, token string, v any) error {
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "refx-agent")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := updateHTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s -> %s", url, resp.Status)
	}
	return json.NewDecoder(resp.Body).Decode(v)
}

// downloadTo fetches url to path. With a token the URL is a GitHub API asset URL,
// which needs Accept: application/octet-stream + auth (Go drops the auth header on
// the cross-host redirect to the signed storage URL, so the token isn't leaked).
func downloadTo(url, path, token string) error {
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("User-Agent", "refx-agent")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Accept", "application/octet-stream")
	}
	resp, err := updateHTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s -> %s", url, resp.Status)
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, resp.Body)
	return err
}

func httpGetText(url, token string) (string, error) {
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("User-Agent", "refx-agent")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Accept", "application/octet-stream")
	}
	resp, err := updateHTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("%s -> %s", url, resp.Status)
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	return string(b), err
}

func sha256File(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
