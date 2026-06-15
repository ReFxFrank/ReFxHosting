//go:build windows

package api

import "errors"

// agentRestartSupported is false on Windows: there's no execve equivalent that
// preserves the listener sockets, so in-place self-restart is unsupported. The
// panel surfaces a clear "not supported on this platform" message and admins
// restart the Windows service via the SCM instead.
const agentRestartSupported = false

// reExecAgent is unreachable on Windows (guarded by agentRestartSupported) but
// must exist so the package compiles for windows/amd64.
func reExecAgent() error {
	return errors.New("agent self-restart is not supported on windows")
}
