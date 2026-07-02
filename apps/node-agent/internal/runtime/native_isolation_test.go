package runtime

import (
	"testing"

	"github.com/rs/zerolog"
)

// Isolation must be OFF by default (uid/gid 0) and prepareIsolation a no-op then.
func TestNativeIsolationDisabledByDefault(t *testing.T) {
	rt := NewNativeRuntime(zerolog.Nop(), "", 0, 0)
	if rt.isolated() {
		t.Fatal("isolation should be disabled when run_as_uid/gid are 0")
	}
	// No-op path must not error or touch the (non-existent) dir.
	if err := rt.prepareIsolation("/nonexistent/should/not/matter"); err != nil {
		t.Fatalf("prepareIsolation should be a no-op when disabled, got %v", err)
	}
}

// A partial config (only one of uid/gid) must NOT enable isolation — both are
// required, so we never drop to gid 0 (root group) or an unset uid.
func TestNativeIsolationRequiresBothIDs(t *testing.T) {
	if NewNativeRuntime(zerolog.Nop(), "", 1000, 0).isolated() {
		t.Error("isolation must require BOTH uid and gid (gid 0 given)")
	}
	if NewNativeRuntime(zerolog.Nop(), "", 0, 1000).isolated() {
		t.Error("isolation must require BOTH uid and gid (uid 0 given)")
	}
}
