package api

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/refxfrank/refxhosting/node-agent/internal/panel"
	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

// ctxKey is the private context key type for request-scoped values.
type ctxKey int

const serverCtxKey ctxKey = iota

// requestLogger logs each request with method, path, status, and latency.
func (s *Server) requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		s.log.Info().
			Str("method", r.Method).
			Str("path", r.URL.Path).
			Int("status", ww.Status()).
			Dur("latency", time.Since(start)).
			Msg("request")
	})
}

// authSignature verifies the panel's HMAC signature on every control request.
// It reads and restores the body so handlers can still consume it.
func (s *Server) authSignature(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ts := r.Header.Get("X-Refx-Timestamp")
		sig := r.Header.Get("X-Refx-Signature")
		if ts == "" || sig == "" {
			writeError(w, http.StatusUnauthorized, "missing signature headers")
			return
		}

		var body []byte
		if r.Body != nil {
			b, err := io.ReadAll(io.LimitReader(r.Body, 32<<20)) // 32 MiB cap
			if err != nil {
				writeError(w, http.StatusBadRequest, "cannot read body")
				return
			}
			body = b
			r.Body = io.NopCloser(bytes.NewReader(b))
		}

		// Accept EITHER canonical path form, so a panel can transition to signing
		// the query string without a flag day:
		//   - legacy: r.URL.Path           (query NOT covered by the signature)
		//   - current: path + "?" + query  (query IS covered — path/mode/wipe params)
		// An attacker still can't forge either form without the per-node key, and a
		// query-signed request whose query is tampered fails both checks.
		pathOnly := r.URL.Path
		withQuery := pathOnly
		if r.URL.RawQuery != "" {
			withQuery = pathOnly + "?" + r.URL.RawQuery
		}
		if !panel.Verify(s.deps.SigningKey, r.Method, withQuery, ts, sig, body) &&
			!panel.Verify(s.deps.SigningKey, r.Method, pathOnly, ts, sig, body) {
			writeError(w, http.StatusUnauthorized, "invalid signature")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// loadServer resolves {id} into a *server.Server and stores it on the context.
func (s *Server) loadServer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		srv, ok := s.deps.Manager.Get(id)
		if !ok {
			writeError(w, http.StatusNotFound, "unknown server")
			return
		}
		ctx := context.WithValue(r.Context(), serverCtxKey, srv)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// serverFrom extracts the loaded server from the request context.
func serverFrom(ctx context.Context) *server.Server {
	s, _ := ctx.Value(serverCtxKey).(*server.Server)
	return s
}
