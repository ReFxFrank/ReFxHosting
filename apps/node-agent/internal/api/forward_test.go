package api

import (
	"context"
	"sync"
	"testing"

	"github.com/rs/zerolog"

	"github.com/refxfrank/refxhosting/node-agent/internal/panel"
	"github.com/refxfrank/refxhosting/node-agent/internal/runtime"
	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

// fakePanel records what the handlers forward, so we can assert on it without a
// live panel HTTP server.
type fakePanel struct {
	mu      sync.Mutex
	logs    []panel.LogLine
	backups []map[string]any
	logErr  error
}

func (f *fakePanel) PushLogs(_ context.Context, lines []panel.LogLine) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.logs = append(f.logs, lines...)
	return f.logErr
}

func (f *fakePanel) BackupProgress(_ context.Context, payload any) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if m, ok := payload.(map[string]any); ok {
		f.backups = append(f.backups, m)
	}
	return nil
}

func (f *fakePanel) PowerEvent(_ context.Context, _, _ string) error {
	return nil
}

func newTestServer(deps Deps) *Server {
	return &Server{log: zerolog.Nop(), deps: deps}
}

func TestForwardInstallPushesToPanel(t *testing.T) {
	fp := &fakePanel{}
	s := newTestServer(Deps{Panel: fp})

	s.forwardInstall("srv-1", "==> installing", false)
	s.forwardInstall("srv-1", "==> complete", true)

	fp.mu.Lock()
	defer fp.mu.Unlock()
	if len(fp.logs) != 2 {
		t.Fatalf("expected 2 forwarded log lines, got %d", len(fp.logs))
	}
	got := fp.logs[0]
	if got.ServerID != "srv-1" || got.Stream != "install" || got.Line != "==> installing" {
		t.Fatalf("unexpected log line: %+v", got)
	}
	if got.At == 0 {
		t.Error("log line timestamp not set")
	}
}

func TestForwardInstallNilPanelIsNoop(t *testing.T) {
	s := newTestServer(Deps{Panel: nil})
	// Must not panic when Panel and Hub are both nil.
	s.forwardInstall("srv-1", "line", false)
}

func TestReportBackupForwardsPayload(t *testing.T) {
	fp := &fakePanel{}
	s := newTestServer(Deps{Panel: fp})

	s.reportBackup(map[string]any{"backupId": "b1", "status": "completed", "sizeBytes": int64(123)})

	fp.mu.Lock()
	defer fp.mu.Unlock()
	if len(fp.backups) != 1 {
		t.Fatalf("expected 1 backup report, got %d", len(fp.backups))
	}
	if fp.backups[0]["status"] != "completed" || fp.backups[0]["backupId"] != "b1" {
		t.Fatalf("unexpected backup payload: %+v", fp.backups[0])
	}
}

// TestManagerRegisterAppliesInstallSpec exercises the path the install handler
// uses: a panel spec is registered onto the Manager and its env/limits land on
// the in-memory server state.
func TestManagerRegisterAppliesInstallSpec(t *testing.T) {
	mgr := runtime.NewManager(runtime.Options{
		Logger:     zerolog.Nop(),
		ServersDir: t.TempDir(),
		Native:     runtime.NewNativeRuntime(zerolog.Nop(), ""),
	})

	dto := panel.ServerInstallSpec{
		ServerID:       "uuid",
		ShortID:        "short",
		DeployMethod:   "NATIVE_PROCESS",
		StartupCommand: "./run",
		Environment:    map[string]string{"FOO": "bar"},
		Limits:         server.Limits{MemoryMB: 512},
	}
	srv := mgr.Register(dto.ToSpec())
	if srv.Spec.Env["FOO"] != "bar" {
		t.Fatalf("env not applied: %+v", srv.Spec.Env)
	}
	if srv.Spec.Limits.MemoryMB != 512 {
		t.Fatalf("limits not applied: %+v", srv.Spec.Limits)
	}
	if srv.DataDir == "" {
		t.Fatal("data dir not assigned by manager")
	}

	// Re-registering with merged env must update the existing server in place.
	dto.Environment = map[string]string{"FOO": "baz", "EXTRA": "1"}
	srv2 := mgr.Register(dto.ToSpec())
	if srv2 != srv {
		t.Fatal("re-register should return the same *server.Server instance")
	}
	if srv.Spec.Env["FOO"] != "baz" || srv.Spec.Env["EXTRA"] != "1" {
		t.Fatalf("spec not updated on re-register: %+v", srv.Spec.Env)
	}
}
