package api

import (
	"net/http"
	"time"
)

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
