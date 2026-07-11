//go:build linux

package runtime

import (
	"fmt"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

// cgroupRoot is the unified cgroups v2 mount point.
const cgroupRoot = "/sys/fs/cgroup"

// cgroupV2Limiter implements limiter using cgroups v2 unified hierarchy. Each
// server gets a dedicated cgroup under refx.slice and its limits are written to
// the standard controller files.
type cgroupV2Limiter struct {
	path string // absolute cgroup path, e.g. /sys/fs/cgroup/refx.slice/<id>

	mu        sync.Mutex
	lastUsage uint64 // cpu.stat usage_usec
	lastAt    time.Time
}

// newLimiter creates a cgroup v2 limiter, or a no-op limiter if cgroups v2 is
// not mounted (e.g. WSL1, exotic hosts).
func newLimiter(serverID string, limits server.Limits) (limiter, error) {
	if _, err := os.Stat(filepath.Join(cgroupRoot, "cgroup.controllers")); err != nil {
		return noopLimiter{}, fmt.Errorf("cgroups v2 not available: %w", err)
	}
	path := filepath.Join(cgroupRoot, "refx.slice", "refx-"+serverID)
	if err := os.MkdirAll(path, 0o755); err != nil {
		return noopLimiter{}, fmt.Errorf("create cgroup: %w", err)
	}
	l := &cgroupV2Limiter{path: path}
	// Ensure required controllers are delegated to the subtree.
	_ = enableControllers(filepath.Dir(path))
	if err := l.write(limits); err != nil {
		return l, err
	}
	return l, nil
}

// enableControllers delegates cpu/memory/io/pids to a cgroup's children.
func enableControllers(dir string) error {
	return os.WriteFile(filepath.Join(dir, "cgroup.subtree_control"),
		[]byte("+cpu +memory +io +pids"), 0o644)
}

func (l *cgroupV2Limiter) write(limits server.Limits) error {
	// CPU: fair-share weight at the sold cores + hard ceiling at the burst
	// allowance (see cpuplan.go). cpu.max is "<quota> <period>" with
	// quota = burst cores * period; weight is best-effort (older kernels).
	_ = l.set("cpu.weight", strconv.Itoa(cgroupCPUWeight(limits.CPUCores)))
	if limits.CPUCores > 0 {
		period := 100000
		burst := cpuBurstCores(limits.CPUCores, float64(goruntime.NumCPU()))
		quota := int(burst * float64(period))
		if err := l.set("cpu.max", fmt.Sprintf("%d %d", quota, period)); err != nil {
			return err
		}
	} else {
		_ = l.set("cpu.max", "max 100000")
	}
	// memory.max in bytes.
	if limits.MemoryMB > 0 {
		if err := l.set("memory.max", strconv.FormatInt(limits.MemoryMB*1024*1024, 10)); err != nil {
			return err
		}
	}
	// memory.swap.max: swap allowance beyond memory.max.
	if limits.SwapMB >= 0 {
		_ = l.set("memory.swap.max", strconv.FormatInt(limits.SwapMB*1024*1024, 10))
	}
	// io.weight (1..1000 -> cgroup expects 1..10000, scale by 10).
	if limits.IOWeight > 0 {
		_ = l.set("io.weight", "default "+strconv.Itoa(clampIO(limits.IOWeight)*10))
	}
	// pids.max caps process/thread count.
	if limits.PidsLimit > 0 {
		_ = l.set("pids.max", strconv.FormatInt(limits.PidsLimit, 10))
	}
	return nil
}

func (l *cgroupV2Limiter) set(file, value string) error {
	if err := os.WriteFile(filepath.Join(l.path, file), []byte(value), 0o644); err != nil {
		return fmt.Errorf("cgroup write %s: %w", file, err)
	}
	return nil
}

// Apply moves the process into the cgroup; descendants inherit membership.
func (l *cgroupV2Limiter) Apply(pid int) error {
	return l.set("cgroup.procs", strconv.Itoa(pid))
}

func (l *cgroupV2Limiter) Update(limits server.Limits) error { return l.write(limits) }

func (l *cgroupV2Limiter) Destroy() error {
	// A cgroup can only be removed once empty; processes have exited by now.
	return os.Remove(l.path)
}

// usage reads CPU usage (usec) and memory (bytes) from the cgroup.
func (l *cgroupV2Limiter) usage() (cpuUsec uint64, memBytes int64) {
	if b, err := os.ReadFile(filepath.Join(l.path, "cpu.stat")); err == nil {
		for _, line := range strings.Split(string(b), "\n") {
			if strings.HasPrefix(line, "usage_usec") {
				fields := strings.Fields(line)
				if len(fields) == 2 {
					cpuUsec, _ = strconv.ParseUint(fields[1], 10, 64)
				}
			}
		}
	}
	if b, err := os.ReadFile(filepath.Join(l.path, "memory.current")); err == nil {
		memBytes, _ = strconv.ParseInt(strings.TrimSpace(string(b)), 10, 64)
	}
	return
}

// sampleProcess computes CPU% and memory for a native process using its cgroup
// when available, falling back to a zero sample.
func sampleProcess(_ int, lim limiter) (processSample, error) {
	cg, ok := lim.(*cgroupV2Limiter)
	if !ok {
		return processSample{}, nil
	}
	cg.mu.Lock()
	defer cg.mu.Unlock()
	cpuUsec, mem := cg.usage()
	now := time.Now()
	var pct float64
	if !cg.lastAt.IsZero() {
		dt := now.Sub(cg.lastAt).Seconds()
		if dt > 0 && cpuUsec >= cg.lastUsage {
			deltaSec := float64(cpuUsec-cg.lastUsage) / 1e6
			pct = (deltaSec / dt) * 100.0
		}
	}
	cg.lastUsage = cpuUsec
	cg.lastAt = now
	return processSample{cpuPercent: pct, memBytes: mem}, nil
}
