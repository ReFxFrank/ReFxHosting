package runtime

import (
	"testing"

	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

func TestAutoRestartEnabled(t *testing.T) {
	s := &server.Server{Spec: server.Spec{Env: map[string]string{}}}
	if !autoRestartEnabled(s) {
		t.Fatal("default (unset) should be enabled")
	}
	s.Spec.Env[autoRestartEnvName] = "true"
	if !autoRestartEnabled(s) {
		t.Fatal("explicit true should be enabled")
	}
	s.Spec.Env[autoRestartEnvName] = "false"
	if autoRestartEnabled(s) {
		t.Fatal("explicit false should be disabled")
	}
}

func TestRestartGuard(t *testing.T) {
	var g restartGuard
	// The budget allows maxAutoRestarts attempts within the window…
	for i := 0; i < maxAutoRestarts; i++ {
		if !g.Allow("srv-1") {
			t.Fatalf("attempt %d should be allowed", i+1)
		}
	}
	// …then trips.
	if g.Allow("srv-1") {
		t.Fatal("attempt over budget should be denied")
	}
	// Independent per server.
	if !g.Allow("srv-2") {
		t.Fatal("another server should have its own budget")
	}
	// Forget resets the budget.
	g.Forget("srv-1")
	if !g.Allow("srv-1") {
		t.Fatal("after Forget the budget should reset")
	}
}
