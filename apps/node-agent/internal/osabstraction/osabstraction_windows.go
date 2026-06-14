//go:build windows

package osabstraction

import (
	"os"
	"os/exec"
	"strings"
	"syscall"
)

func shell() (string, string) { return "cmd", "/C" }

// setProcessGroup creates a new process group so the runtime's Job Object can
// own the whole tree. CREATE_NEW_PROCESS_GROUP == 0x00000200.
func setProcessGroup(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.CreationFlags |= 0x00000200
}

// killProcessGroup terminates the process. Child cleanup is enforced by the
// Job Object (JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE) at the runtime layer.
func killProcessGroup(p *os.Process) error {
	if p == nil {
		return os.ErrProcessDone
	}
	return p.Kill()
}

func defaultDataDir() string {
	if pd := os.Getenv("ProgramData"); pd != "" {
		return pd + `\ReFxAgent`
	}
	return `C:\ProgramData\ReFxAgent`
}

func execName(base string) string {
	if strings.HasSuffix(strings.ToLower(base), ".exe") {
		return base
	}
	return base + ".exe"
}

// On Windows there is no executable bit; rely on extension heuristics.
func isExecutable(info os.FileInfo) bool {
	name := strings.ToLower(info.Name())
	for _, ext := range []string{".exe", ".bat", ".cmd", ".com"} {
		if strings.HasSuffix(name, ext) {
			return true
		}
	}
	return false
}

// SignalProcess on Windows has no SIGTERM; graceful stop is implemented at the
// runtime layer (sending a console CTRL event or writing a stop command). This
// helper falls back to terminating the process.
func SignalProcess(p *os.Process, _ StopSignal) error {
	if p == nil {
		return os.ErrProcessDone
	}
	return p.Kill()
}

func detectCapabilities() Capabilities {
	c := Capabilities{OS: "windows", JobObjects: true}
	// Probe for the Docker named pipe (Docker Desktop / EE engine).
	if _, err := os.Stat(`\\.\pipe\docker_engine`); err == nil {
		c.DockerAvailable = true
	}
	return c
}
