package runtime

import "github.com/refxfrank/refxhosting/node-agent/internal/server"

// limiter applies and tracks OS-level resource constraints for a native process.
// Concrete implementations are build-tagged:
//   - limits_linux.go   cgroups v2 (cpu.max, memory.max, io.weight, pids.max)
//   - limits_windows.go Windows Job Objects (CPU rate, memory, process count)
//
// newLimiter is provided per-platform; on platforms without a real implementation
// it returns a no-op limiter so native hosting still works (unconstrained).
type limiter interface {
	// Apply binds the given OS process (and its descendants) to the limits.
	Apply(pid int) error
	// Update changes the active limits on the fly.
	Update(limits server.Limits) error
	// Destroy releases the limiter (removes cgroup / closes job object handle).
	Destroy() error
}

// processSample is a normalized snapshot of a process's resource usage,
// produced by the platform-specific sampleProcess.
type processSample struct {
	cpuPercent float64
	memBytes   int64
}
