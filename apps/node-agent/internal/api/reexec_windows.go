//go:build windows

package api

import (
	"os"
	"os/exec"
)

// agentRestartSupported is true on Windows via a delayed re-launch (below).
const agentRestartSupported = true

// reExecAgent restarts the agent on Windows, where there's no execve. It spawns
// a fresh copy of the binary that waits briefly before binding (via
// REFX_RESTART_DELAY_MS, honored in main) and then exits this process so the
// listeners (:8443/:2022) are released for the child to claim — avoiding an
// "address already in use" race. Running game containers are untouched and get
// re-adopted when the new process boots.
func reExecAgent() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	cmd := exec.Command(exe, os.Args[1:]...)
	cmd.Env = append(os.Environ(), "REFX_RESTART_DELAY_MS=1500")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	if err := cmd.Start(); err != nil {
		return err
	}
	// Release this process so the delayed child can bind the listeners.
	os.Exit(0)
	return nil // unreachable
}
