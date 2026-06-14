// Package osabstraction isolates the handful of behaviours that genuinely differ
// between Linux and Windows so the rest of the agent stays OS-agnostic.
//
// The shared surface is declared here; the implementations live in
// osabstraction_linux.go and osabstraction_windows.go behind build tags.
package osabstraction

import (
	"os"
	"os/exec"
)

// StopSignal is an OS-portable description of how to ask a process to stop
// gracefully before resorting to a hard kill.
type StopSignal int

const (
	// SignalTerm asks for a graceful shutdown (SIGTERM on Linux; a
	// CTRL_BREAK / taskkill on Windows).
	SignalTerm StopSignal = iota
	// SignalInt mirrors an interactive Ctrl-C (SIGINT / CTRL_C_EVENT). Many
	// game servers treat this as "save and quit".
	SignalInt
)

// Capabilities reports which OS-level resource controls are available on the
// host the agent is running on. The runtime layer uses this to decide whether
// native resource limiting can be honoured.
type Capabilities struct {
	OS              string // "linux" | "windows"
	CgroupsV2       bool   // Linux: unified cgroup hierarchy mounted
	JobObjects      bool   // Windows: Job Object API usable
	DockerAvailable bool   // a Docker engine endpoint responded
}

// DefaultDataDir returns the conventional data directory for this OS. It is only
// used as a fallback when config does not specify one.
func DefaultDataDir() string { return defaultDataDir() }

// ExecutableName appends the platform's executable suffix when needed.
func ExecutableName(base string) string { return execName(base) }

// IsExecutable reports whether the file at path is runnable by this process.
func IsExecutable(info os.FileInfo) bool { return isExecutable(info) }

// DetectCapabilities probes the host for available resource-control facilities.
func DetectCapabilities() Capabilities { return detectCapabilities() }

// Shell returns the platform's shell binary and the flag that runs a command
// string (e.g. "/bin/sh","-c" on Linux; "cmd","/C" on Windows).
func Shell() (string, string) { return shell() }

// SetProcessGroup configures a command so the agent can signal/kill the process
// and all of its children as a unit (a new process group on Linux; handled via
// Job Objects at the runtime layer on Windows).
func SetProcessGroup(cmd *exec.Cmd) { setProcessGroup(cmd) }

// KillProcessGroup terminates a process and its descendants.
func KillProcessGroup(p *os.Process) error { return killProcessGroup(p) }
