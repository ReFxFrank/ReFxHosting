// Package server defines the per-server state model shared across the agent and
// the installer that materialises a game template onto disk.
//
// A Server in the agent is a denormalized, node-scoped projection of the panel's
// Server + GameTemplate records (see database/prisma/schema.prisma). The agent
// never talks to Postgres directly; the panel pushes a Spec over the control API.
package server

import (
	"sync"
	"time"
)

// DeployMethod mirrors the panel's DeployMethod enum and selects the runtime
// backend used to host the server.
type DeployMethod string

const (
	DeployDocker           DeployMethod = "DOCKER"
	DeployNativeProcess    DeployMethod = "NATIVE_PROCESS"
	DeployWindowsContainer DeployMethod = "WINDOWS_CONTAINER"
	DeploySandbox          DeployMethod = "SANDBOX"
)

// State mirrors the panel's ServerState enum.
type State string

const (
	StateInstalling   State = "INSTALLING"
	StateOffline      State = "OFFLINE"
	StateStarting     State = "STARTING"
	StateRunning      State = "RUNNING"
	StateStopping     State = "STOPPING"
	StateCrashed      State = "CRASHED"
	StateSuspended    State = "SUSPENDED"
	StateReinstalling State = "REINSTALLING"
)

// Allocation is a single ip:port binding a server may use.
//
// IP is the *advertised* address (the node FQDN/public IP) surfaced to players
// and injected as SERVER_IP. BindIP is the host interface the published port is
// actually bound to; when empty the agent binds all interfaces (0.0.0.0). These
// are deliberately separate: on NAT'd hosts (most cloud VPS) binding to the
// specific public IP makes the port unreachable because inbound packets arrive
// with the private destination IP, so the bind never matches.
type Allocation struct {
	IP        string `json:"ip"`
	BindIP    string `json:"bindIp,omitempty"`
	Port      int    `json:"port"`
	IsPrimary bool   `json:"isPrimary"`
}

// Limits are the resource constraints applied to a server regardless of runtime.
// They map onto Docker host-config limits, cgroups v2 controllers, or Windows
// Job Object limits depending on the active Runtime.
type Limits struct {
	// CPUCores is fractional (e.g. 1.5 = 150% of one core).
	CPUCores float64 `json:"cpuCores"`
	MemoryMB int64   `json:"memoryMb"`
	SwapMB   int64   `json:"swapMb"`
	DiskMB   int64   `json:"diskMb"`
	// IOWeight is a 1..1000 blkio weight (cgroups) / hint.
	IOWeight int `json:"ioWeight"`
	// PidsLimit caps the number of processes/threads. 0 = unlimited.
	PidsLimit int64 `json:"pidsLimit"`
}

// ConfigFile is a file the installer renders into the server data dir on
// (re)install. It mirrors GameTemplate.configFiles entries.
type ConfigFile struct {
	// Path is relative to the server data dir.
	Path string `json:"path"`
	// Content may contain {{VAR}} placeholders resolved from Env.
	Content string `json:"content"`
	// Mode is an octal file mode string, e.g. "0644". Empty -> 0644.
	Mode string `json:"mode,omitempty"`
}

// InstallScript describes how to materialise a template before first boot.
// It mirrors GameTemplate.installScript.
type InstallScript struct {
	// Image is the throwaway container image used to run the script (Docker /
	// Windows container deploys). Ignored by the native runtime.
	Image string `json:"image"`
	// Entrypoint defaults to the image entrypoint when empty.
	Entrypoint string `json:"entrypoint,omitempty"`
	// Script is the shell/batch script body executed inside the install
	// environment with the server data dir mounted at /mnt/server.
	Script string `json:"script"`
	// SteamAppID, when set, lets the native installer drive SteamCMD directly.
	SteamAppID int `json:"steamAppId,omitempty"`
}

// Spec is the complete, panel-supplied definition of a server. It is the unit
// the control API accepts for install/reconfigure operations.
type Spec struct {
	ID      string `json:"id"`      // server UUID
	ShortID string `json:"shortId"` // user-facing id, also the SFTP username

	DeployMethod DeployMethod `json:"deployMethod"`

	// Image is the runtime container image (Docker / Windows container). For the
	// native runtime it is ignored.
	Image string `json:"image,omitempty"`

	// StartupCommand is the rendered command line (after {{VAR}} interpolation
	// on the panel, or with placeholders the agent resolves from Env).
	StartupCommand string `json:"startupCommand"`
	// StartupDetect is a substring/regex marking the server as fully running.
	StartupDetect string `json:"startupDetect,omitempty"`
	// StopCommand is "^C", a signal name, or a console command (e.g. "stop").
	StopCommand string `json:"stopCommand,omitempty"`

	// Env are the resolved environment variables for the server process.
	Env map[string]string `json:"env"`

	Limits      Limits        `json:"limits"`
	Allocations []Allocation  `json:"allocations"`
	Install     InstallScript `json:"install"`
	ConfigFiles []ConfigFile  `json:"configFiles,omitempty"`
}

// Primary returns the primary allocation, or the first one, or a zero value.
func (s *Spec) Primary() Allocation {
	for _, a := range s.Allocations {
		if a.IsPrimary {
			return a
		}
	}
	if len(s.Allocations) > 0 {
		return s.Allocations[0]
	}
	return Allocation{}
}

// Server is the live, in-memory state for a single hosted server. It is safe for
// concurrent use; callers mutate state through the setters.
type Server struct {
	mu sync.RWMutex

	Spec    Spec
	DataDir string

	state       State
	lastError   string
	installedAt time.Time
	startedAt   time.Time
	// RuntimeRef is an opaque handle the active runtime stores (container id,
	// pid, etc.). Owned by the runtime, read for diagnostics only.
	RuntimeRef string
}

// New constructs a Server in the OFFLINE state.
func New(spec Spec, dataDir string) *Server {
	return &Server{Spec: spec, DataDir: dataDir, state: StateOffline}
}

// ID is a convenience accessor.
func (s *Server) ID() string { return s.Spec.ID }

// State returns the current lifecycle state.
func (s *Server) State() State {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.state
}

// SetState updates the lifecycle state and stamps timing transitions.
func (s *Server) SetState(st State) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state = st
	switch st {
	case StateRunning:
		s.startedAt = time.Now()
	case StateOffline, StateCrashed:
		s.startedAt = time.Time{}
	}
}

// SetError records the most recent error message for surfacing to the panel.
func (s *Server) SetError(msg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lastError = msg
}

// LastError returns the most recent error message.
func (s *Server) LastError() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.lastError
}

// MarkInstalled records successful installation.
func (s *Server) MarkInstalled() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.installedAt = time.Now()
}

// Uptime returns how long the server has been running, or zero if not running.
func (s *Server) Uptime() time.Duration {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.startedAt.IsZero() {
		return 0
	}
	return time.Since(s.startedAt)
}

// UpdateSpec replaces the spec (used on reconfigure / game switch).
func (s *Server) UpdateSpec(spec Spec) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Spec = spec
}
