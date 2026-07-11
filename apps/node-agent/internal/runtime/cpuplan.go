package runtime

// CPU enforcement model: fair-share weight + generous burst ceiling.
//
// A hard CFS quota at exactly the plan's cores makes bursty game workloads
// (Minecraft startup, chunk generation, GC) miserable while the node sits
// idle. Instead each server gets:
//
//   - a WEIGHT proportional to its sold cores — under contention the node's
//     CPU divides in proportion to what each customer pays, so no server can
//     starve a neighbour; and
//   - a hard CEILING of cpuBurstFactor × sold cores (never more than the
//     host has) — idle capacity is usable for bursts, while a runaway server
//     is still contained.
//
// Sold cores <= 0 keeps its legacy meaning: no ceiling and default weight.
const cpuBurstFactor = 2.0

// cpuBurstCores returns the hard ceiling in (fractional) cores for a plan of
// `sold` cores on a host with `hostCores` logical CPUs. 0 means "no ceiling".
func cpuBurstCores(sold, hostCores float64) float64 {
	if sold <= 0 {
		return 0
	}
	burst := sold * cpuBurstFactor
	if hostCores > 0 && burst > hostCores {
		burst = hostCores
	}
	return burst
}

// dockerCPUShares maps sold cores onto Docker's CpuShares scale (1024 = one
// default share; the daemon accepts [2, 262144] and converts to cgroup v2
// cpu.weight itself). 0 leaves the daemon's default weight in place.
func dockerCPUShares(sold float64) int64 {
	if sold <= 0 {
		return 0
	}
	s := int64(sold * 1024)
	if s < 2 {
		s = 2
	}
	if s > 262144 {
		s = 262144
	}
	return s
}

// cgroupCPUWeight maps sold cores onto cgroup v2 cpu.weight (default 100,
// valid range [1, 10000]) for the native runtime.
func cgroupCPUWeight(sold float64) int {
	if sold <= 0 {
		return 100
	}
	w := int(sold * 100)
	if w < 1 {
		w = 1
	}
	if w > 10000 {
		w = 10000
	}
	return w
}
