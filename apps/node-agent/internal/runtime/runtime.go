// Package runtime defines the Runtime abstraction that is the heart of the ReFx
// node agent's original design.
//
// Unlike Pterodactyl Wings — which is hard-wired to Docker — ReFx hosts game
// servers behind a single Runtime interface with multiple interchangeable
// backends:
//
//   - DockerRuntime          containers via the Docker Engine SDK (Linux, preferred)
//   - NativeRuntime          raw OS processes with cgroups v2 / Job Object limits
//   - WindowsContainerRuntime Windows process-isolated / Hyper-V containers (skeleton)
//
// The Manager selects a backend per-server from the panel-supplied DeployMethod,
// so the same binary can run Docker workloads and bare-process workloads side by
// side, on Linux or Windows. Native hosting is the deliberate differentiator:
// games that containerize poorly (anti-cheat, kernel drivers, Windows-only
// engines) run directly on the host while still exposing identical console,
// stats, and lifecycle semantics to the panel.
package runtime

import (
	"context"
	"errors"
	"io"
	"time"

	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

// ErrNotImplemented is returned by backends for capabilities they cannot offer
// on the current platform (e.g. Windows containers on Linux).
var ErrNotImplemented = errors.New("runtime: not implemented on this platform")

// ErrAlreadyRunning / ErrNotRunning describe lifecycle precondition failures.
var (
	ErrAlreadyRunning = errors.New("runtime: server already running")
	ErrNotRunning     = errors.New("runtime: server not running")
)

// Stats is a point-in-time resource sample for a single server. Values are
// normalized across backends so the panel never needs to know which runtime
// produced them.
type Stats struct {
	Timestamp time.Time `json:"timestamp"`
	// CPUPercent is total CPU usage as a percentage of one core (may exceed 100
	// on multi-core servers).
	CPUPercent float64 `json:"cpuPercent"`
	MemUsedMB  int64   `json:"memUsedMb"`
	MemLimitMB int64   `json:"memLimitMb"`
	DiskUsedMB int64   `json:"diskUsedMb"`
	NetRxBytes int64   `json:"netRxBytes"`
	NetTxBytes int64   `json:"netTxBytes"`
	// State is the runtime's view of liveness, used to reconcile after restarts.
	State server.State `json:"state"`
}

// Console is a bidirectional console attachment. Output streams the merged
// stdout/stderr of the server; Input writes to the server's stdin. Closing the
// Console detaches without stopping the server.
type Console struct {
	// Output delivers raw console lines/chunks as they are produced.
	Output <-chan []byte
	// write sends a line to the process stdin.
	write func(p []byte) (int, error)
	// closeFn detaches the console.
	closeFn func() error
}

// NewConsole wires a Console from backend-provided primitives.
func NewConsole(out <-chan []byte, write func([]byte) (int, error), closeFn func() error) *Console {
	return &Console{Output: out, write: write, closeFn: closeFn}
}

// Write implements io.Writer, sending bytes to the server's stdin.
func (c *Console) Write(p []byte) (int, error) {
	if c.write == nil {
		return 0, ErrNotImplemented
	}
	return c.write(p)
}

// Close detaches the console.
func (c *Console) Close() error {
	if c.closeFn == nil {
		return nil
	}
	return c.closeFn()
}

var _ io.WriteCloser = (*Console)(nil)

// InstallProgress is streamed back to the caller during Install so the panel can
// surface live installation logs.
type InstallProgress struct {
	Line string
	Done bool
	Err  error
}

// Runtime is the common contract every backend implements. All methods take a
// context for cancellation/timeout and operate on a *server.Server whose Spec
// carries the deploy method, image, limits, env, and allocations.
type Runtime interface {
	// Name identifies the backend ("docker", "native", "windows-container").
	Name() string

	// Install materialises the server: pulls images / runs the install script,
	// renders config files, and prepares the data directory. Progress lines are
	// emitted on the returned channel which is closed when installation ends.
	Install(ctx context.Context, s *server.Server) (<-chan InstallProgress, error)

	// Start boots the server process/container.
	Start(ctx context.Context, s *server.Server) error
	// Stop requests a graceful shutdown (stop command / signal) and waits up to
	// timeout before the caller should escalate to Kill.
	Stop(ctx context.Context, s *server.Server, timeout time.Duration) error
	// Kill forcibly terminates the server immediately.
	Kill(ctx context.Context, s *server.Server) error
	// Restart performs Stop followed by Start.
	Restart(ctx context.Context, s *server.Server, timeout time.Duration) error

	// AttachConsole returns a live console for streaming output and sending
	// input. The caller owns closing the returned Console.
	AttachConsole(ctx context.Context, s *server.Server) (*Console, error)

	// Stats samples current resource usage.
	Stats(ctx context.Context, s *server.Server) (Stats, error)

	// Reconfigure applies updated resource limits to a (possibly running)
	// server without reinstalling it.
	Reconfigure(ctx context.Context, s *server.Server, limits server.Limits) error

	// Destroy removes all runtime artifacts (container, process group, cgroup,
	// job object). It does NOT delete the data directory.
	Destroy(ctx context.Context, s *server.Server) error
}
