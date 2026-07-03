package runtime

import (
	"testing"
	"time"
)

// TestCPUPercent covers the one-shot CPU-delta calculation: a baseline first
// sample, a correct percentage on the next sample, reuse of the last value when
// two reads land too close together, and a clean 0 after a counter reset.
func TestCPUPercent(t *testing.T) {
	d := &DockerRuntime{}
	const id = "srv-1"
	base := time.Unix(1_700_000_000, 0)

	// First sample: no baseline yet → 0.
	if got := d.cpuPercent(id, 1_000_000_000, base); got != 0 {
		t.Fatalf("first sample = %v, want 0", got)
	}

	// One second later, the container used 0.5s of CPU time → 50% of one core.
	if got := d.cpuPercent(id, 1_500_000_000, base.Add(time.Second)); got != 50 {
		t.Fatalf("second sample = %v, want 50", got)
	}

	// A read <750ms after the last reuses the previous value and does NOT reset
	// the baseline (Stats is called twice per cycle).
	if got := d.cpuPercent(id, 1_600_000_000, base.Add(time.Second+200*time.Millisecond)); got != 50 {
		t.Fatalf("too-soon sample = %v, want 50 (reused)", got)
	}

	// Baseline is still the +1s sample (the too-soon read didn't advance it).
	// +2s wall, +4.0e9 ns CPU time = two full cores → 200%.
	if got := d.cpuPercent(id, 5_500_000_000, base.Add(3*time.Second)); got != 200 {
		t.Fatalf("multi-core sample = %v, want 200", got)
	}

	// Counter reset (container restart: total drops) → 0, and re-baselines.
	if got := d.cpuPercent(id, 10_000_000, base.Add(4*time.Second)); got != 0 {
		t.Fatalf("post-reset sample = %v, want 0", got)
	}

	// forgetCPU drops the baseline so the next sample is treated as first (0).
	d.forgetCPU(id)
	if got := d.cpuPercent(id, 50_000_000, base.Add(5*time.Second)); got != 0 {
		t.Fatalf("after forgetCPU = %v, want 0", got)
	}
}
