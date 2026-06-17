package api

import (
	"crypto/sha256"
	"encoding/hex"
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
func (s *Server) handleAgentUpdate(w http.ResponseWriter, _ *http.Request) {
	if !agentRestartSupported {
		writeError(w, http.StatusNotImplemented, "agent self-update is not supported on this platform")
		return
	}
	self, err := os.Executable()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "locate agent binary: "+err.Error())
		return
	}

	asset := fmt.Sprintf("refx-agent-%s-%s", goruntime.GOOS, goruntime.GOARCH)
	if goruntime.GOOS == "windows" {
		asset += ".exe"
	}
	url := "https://github.com/" + updateRepo + "/releases/latest/download/" + asset

	tmp := filepath.Join(filepath.Dir(self), ".refx-agent.update")
	if err := downloadTo(url, tmp); err != nil {
		writeError(w, http.StatusBadGateway, "download agent: "+err.Error())
		return
	}
	// Verify checksum (published alongside the binary as <asset>.sha256).
	if want, e := httpGetText(url + ".sha256"); e == nil {
		fields := strings.Fields(want)
		got, herr := sha256File(tmp)
		if len(fields) == 0 || herr != nil || !strings.EqualFold(fields[0], got) {
			_ = os.Remove(tmp)
			writeError(w, http.StatusBadGateway, "agent checksum verification failed")
			return
		}
	}
	if err := os.Chmod(tmp, 0o755); err != nil {
		_ = os.Remove(tmp)
		writeError(w, http.StatusInternalServerError, "chmod: "+err.Error())
		return
	}
	if err := os.Rename(tmp, self); err != nil {
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

func downloadTo(url, path string) error {
	resp, err := updateHTTP.Get(url)
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

func httpGetText(url string) (string, error) {
	resp, err := updateHTTP.Get(url)
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
