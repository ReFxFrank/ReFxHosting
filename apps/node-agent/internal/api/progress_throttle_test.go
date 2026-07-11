package api

import (
	"testing"
	"time"
)

func TestProgressThrottle(t *testing.T) {
	th := newProgressThrottle()

	if !th.shouldReport(0) {
		t.Fatal("first report should always pass")
	}
	// Immediately after: tiny increments are suppressed…
	if th.shouldReport(0.001) {
		t.Fatal("tiny increment within the interval should be suppressed")
	}
	// …but a full step passes regardless of elapsed time.
	if !th.shouldReport(0.06) {
		t.Fatal("a >=5%% jump should pass immediately")
	}
	// After the interval elapses, even a small increment passes.
	th.lastAt = time.Now().Add(-3 * time.Second)
	if !th.shouldReport(0.061) {
		t.Fatal("after the interval any progress should pass")
	}
}

func TestProgressThrottleManyFiles(t *testing.T) {
	// Simulate a 50k-file archive finishing quickly: the throttle must cap
	// reports at the step count (~20), not the file count.
	th := newProgressThrottle()
	sent := 0
	for i := 0; i < 50_000; i++ {
		if th.shouldReport(float64(i) / 50_000) {
			sent++
		}
	}
	if sent > 25 {
		t.Fatalf("throttle let %d reports through; want <= 25", sent)
	}
}
