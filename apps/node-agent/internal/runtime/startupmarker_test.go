package runtime

import (
	"testing"

	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

// startupMarker decides whether a Docker server holds in STARTING until a ready
// line appears (non-empty marker) or goes RUNNING immediately (empty). It prefers
// the egg's StartupDetect and falls back to the per-server READY_LINE variable.
func TestStartupMarker(t *testing.T) {
	cases := []struct {
		name   string
		detect string
		env    map[string]string
		want   string
	}{
		{"none -> immediate running", "", nil, ""},
		{"egg detect wins", "Done (", map[string]string{"READY_LINE": "ignored"}, "Done ("},
		{"falls back to READY_LINE var", "", map[string]string{"READY_LINE": "Logged in as"}, "Logged in as"},
		{"trims whitespace", "  Ready!  ", nil, "Ready!"},
		{"blank READY_LINE -> immediate", "", map[string]string{"READY_LINE": "   "}, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := startupMarker(server.Spec{StartupDetect: c.detect, Env: c.env})
			if got != c.want {
				t.Fatalf("startupMarker(detect=%q, env=%v) = %q, want %q", c.detect, c.env, got, c.want)
			}
		})
	}
}
