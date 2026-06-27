package runtime

import (
	"context"
	"fmt"
	"path/filepath"
	"sync"

	"github.com/rs/zerolog"

	"github.com/refxfrank/refxhosting/node-agent/internal/osabstraction"
	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

// Manager tracks every server hosted on this node and routes lifecycle calls to
// the correct Runtime backend based on the server's deploy method. It is the
// single entry point the API/WS/stats layers use; they never touch a concrete
// backend directly.
type Manager struct {
	log        zerolog.Logger
	serversDir string

	mu       sync.RWMutex
	servers  map[string]*server.Server
	backends map[server.DeployMethod]Runtime
	caps     osabstraction.Capabilities
}

// Options configure a Manager.
type Options struct {
	Logger     zerolog.Logger
	ServersDir string
	// Docker is the configured Docker runtime (may be nil if unavailable).
	Docker Runtime
	// Native is the platform-appropriate native runtime.
	Native Runtime
	// WindowsContainer is the (skeleton) Windows container runtime.
	WindowsContainer Runtime
}

// NewManager wires backends to deploy methods.
func NewManager(opts Options) *Manager {
	m := &Manager{
		log:        opts.Logger.With().Str("component", "runtime-manager").Logger(),
		serversDir: opts.ServersDir,
		servers:    make(map[string]*server.Server),
		backends:   make(map[server.DeployMethod]Runtime),
		caps:       osabstraction.DetectCapabilities(),
	}
	if opts.Docker != nil {
		m.backends[server.DeployDocker] = opts.Docker
	}
	if opts.Native != nil {
		m.backends[server.DeployNativeProcess] = opts.Native
		// Sandbox falls back to native semantics until a dedicated backend lands.
		m.backends[server.DeploySandbox] = opts.Native
	}
	if opts.WindowsContainer != nil {
		m.backends[server.DeployWindowsContainer] = opts.WindowsContainer
	}
	return m
}

// DataDirFor returns the on-disk data directory for a server short id.
func (m *Manager) DataDirFor(shortID string) string {
	return filepath.Join(m.serversDir, shortID)
}

// backendFor resolves the Runtime for a deploy method, with sensible fallbacks
// so a misconfigured node still does something reasonable.
func (m *Manager) backendFor(method server.DeployMethod) (Runtime, error) {
	if rt, ok := m.backends[method]; ok {
		return rt, nil
	}
	// Fall back: prefer Docker, then native.
	if rt, ok := m.backends[server.DeployDocker]; ok {
		m.log.Warn().Str("requested", string(method)).Msg("deploy method unavailable, falling back to docker")
		return rt, nil
	}
	if rt, ok := m.backends[server.DeployNativeProcess]; ok {
		m.log.Warn().Str("requested", string(method)).Msg("deploy method unavailable, falling back to native")
		return rt, nil
	}
	return nil, fmt.Errorf("no runtime backend available for deploy method %q", method)
}

// RuntimeFor returns the backend that hosts the given server.
func (m *Manager) RuntimeFor(s *server.Server) (Runtime, error) {
	return m.backendFor(s.Spec.DeployMethod)
}

// Register adds or replaces a server in the tracking map, creating its in-memory
// state. It does not start or install it.
func (m *Manager) Register(spec server.Spec) *server.Server {
	m.mu.Lock()
	defer m.mu.Unlock()
	if existing, ok := m.servers[spec.ID]; ok {
		existing.UpdateSpec(spec)
		return existing
	}
	s := server.New(spec, m.DataDirFor(spec.ShortID))
	m.servers[spec.ID] = s
	m.log.Info().Str("server", spec.ID).Str("deploy", string(spec.DeployMethod)).Msg("registered server")
	return s
}

// Get returns a tracked server by id.
func (m *Manager) Get(id string) (*server.Server, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.servers[id]
	return s, ok
}

// List returns all tracked servers.
func (m *Manager) List() []*server.Server {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]*server.Server, 0, len(m.servers))
	for _, s := range m.servers {
		out = append(out, s)
	}
	return out
}

