package api

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/refxfrank/refxhosting/node-agent/internal/panel"
)

// signedRequest builds a request delivered to `target` but with a signature
// computed over `signPath` (lets us simulate legacy path-only vs query-covered
// signing, and query tampering).
func signedRequest(key, method, target, signPath string) *http.Request {
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	sig := panel.Sign(key, method, signPath, ts, nil)
	req := httptest.NewRequest(method, target, nil)
	req.Header.Set("X-Refx-Timestamp", ts)
	req.Header.Set("X-Refx-Signature", sig)
	return req
}

func serveAuth(s *Server, req *http.Request) int {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	rec := httptest.NewRecorder()
	s.authSignature(next).ServeHTTP(rec, req)
	return rec.Code
}

// The agent accepts BOTH the legacy path-only canonical and the new path+query
// canonical, so the panel can start signing the query without a flag day.
func TestAuthSignatureAcceptsLegacyAndQueryForms(t *testing.T) {
	key := "node-signing-key"
	s := newTestServer(Deps{SigningKey: key})
	target := "/api/v1/servers/abc/files/write?path=%2Ffoo"
	pathOnly := "/api/v1/servers/abc/files/write"

	if code := serveAuth(s, signedRequest(key, "POST", target, pathOnly)); code != http.StatusOK {
		t.Errorf("legacy path-only signature rejected: %d", code)
	}
	if code := serveAuth(s, signedRequest(key, "POST", target, pathOnly+"?path=%2Ffoo")); code != http.StatusOK {
		t.Errorf("query-covered signature rejected: %d", code)
	}
}

// Once the panel signs the query, tampering it must fail BOTH canonical checks.
func TestAuthSignatureRejectsTamperedQuery(t *testing.T) {
	key := "node-signing-key"
	s := newTestServer(Deps{SigningKey: key})
	signPath := "/api/v1/servers/abc/files/write?path=%2Ffoo"
	tampered := "/api/v1/servers/abc/files/write?path=%2Fetc%2Fpasswd"

	if code := serveAuth(s, signedRequest(key, "POST", tampered, signPath)); code == http.StatusOK {
		t.Error("tampered query accepted (query-covered signature should not match)")
	}
}
