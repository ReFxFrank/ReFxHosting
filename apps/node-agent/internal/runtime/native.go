package runtime

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/refxfrank/refxhosting/node-agent/internal/osabstraction"
	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

// NativeRuntime hosts servers as raw OS processes — the deliberate ReFx
// differentiator over Docker-only panels. Games with kernel-level anti-cheat,
// Windows-only engines, or SteamCMD-driven installs that containerize poorly run
// here while still exposing identical console/stats/lifecycle semantics.
//
// Resource limiting is platform-specific and lives behind build tags:
//   - limits_linux.go   applies cgroups v2 controllers
//   - limits_windows.go applies a Job Object
//
// Both satisfy the limiter interface defined in limits.go.
type NativeRuntime struct {
	log zerolog.Logger
	// steamHome is a node-level directory exported to install scripts as
	// REFX_NODE_STEAM_HOME so the host game-download account's Steam Guard
	// machine-auth persists across servers (once per node). Empty disables it.
	steamHome string

	mu        sync.Mutex
	processes map[string]*nativeProcess // keyed by server id
}

// nativeProcess holds the live state for one running native server.
type nativeProcess struct {
	cmd     *exec.Cmd
	stdin   io.WriteCloser
	logs    *ringBuffer
	limiter limiter // platform resource limiter (cgroup / job object)

	mu          sync.Mutex
	subscribers map[chan []byte]struct{}
	exited      chan struct{}
	netRx       int64
	netTx       int64
}

// NewNativeRuntime constructs the native backend.
func NewNativeRuntime(log zerolog.Logger, steamHome string) *NativeRuntime {
	return &NativeRuntime{
		log:       log.With().Str("runtime", "native").Logger(),
		steamHome: steamHome,
		processes: make(map[string]*nativeProcess),
	}
}

// Name implements Runtime.
func (n *NativeRuntime) Name() string { return "native" }

// Install renders config files and, for SteamCMD-backed templates, prepares the
// game files directly on the host (no throwaway container).
func (n *NativeRuntime) Install(ctx context.Context, s *server.Server) (<-chan InstallProgress, error) {
	ch := make(chan InstallProgress, 64)
	go func() {
		defer close(ch)
		emit := func(line string) { ch <- InstallProgress{Line: line} }

		if err := os.MkdirAll(s.DataDir, 0o750); err != nil {
			ch <- InstallProgress{Err: err}
			return
		}

		emit("==> rendering config files")
		if err := renderConfigFiles(s.DataDir, s); err != nil {
			ch <- InstallProgress{Err: fmt.Errorf("render config: %w", err)}
			return
		}

		if s.Spec.Install.SteamAppID > 0 {
			emit(fmt.Sprintf("==> installing via SteamCMD (app %d)", s.Spec.Install.SteamAppID))
			if err := n.runSteamCMD(ctx, s, ch); err != nil {
				ch <- InstallProgress{Err: err}
				return
			}
		} else if script := strings.TrimSpace(s.Spec.Install.Script); script != "" {
			emit("==> running install script")
			if err := n.runInstallScript(ctx, s, script, ch); err != nil {
				ch <- InstallProgress{Err: err}
				return
			}
		}

		s.MarkInstalled()
		s.SetState(server.StateOffline)
		ch <- InstallProgress{Line: "==> installation complete", Done: true}
	}()
	return ch, nil
}

// runSteamCMD drives the steamcmd binary to install/update a dedicated server.
func (n *NativeRuntime) runSteamCMD(ctx context.Context, s *server.Server, ch chan<- InstallProgress) error {
	steam, err := exec.LookPath(osabstraction.ExecutableName("steamcmd"))
	if err != nil {
		// TODO(impl): bootstrap steamcmd download if not present on the host.
		return fmt.Errorf("native: steamcmd not found on PATH: %w", err)
	}
	args := []string{
		"+force_install_dir", s.DataDir,
		"+login", "anonymous",
		"+app_update", fmt.Sprintf("%d", s.Spec.Install.SteamAppID), "validate",
		"+quit",
	}
	return n.runCommand(ctx, steam, args, s.DataDir, s.Spec.Env, ch)
}

// runInstallScript executes the template install script via the platform shell.
func (n *NativeRuntime) runInstallScript(ctx context.Context, s *server.Server, script string, ch chan<- InstallProgress) error {
	shell, flag := osabstraction.Shell()
	env := s.Spec.Env
	// Node-level Steam home for the host game-download account (once per node).
	if n.steamHome != "" {
		if err := os.MkdirAll(n.steamHome, 0o750); err != nil {
			n.log.Warn().Err(err).Str("dir", n.steamHome).Msg("create steam home failed")
		} else {
			env = make(map[string]string, len(s.Spec.Env)+1)
			for k, v := range s.Spec.Env {
				env[k] = v
			}
			env["REFX_NODE_STEAM_HOME"] = n.steamHome
		}
	}
	return n.runCommand(ctx, shell, []string{flag, script}, s.DataDir, env, ch)
}

