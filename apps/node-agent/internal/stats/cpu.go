package stats

// cpuTimes holds cumulative CPU counters in platform-native units. Only the
// ratio of deltas matters, so the absolute unit (jiffies on Linux, 100ns ticks
// on Windows) is irrelevant as long as total and idle share it.
type cpuTimes struct {
	total uint64 // all CPU time (busy + idle)
	idle  uint64 // idle (and iowait, on Linux) CPU time
}

// cpuPercentDelta computes whole-machine CPU utilisation in [0, 100] from two
// successive cumulative samples. It is a pure function so the delta arithmetic
// can be unit-tested with synthetic samples on any platform.
//
// Guards against counter wrap / non-monotonic reads (returns 0) and clamps the
// result to the valid range.
func cpuPercentDelta(prev, cur cpuTimes) float64 {
	if cur.total <= prev.total {
		return 0
	}
	totalDelta := cur.total - prev.total
	var idleDelta uint64
	if cur.idle > prev.idle {
		idleDelta = cur.idle - prev.idle
	}
	if idleDelta > totalDelta {
		idleDelta = totalDelta
	}
	busy := totalDelta - idleDelta
	pct := float64(busy) / float64(totalDelta) * 100.0
	if pct < 0 {
		return 0
	}
	if pct > 100 {
		return 100
	}
	return pct
}