// Remove drops a server from tracking after its runtime artifacts are destroyed.
func (m *Manager) Remove(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.servers, id)
}

// --- Lifecycle convenience wrappers used by the API/WS layers ---------------

// Install routes to the backend's Install.
func (m *Manager) Install(ctx context.Context, s *server.Server) (<-chan InstallProgress, error) {
	rt, err := m.RuntimeFor(s)
	if err != nil {
		return nil, err
	}
	s.SetState(server.StateInstalling)
	return rt.Install(ctx, s)
}

// Start routes to the backend's Start.
func (m *Manager) Start(ctx context.Context, s *server.Server) error {
	rt, err := m.RuntimeFor(s)
	if err != nil {
		return err
	}
	return rt.Start(ctx, s)
}

// Stop routes to the backend's Stop.
func (m *Manager) Stop(ctx context.Context, s *server.Server, timeoutSeconds int) error {
	rt, err := m.RuntimeFor(s)
	if err != nil {
		return err
	}
	return rt.Stop(ctx, s, secondsDur(timeoutSeconds, 30))
}

// Kill routes to the backend's Kill.
func (m *Manager) Kill(ctx context.Context, s *server.Server) error {
	rt, err := m.RuntimeFor(s)
	if err != nil {
		return err
	}
	return rt.Kill(ctx, s)
}

// Restart routes to the backend's Restart.
func (m *Manager) Restart(ctx context.Context, s *server.Server, timeoutSeconds int) error {
	rt, err := m.RuntimeFor(s)
	if err != nil {
		return err
	}
	return rt.Restart(ctx, s, secondsDur(timeoutSeconds, 30))
}

// AttachConsole routes to the backend's AttachConsole.
func (m *Manager) AttachConsole(ctx context.Context, s *server.Server) (*Console, error) {
	rt, err := m.RuntimeFor(s)
	if err != nil {
		return nil, err
	}
	return rt.AttachConsole(ctx, s)
}

// Stats routes to the backend's Stats.
func (m *Manager) Stats(ctx context.Context, s *server.Server) (Stats, error) {
	rt, err := m.RuntimeFor(s)
	if err != nil {
		return Stats{}, err
	}
	return rt.Stats(ctx, s)
}

// Reconfigure routes to the backend's Reconfigure.
func (m *Manager) Reconfigure(ctx context.Context, s *server.Server, limits server.Limits) error {
	rt, err := m.RuntimeFor(s)
	if err != nil {
		return err
	}
	s.Spec.Limits = limits
	return rt.Reconfigure(ctx, s, limits)
}

// Destroy tears down runtime artifacts and removes the server from tracking.
func (m *Manager) Destroy(ctx context.Context, s *server.Server) error {
	rt, err := m.RuntimeFor(s)
	if err != nil {
		return err
	}
	if err := rt.Destroy(ctx, s); err != nil {
		return err
	}
	m.Remove(s.ID())
	return nil
}

// Capabilities exposes detected host capabilities for the panel handshake.
func (m *Manager) Capabilities() osabstraction.Capabilities { return m.caps }

// steamLoginRunner is implemented by the Docker runtime: an on-demand probe that
// authenticates the node's game-download Steam account and caches its machine-auth.
type steamLoginRunner interface {
	RunSteamLogin(ctx context.Context, image, username, password, guard string) (string, bool, error)
}

// RunSteamLogin authenticates + caches the node's game-download Steam account so
// owned-game installs (Arma 3, DayZ, …) need no further Steam Guard code. Routed
// to the Docker runtime; errors if Docker is unavailable on this node.
func (m *Manager) RunSteamLogin(
	ctx context.Context,
	image, username, password, guard string,
) (string, bool, error) {
	if docker, ok := m.backends[server.DeployDocker]; ok {
		if r, ok := docker.(steamLoginRunner); ok {
			return r.RunSteamLogin(ctx, image, username, password, guard)
		}
	}
	return "", false, fmt.Errorf("docker runtime not available on this node")
}