// runCommand runs a one-shot command, streaming combined output to ch.
func (n *NativeRuntime) runCommand(ctx context.Context, name string, args []string, dir string, env map[string]string, ch chan<- InstallProgress) error {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), envSlice(env)...)
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("native: start %s: %w", name, err)
	}
	var wg sync.WaitGroup
	scan := func(r io.Reader) {
		defer wg.Done()
		sc := bufio.NewScanner(r)
		sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for sc.Scan() {
			ch <- InstallProgress{Line: sc.Text()}
		}
	}
	wg.Add(2)
	go scan(stdout)
	go scan(stderr)
	wg.Wait()
	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("native: %s exited: %w", name, err)
	}
	return nil
}

// Start launches the server process with resource limits applied via the
// platform limiter, and begins capturing console output.
func (n *NativeRuntime) Start(ctx context.Context, s *server.Server) error {
	n.mu.Lock()
	if _, ok := n.processes[s.ID()]; ok {
		n.mu.Unlock()
		return ErrAlreadyRunning
	}
	n.mu.Unlock()

	s.SetState(server.StateStarting)

	cmdline := renderTemplate(s.Spec.StartupCommand, s.Spec.Env)
	fields := splitArgs(cmdline)
	if len(fields) == 0 {
		s.SetState(server.StateCrashed)
		return errors.New("native: empty startup command")
	}

	cmd := exec.Command(fields[0], fields[1:]...)
	cmd.Dir = s.DataDir
	cmd.Env = append(os.Environ(), envSlice(s.Spec.Env)...)
	osabstraction.SetProcessGroup(cmd) // own process group for clean signalling

	stdin, err := cmd.StdinPipe()
	if err != nil {
		s.SetState(server.StateCrashed)
		return fmt.Errorf("native: stdin pipe: %w", err)
	}
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()

	lim, err := newLimiter(s.ID(), s.Spec.Limits)
	if err != nil {
		n.log.Warn().Err(err).Str("server", s.ID()).Msg("resource limiter unavailable; running unconstrained")
	}

	if err := cmd.Start(); err != nil {
		s.SetState(server.StateCrashed)
		return fmt.Errorf("native: start: %w", err)
	}

	// Apply limits to the started process now that we have a PID.
	if lim != nil {
		if err := lim.Apply(cmd.Process.Pid); err != nil {
			n.log.Warn().Err(err).Str("server", s.ID()).Msg("failed to apply resource limits")
		}
	}

	np := &nativeProcess{
		cmd:         cmd,
		stdin:       stdin,
		logs:        newRingBuffer(512),
		limiter:     lim,
		subscribers: make(map[chan []byte]struct{}),
		exited:      make(chan struct{}),
	}
	s.RuntimeRef = fmt.Sprintf("pid:%d", cmd.Process.Pid)

	n.mu.Lock()
	n.processes[s.ID()] = np
	n.mu.Unlock()

	// Fan out stdout/stderr to subscribers + ring buffer; watch for startup
	// detection and exit.
	go np.pump(stdout, s)
	go np.pump(stderr, s)
	go n.waitExit(np, s)

	s.SetState(server.StateRunning)
	n.log.Info().Str("server", s.ID()).Int("pid", cmd.Process.Pid).Msg("native process started")
	return nil
}

// pump reads lines and distributes them to the ring buffer and subscribers.
func (p *nativeProcess) pump(r io.Reader, s *server.Server) {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	detect := strings.TrimSpace(s.Spec.StartupDetect)
	for sc.Scan() {
		line := append([]byte(nil), sc.Bytes()...)
		p.logs.push(line)
		if detect != "" && strings.Contains(string(line), detect) {
			s.SetState(server.StateRunning)
		}
		p.mu.Lock()
		for ch := range p.subscribers {
			select {
			case ch <- line:
			default: // slow consumer; drop to avoid blocking the process
			}
		}
		p.mu.Unlock()
	}
}

// waitExit reaps the process and updates state.
func (n *NativeRuntime) waitExit(p *nativeProcess, s *server.Server) {
	err := p.cmd.Wait()
	close(p.exited)
	if p.limiter != nil {
		_ = p.limiter.Destroy()
	}
	n.mu.Lock()
	delete(n.processes, s.ID())
	n.mu.Unlock()

	if s.State() == server.StateStopping {
		s.SetState(server.StateOffline)
	} else if err != nil {
		s.SetError(err.Error())
		s.SetState(server.StateCrashed)
		n.log.Warn().Err(err).Str("server", s.ID()).Msg("native process exited unexpectedly")
	} else {
		s.SetState(server.StateOffline)
	}
}

