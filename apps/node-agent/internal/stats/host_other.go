//go:build !linux && !windows

package stats

// Portable fallback for platforms without a native sampler (darwin, *bsd, etc.).
// Memory and CPU are reported as zero so telemetry keeps flowing without lying
// about figures we cannot read here.

func readCPUTimes() (cpuTimes, bool) { return cpuTimes{}, false }

func readMemory() (usedMB, totalMB int64) { return 0, 0 }
