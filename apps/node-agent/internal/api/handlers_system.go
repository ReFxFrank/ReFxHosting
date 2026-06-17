package api

import (
	"net/http"
	"os"
	"time"
)

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
