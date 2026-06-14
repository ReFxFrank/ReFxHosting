package stats

import "sync"

// HostSample is a point-in-time snapshot of host-level resource utilisation,
// normalized across platforms. CPUPercent is whole-machine utilisation in the
// range [0, 100] (averaged over all cores), not per-core like the per-server
// runtime.Stats figure.
type HostSample struct {
	CPUPercent float64
	MemUsedMB  int64
	MemTotalMB int64
}

// HostSampler produces host-level CPU/memory samples. CPU percent is computed
// from the delta between successive Sample calls, so the first call after
// construction reports 0% CPU (no prior baseline) but a valid memory figure.
//
// Implementations are build-tagged:
//   - host_linux.go    parses /proc/stat deltas + /proc/meminfo
//   - host_windows.go  GetSystemTimes + GlobalMemoryStatusEx
//   - host_other.go    portable fallback (memory only, 0% CPU)
//
// A HostSampler is safe for concurrent use.
type HostSampler struct {
	mu   sync.Mutex
	prev cpuTimes // platform-specific previous CPU counters
	have bool     // whether prev is populated
}

// NewHostSampler constructs a HostSampler. Call Sample on an interval; the CPU
// figure reflects utilisation since the previous call.
func NewHostSampler() *HostSampler { return &HostSampler{} }

// Sample returns the current host CPU/memory utilisation. It never returns an
// error: on platforms or hosts where a counter is unavailable the corresponding
// field is reported as zero so telemetry keeps flowing.
func (h *HostSampler) Sample() HostSample {
	h.mu.Lock()
	defer h.mu.Unlock()

	cur, okCPU := readCPUTimes()
	var pct float64
	if okCPU && h.have {
		pct = cpuPercentDelta(h.prev, cur)
	}
	if okCPU {
		h.prev = cur
		h.have = true
	}

	usedMB, totalMB := readMemory()
	return HostSample{CPUPercent: pct, MemUsedMB: usedMB, MemTotalMB: totalMB}
}
