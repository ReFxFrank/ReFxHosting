package stats

import (
	"math"
	"testing"
)

func TestCPUPercentDelta(t *testing.T) {
	cases := []struct {
		name      string
		prev, cur cpuTimes
		want      float64
		tolerance float64
	}{
		{
			name: "half busy",
			prev: cpuTimes{total: 1000, idle: 500},
			cur:  cpuTimes{total: 2000, idle: 1000}, // +1000 total, +500 idle => 50% busy
			want: 50,
		},
		{
			name: "fully busy",
			prev: cpuTimes{total: 100, idle: 100},
			cur:  cpuTimes{total: 200, idle: 100}, // +100 total, +0 idle => 100%
			want: 100,
		},
		{
			name: "fully idle",
			prev: cpuTimes{total: 100, idle: 50},
			cur:  cpuTimes{total: 200, idle: 150}, // +100 total, +100 idle => 0%
			want: 0,
		},
		{
			name: "no progress returns zero",
			prev: cpuTimes{total: 500, idle: 100},
			cur:  cpuTimes{total: 500, idle: 100},
			want: 0,
		},
		{
			name: "counter wrap (cur < prev) returns zero",
			prev: cpuTimes{total: 1000, idle: 200},
			cur:  cpuTimes{total: 900, idle: 100},
			want: 0,
		},
		{
			name: "idle delta exceeding total is clamped to 0% busy",
			prev: cpuTimes{total: 1000, idle: 0},
			cur:  cpuTimes{total: 1100, idle: 1000}, // idle delta 1000 > total delta 100
			want: 0,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := cpuPercentDelta(tc.prev, tc.cur)
			tol := tc.tolerance
			if tol == 0 {
				tol = 0.0001
			}
			if math.Abs(got-tc.want) > tol {
				t.Fatalf("cpuPercentDelta(%+v, %+v) = %v, want %v", tc.prev, tc.cur, got, tc.want)
			}
			if got < 0 || got > 100 {
				t.Fatalf("result %v out of [0,100]", got)
			}
		})
	}
}

func TestHostSamplerFirstSampleNoBaseline(t *testing.T) {
	h := NewHostSampler()
	// The first Sample has no prior baseline, so CPU% must be exactly 0 even on a
	// busy host. Memory may be zero on the portable fallback; both are valid.
	first := h.Sample()
	if first.CPUPercent != 0 {
		t.Fatalf("first sample CPU%% = %v, want 0 (no baseline)", first.CPUPercent)
	}
	// Subsequent samples must stay within range.
	second := h.Sample()
	if second.CPUPercent < 0 || second.CPUPercent > 100 {
		t.Fatalf("second sample CPU%% = %v out of range", second.CPUPercent)
	}
	if first.MemTotalMB < 0 || first.MemUsedMB < 0 {
		t.Fatalf("negative memory figures: %+v", first)
	}
}