// Stop issues the configured stop command (console line) or a graceful signal,
// then waits up to timeout before returning (caller escalates to Kill).
func (n *NativeRuntime) Stop(ctx context.Context, s *server.Server, timeout time.Duration) error {
	n.mu.Lock()
	p, ok := n.processes[s.ID()]
	n.mu.Unlock()
	if !ok {
		return ErrNotRunning
	}
	s.SetState(server.StateStopping)

	stop := strings.TrimSpace(s.Spec.StopCommand)
	switch {
	case stop == "" || stop == "^C" || strings.HasPrefix(stop, "SIG"):
		sig := osabstraction.SignalInt
		if stop == "" || strings.HasPrefix(stop, "SIGTERM") {
			sig = osabstraction.SignalTerm
		}
		_ = osabstraction.SignalProcess(p.cmd.Process, sig)
	default:
		// Console stop command (e.g. "stop", "quit", "save-all\nstop").
		_, _ = p.stdin.Write([]byte(stop + "\n"))
	}

	select {
	case <-p.exited:
		s.SetState(server.StateOffline)
		return nil
	case <-time.After(timeout):
		return n.Kill(ctx, s)
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Kill terminates the process group immediately.
func (n *NativeRuntime) Kill(_ context.Context, s *server.Server) error {
	n.mu.Lock()
	p, ok := n.processes[s.ID()]
	n.mu.Unlock()
	if !ok {
		return ErrNotRunning
	}
	if err := osabstraction.KillProcessGroup(p.cmd.Process); err != nil {
		_ = p.cmd.Process.Kill()
	}
	s.SetState(server.StateOffline)
	return nil
}

// Restart stops then starts.
func (n *NativeRuntime) Restart(ctx context.Context, s *server.Server, timeout time.Duration) error {
	if err := n.Stop(ctx, s, timeout); err != nil && !errors.Is(err, ErrNotRunning) {
		n.log.Warn().Err(err).Msg("stop during restart failed, continuing")
	}
	// Give the OS a beat to release ports.
	select {
	case <-time.After(500 * time.Millisecond):
	case <-ctx.Done():
		return ctx.Err()
	}
	return n.Start(ctx, s)
}

// AttachConsole subscribes a new channel, priming it with scrollback.
func (n *NativeRuntime) AttachConsole(_ context.Context, s *server.Server) (*Console, error) {
	n.mu.Lock()
	p, ok := n.processes[s.ID()]
	n.mu.Unlock()
	if !ok {
		return nil, ErrNotRunning
	}

	out := make(chan []byte, 256)
	// Prime with scrollback.
	for _, line := range p.logs.snapshot() {
		select {
		case out <- line:
		default:
		}
	}

	p.mu.Lock()
	p.subscribers[out] = struct{}{}
	p.mu.Unlock()

	write := func(b []byte) (int, error) { return p.stdin.Write(b) }
	closeFn := func() error {
		p.mu.Lock()
		delete(p.subscribers, out)
		p.mu.Unlock()
		close(out)
		return nil
	}
	return NewConsole(out, write, closeFn), nil
}

// Stats samples process CPU/memory from the platform limiter or /proc.
func (n *NativeRuntime) Stats(_ context.Context, s *server.Server) (Stats, error) {
	st := Stats{Timestamp: time.Now(), State: s.State(), MemLimitMB: s.Spec.Limits.MemoryMB}
	n.mu.Lock()
	p, ok := n.processes[s.ID()]
	n.mu.Unlock()
	if !ok {
		st.State = server.StateOffline
		st.DiskUsedMB = dirSizeMB(s.DataDir)
		return st, nil
	}
	sample, err := sampleProcess(p.cmd.Process.Pid, p.limiter)
	if err == nil {
		st.CPUPercent = sample.cpuPercent
		st.MemUsedMB = sample.memBytes / (1024 * 1024)
	}
	st.NetRxBytes = p.netRx
	st.NetTxBytes = p.netTx
	st.DiskUsedMB = dirSizeMB(s.DataDir)
	return st, nil
}

// Reconfigure re-applies limits to the running process via the limiter.
func (n *NativeRuntime) Reconfigure(_ context.Context, s *server.Server, lim server.Limits) error {
	n.mu.Lock()
	p, ok := n.processes[s.ID()]
	n.mu.Unlock()
	if !ok || p.limiter == nil {
		return nil // new limits apply at next Start
	}
	return p.limiter.Update(lim)
}

// Destroy stops the process if running; data dir is left intact.
func (n *NativeRuntime) Destroy(ctx context.Context, s *server.Server) error {
	n.mu.Lock()
	_, ok := n.processes[s.ID()]
	n.mu.Unlock()
	if ok {
		_ = n.Kill(ctx, s)
	}
	s.SetState(server.StateOffline)
	return nil
}
