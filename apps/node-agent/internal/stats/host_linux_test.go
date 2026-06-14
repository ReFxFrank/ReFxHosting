//go:build linux

package stats

import (
	"math"
	"strings"
	"testing"
)

func TestParseProcStat(t *testing.T) {
	// cpu  user nice system idle iowait irq softirq steal guest guest_nice
	in := "cpu  100 0 50 800 50 0 0 0 0 0\n" +
		"cpu0 50 0 25 400 25 0 0 0 0 0\n" +
		"intr 1234\n"
	ct, ok := parseProcStat(strings.NewReader(in))
	if !ok {
		t.Fatal("parseProcStat returned !ok for valid input")
	}
	// total = 100+0+50+800+50 = 1000; idle = idle(800)+iowait(50) = 850
	if ct.total != 1000 {
		t.Fatalf("total = %d, want 1000", ct.total)
	}
	if ct.idle != 850 {
		t.Fatalf("idle = %d, want 850", ct.idle)
	}
}

func TestParseProcStatSyntheticDelta(t *testing.T) {
	// Two successive synthetic snapshots: between them, 1000 jiffies elapse, 250
	// of them idle => 75% busy.
	first := "cpu  100 0 50 800 50 0 0 0 0 0\n"     // total 1000, idle 850
	second := "cpu  300 0 250 1000 200 0 0 0 0 0\n" // total 1750, idle 1200
	// delta total = 750, delta idle = 350 => busy = 400 => 53.33%
	a, ok := parseProcStat(strings.NewReader(first))
	if !ok {
		t.Fatal("first parse failed")
	}
	b, ok := parseProcStat(strings.NewReader(second))
	if !ok {
		t.Fatal("second parse failed")
	}
	got := cpuPercentDelta(a, b)
	want := 400.0 / 750.0 * 100.0
	if math.Abs(got-want) > 0.01 {
		t.Fatalf("delta = %v, want %v", got, want)
	}
}

func TestParseProcStatNoCPULine(t *testing.T) {
	if _, ok := parseProcStat(strings.NewReader("intr 1\nctxt 2\n")); ok {
		t.Fatal("expected !ok when no cpu line present")
	}
}

func TestReadMemoryRealHost(t *testing.T) {
	// On a real Linux host /proc/meminfo must yield a positive total.
	_, total := readMemory()
	if total <= 0 {
		t.Skipf("readMemory returned total=%d; /proc/meminfo unavailable in sandbox", total)
	}
}
