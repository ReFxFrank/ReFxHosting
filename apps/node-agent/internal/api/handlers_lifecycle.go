package api

import (
	"encoding/json"
	"net/http"

	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

// handleInstall registers a server from a panel-supplied spec and kicks off the
// install in the background, streaming progress over the WebSocket.
func (s *Server) handleInstall(w http.ResponseWriter, r *http.Request) {
	var spec server.Spec
	if err := json.NewDecoder(r.Body).Decode(&spec); err != nil {
		writeError(w, http.StatusBadRequest, "invalid spec: "+err.Error())
		return
	}
	if spec.ID == "" || spec.ShortID == "" {
		writeError(w, http.StatusBadRequest, "id and shortId are required")
		return
	}

	srv := s.deps.Manager.Register(spec)
	if err := s.deps.Installer.Prepare(srv); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	go s.runInstall(srv)
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "installing", "id": srv.ID()})
}

// handleReinstall wipes (optionally) and re-runs the install for an existing
// server. The query param wipe=true requests a clean reinstall.
func (s *Server) handleReinstall(w http.ResponseWriter, r *http.Request) {
	srv := serverFrom(r.Context())
	srv.SetState(server.StateReinstalling)
	if r.URL.Query().Get("wipe") == "true" {
		if err := s.deps.Installer.Wipe(r.Context(), srv); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	go s.runInstall(srv)
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "reinstalling"})
}

// runInstall drives the runtime installer, forwarding progress lines.
func (s *Server) runInstall(srv *server.Server) {
	ctx := contextForServer()
	progress, err := s.deps.Manager.Install(ctx, srv)
	if err != nil {
		srv.SetError(err.Error())
		srv.SetState(server.StateCrashed)
		s.log.Error().Err(err).Str("server", srv.ID()).Msg("install failed to start")
		return
	}
	for p := range progress {
		if p.Err != nil {
			srv.SetError(p.Err.Error())
			srv.SetState(server.StateCrashed)
			s.log.Error().Err(p.Err).Str("server", srv.ID()).Msg("install error")
			// TODO(impl): forward install error to panel via panel.Client.PushLogs.
			return
		}
		if p.Line != "" {
			s.log.Debug().Str("server", srv.ID()).Msg(p.Line)
			// TODO(impl): broadcast install lines over the ws hub + push to panel.
		}
	}
}

// powerRequest is the body of a power action.
type powerRequest struct {
	Action  string `json:"action"`  // start|stop|restart|kill
	Timeout int    `json:"timeout"` // seconds for graceful stop
}

// handlePower performs a power action on a server.
func (s *Server) handlePower(w http.ResponseWriter, r *http.Request) {
	srv := serverFrom(r.Context())
	var req powerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	ctx := r.Context()
	var err error
	switch req.Action {
	case "start":
		err = s.deps.Manager.Start(ctx, srv)
	case "stop":
		err = s.deps.Manager.Stop(ctx, srv, req.Timeout)
	case "restart":
		err = s.deps.Manager.Restart(ctx, srv, req.Timeout)
	case "kill":
		err = s.deps.Manager.Kill(ctx, srv)
	default:
		writeError(w, http.StatusBadRequest, "unknown action")
		return
	}
	if err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"state": string(srv.State())})
}

// handleReconfigure applies new resource limits.
func (s *Server) handleReconfigure(w http.ResponseWriter, r *http.Request) {
	srv := serverFrom(r.Context())
	var limits server.Limits
	if err := json.NewDecoder(r.Body).Decode(&limits); err != nil {
		writeError(w, http.StatusBadRequest, "invalid limits")
		return
	}
	if err := s.deps.Manager.Reconfigure(r.Context(), srv, limits); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "reconfigured"})
}

// handleGetServer returns the current state of a server.
func (s *Server) handleGetServer(w http.ResponseWriter, r *http.Request) {
	srv := serverFrom(r.Context())
	rt, _ := s.deps.Manager.RuntimeFor(srv)
	runtimeName := ""
	if rt != nil {
		runtimeName = rt.Name()
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id":           srv.ID(),
		"shortId":      srv.Spec.ShortID,
		"state":        srv.State(),
		"deployMethod": srv.Spec.DeployMethod,
		"runtime":      runtimeName,
		"uptime":       srv.Uptime().String(),
		"lastError":    srv.LastError(),
	})
}

// handleDestroy tears down runtime artifacts (data dir is preserved).
func (s *Server) handleDestroy(w http.ResponseWriter, r *http.Request) {
	srv := serverFrom(r.Context())
	if err := s.deps.Manager.Destroy(r.Context(), srv); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "destroyed"})
}
