package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

// handleProxyAddSite maps a domain to a local web-app upstream in the node's
// Caddy reverse proxy. Caddy issues + renews TLS for the domain automatically.
// Body: {"domain":"site.example.com","upstream":"localhost:25591"}.
func (s *Server) handleProxyAddSite(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Domain   string `json:"domain"`
		Upstream string `json:"upstream"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req)
	}
	req.Domain = strings.TrimSpace(strings.ToLower(req.Domain))
	req.Upstream = strings.TrimSpace(req.Upstream)
	if req.Domain == "" || req.Upstream == "" {
		writeError(w, http.StatusBadRequest, "domain and upstream are required")
		return
	}
	if err := s.proxy.AddSite(r.Context(), req.Domain, req.Upstream); err != nil {
		writeError(w, http.StatusBadGateway, "proxy add site: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "domain": req.Domain})
}

// handleProxyRemoveSite drops a domain's route from Caddy (idempotent).
func (s *Server) handleProxyRemoveSite(w http.ResponseWriter, r *http.Request) {
	domain := strings.TrimSpace(strings.ToLower(chi.URLParam(r, "domain")))
	if domain == "" {
		writeError(w, http.StatusBadRequest, "domain is required")
		return
	}
	if err := s.proxy.RemoveSite(r.Context(), domain); err != nil {
		writeError(w, http.StatusBadGateway, "proxy remove site: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "domain": domain})
}
