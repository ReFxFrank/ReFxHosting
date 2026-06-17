//go:build windows

package api

import (
	"os"
	"os/exec"

	"golang.org/x/sys/windows/svc"
)

// agentRestartSupported is true on Windows via a delayed re-launch (below).
const agentRestartSupported = true

// reExecAgent restarts the agent on Windows, where there's no execve.
//
// Under the Service Control Manager the clean restart is to exit and let the
// service's configured restart action relaunch us (picking up a freshly-swapped
// binary after a self-update). A non-zero exit, without first reporting STOPPED,
// is treated by the SCM as a restartable termination.
//
// When run standalone (console / scheduled task) we instead spawn a fresh copy
// that waits briefly (REFX_RESTART_DELAY_MS, honored in main) before binding, then
// exit so the child can claim :8443/:2022 without an "address already in use" race.
func reExecAgent() error {
	if is, err := svc.IsWindowsService(); err == nil && is {
		os.Exit(1)
	}
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
