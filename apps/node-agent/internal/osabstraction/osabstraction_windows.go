//go:build windows

package osabstraction

import (
	"os"
	"strings"
)

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
