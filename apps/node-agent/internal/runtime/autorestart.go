package runtime

import (
	"sync"
	"time"

	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

// Crash auto-restart: when a server process exits unexpectedly the runtime
// brings it back automatically — unless the panel disabled it for the server
// (env REFX_AUTO_RESTART="false"; absence means ON) or the loop guard trips.
// The guard stops a crash-looping server from burning the node: at most
// maxAutoRestarts within autoRestartWindow, after which the server stays
// CRASHED until a human starts it (which also resets the window naturally as
// the old attempts age out).
const (
	maxAutoRestarts    = 3
	autoRestartWindow  = 10 * time.Minute
	autoRestartDelay   = 3 * time.Second
	autoRestartEnvName = "REFX_AUTO_RESTART"
)

// autoRestartEnabled reports whether the spec opts the server into crash
// auto-restart. Default ON — only an explicit "false" disables it.
func autoRestartEnabled(s *server.Server) bool {
	return s.Spec.Env[autoRestartEnvName] != "false"
}

// restartGuard rate-limits automatic crash restarts per server. The zero value
// is ready to use.
type restartGuard struct {
	mu       sync.Mutex
	attempts map[string][]time.Time
}

// Allow records a restart attempt for the server and reports whether it is
// within budget (maxAutoRestarts per autoRestartWindow).
func (g *restartGuard) Allow(id string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.attempts == nil {
		g.attempts = make(map[string][]time.Time)
	}
	now := time.Now()
	cutoff := now.Add(-autoRestartWindow)
	kept := g.attempts[id][:0]
	for _, t := range g.attempts[id] {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= maxAutoRestarts {
		g.attempts[id] = kept
		return false
	}
	g.attempts[id] = append(kept, now)
	return true
}

// Forget drops a server's attempt history (call when the server is destroyed).
func (g *restartGuard) Forget(id string) {
	g.mu.Lock()
	delete(g.attempts, id)
	g.mu.Unlock()
}
