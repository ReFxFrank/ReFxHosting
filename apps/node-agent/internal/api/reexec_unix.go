//go:build !windows

package api

import (
	"os"
	"syscall"
)

// agentRestartSupported reports whether in-place self-restart works here.
const agentRestartSupported = true

// reExecAgent replaces the current process image with a fresh copy of the same
// binary, preserving PID, args and environment. execve atomically closes the
// agent's listener FDs (Go marks them close-on-exec), so the new process
// re-binds :8443/:2022 cleanly with no "address already in use" race. Under
// both systemd and a plain background launch the supervisor sees the same PID,
// so nothing needs to be reconfigured.
func reExecAgent() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	return syscall.Exec(exe, os.Args, os.Environ())
}
