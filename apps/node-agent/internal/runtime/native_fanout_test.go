package runtime

import (
	"strings"
	"testing"
	"time"

	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

// drainN reads up to n lines from ch, giving up after a short deadline.
func drainN(ch chan []byte, n int, d time.Duration) []string {
	var out []string
	deadline := time.After(d)
	for len(out) < n {
		select {
		case line := <-ch:
			out = append(out, string(line))
		case <-deadline:
			return out
		}
	}
	return out
}

func TestPumpFanOutMultiSubscriber(t *testing.T) {
	srv := server.New(server.Spec{ID: "s1", StartupDetect: "READY"}, t.TempDir())
	srv.SetState(server.StateStarting)

	p := &nativeProcess{
		logs:        newRingBuffer(16),
		subscribers: make(map[chan []byte]struct{}),
		exited:      make(chan struct{}),
	}

	// Two healthy subscribers with ample buffer.
	subA := make(chan []byte, 8)
	subB := make(chan []byte, 8)
	p.mu.Lock()
	p.subscribers[subA] = struct{}{}
	p.subscribers[subB] = struct{}{}
	p.mu.Unlock()

	input := "first line\nREADY to go\nthird line\n"
	done := make(chan struct{})
	go func() {
		p.pump(strings.NewReader(input), srv)
		close(done)
	}()

	<-done // pump exits when the reader is drained

	gotA := drainN(subA, 3, time.Second)
	gotB := drainN(subB, 3, time.Second)
	if len(gotA) != 3 || len(gotB) != 3 {
		t.Fatalf("expected 3 lines per subscriber, got A=%d B=%d", len(gotA), len(gotB))
	}
	for i, want := range []string{"first line", "READY to go", "third line"} {
		if gotA[i] != want || gotB[i] != want {
			t.Fatalf("line %d mismatch: A=%q B=%q want %q", i, gotA[i], gotB[i], want)
		}
	}

	// Ring buffer must also have captured everything for scrollback priming.
	snap := p.logs.snapshot()
	if len(snap) != 3 {
		t.Fatalf("ring buffer captured %d lines, want 3", len(snap))
	}

	// StartupDetect "READY" should have flipped the server to RUNNING.
	if srv.State() != server.StateRunning {
		t.Fatalf("state = %s, want RUNNING after detect match", srv.State())
	}
}

func TestPumpDoesNotBlockOnSlowSubscriber(t *testing.T) {
	srv := server.New(server.Spec{ID: "s2"}, t.TempDir())

	p := &nativeProcess{
		logs:        newRingBuffer(64),
		subscribers: make(map[chan []byte]struct{}),
		exited:      make(chan struct{}),
	}

	// A full, never-drained subscriber: pump must drop rather than deadlock.
	slow := make(chan []byte, 1)
	slow <- []byte("pre-fill") // occupy the only slot
	fast := make(chan []byte, 256)
	p.mu.Lock()
	p.subscribers[slow] = struct{}{}
	p.subscribers[fast] = struct{}{}
	p.mu.Unlock()

	var b strings.Builder
	for i := 0; i < 100; i++ {
		b.WriteString("noise\n")
	}

	done := make(chan struct{})
	go func() {
		p.pump(strings.NewReader(b.String()), srv)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("pump blocked on a slow subscriber (overflow not handled)")
	}

	// The fast subscriber should have received many lines despite the slow one.
	if got := drainN(fast, 100, time.Second); len(got) < 50 {
		t.Fatalf("fast subscriber got only %d lines; fan-out starved", len(got))
	}
	// The ring buffer must contain all 100 regardless of subscriber health.
	if got := len(p.logs.snapshot()); got != 64 {
		t.Fatalf("ring buffer len = %d, want 64 (capacity after overflow)", got)
	}
}
