// Package api exposes the HTTPS control plane the panel calls to drive servers
// on this node: power actions, install/reinstall, reconfigure, file ops, and
// backup ops. Every request is authenticated with the node's HMAC signing key
// (or a panel-issued JWT) before any handler runs.
package api

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/rs/zerolog"

	"github.com/refxfrank/refxhosting/node-agent/internal/backup"
	"github.com/refxfrank/refxhosting/node-agent/internal/runtime"
	"github.com/refxfrank/refxhosting/node-agent/internal/server"
	"github.com/refxfrank/refxhosting/node-agent/internal/ws"
)

// Deps are the collaborators the API handlers operate against.
type Deps struct {
	Logger    zerolog.Logger
	Manager   *runtime.Manager
	Installer *server.Installer
	Backups   *backup.Manager
	Hub       *ws.Hub
	// SigningKey verifies inbound panel request signatures.
	SigningKey string
	// MetricsHandler is the Prometheus handler mounted at /metrics.
	MetricsHandler http.Handler
}

// Server wraps the HTTP server and its router.
type Server struct {
	log    zerolog.Logger
	deps   Deps
	http   *http.Server
	router chi.Router
}

// New builds the API server with all routes and middleware wired.
func New(addr string, tlsCfg *tls.Config, deps Deps) *Server {
	s := &Server{
		log:  deps.Logger.With().Str("component", "api").Logger(),
		deps: deps,
	}
	s.router = s.routes()
	s.http = &http.Server{
		Addr:              addr,
		Handler:           s.router,
		TLSConfig:         tlsCfg,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	return s
}

// routes builds the chi router.
func (s *Server) routes() chi.Router {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)
	r.Use(s.requestLogger)

	// Unauthenticated liveness + metrics.
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	if s.deps.MetricsHandler != nil {
		r.Handle("/metrics", s.deps.MetricsHandler)
	}

	// WebSocket console/stats (auth happens in-band via JWT first frame).
	r.Get("/ws/servers/{id}", func(w http.ResponseWriter, req *http.Request) {
		s.deps.Hub.ServeHTTP(w, req, chi.URLParam(req, "id"))
	})

	// Authenticated control plane.
	r.Group(func(r chi.Router) {
		r.Use(s.authSignature)

		r.Route("/api/v1/servers", func(r chi.Router) {
			r.Post("/", s.handleInstall) // create + install
			r.Route("/{id}", func(r chi.Router) {
				r.Use(s.loadServer)
				r.Get("/", s.handleGetServer)
				r.Delete("/", s.handleDestroy)
				r.Post("/power", s.handlePower)
				r.Post("/reinstall", s.handleReinstall)
				r.Patch("/reconfigure", s.handleReconfigure)

				r.Route("/files", func(r chi.Router) {
					r.Get("/list", s.handleFileList)
					r.Get("/read", s.handleFileRead)
					r.Post("/write", s.handleFileWrite)
					r.Delete("/", s.handleFileDelete)
					r.Post("/compress", s.handleFileCompress)
					r.Post("/extract", s.handleFileExtract)
					r.Post("/chmod", s.handleFileChmod)
				})

				r.Route("/backups", func(r chi.Router) {
					r.Post("/", s.handleBackupCreate)
					r.Post("/{backupId}/restore", s.handleBackupRestore)
					r.Delete("/{backupId}", s.handleBackupDelete)
				})
			})
		})
	})

	return r
}

// Start serves TLS until ctx is cancelled, then gracefully shuts down.
func (s *Server) Start(ctx context.Context) error {
	errCh := make(chan error, 1)
	go func() {
		s.log.Info().Str("addr", s.http.Addr).Msg("control API listening (https)")
		// Certs come from TLSConfig; empty file args are intentional.
		errCh <- s.http.ListenAndServeTLS("", "")
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		return s.http.Shutdown(shutdownCtx)
	case err := <-errCh:
		if err == http.ErrServerClosed {
			return nil
		}
		return err
	}
}

// --- small response helpers ------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
