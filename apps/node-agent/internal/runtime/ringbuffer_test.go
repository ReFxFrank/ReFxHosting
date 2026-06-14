package runtime

import (
	"fmt"
	"testing"
)

func TestRingBufferOverflowEvictsOldest(t *testing.T) {
	rb := newRingBuffer(3)
	for i := 0; i < 5; i++ {
		rb.push([]byte(fmt.Sprintf("line-%d", i)))
	}
	snap := rb.snapshot()
	if len(snap) != 3 {
		t.Fatalf("snapshot len = %d, want 3 (capacity)", len(snap))
	}
	want := []string{"line-2", "line-3", "line-4"}
	for i, w := range want {
		if string(snap[i]) != w {
			t.Fatalf("snapshot[%d] = %q, want %q", i, snap[i], w)
		}
	}
}

func TestRingBufferDefaultCapacity(t *testing.T) {
	rb := newRingBuffer(0) // 0 -> defaults to 256
	for i := 0; i < 300; i++ {
		rb.push([]byte("x"))
	}
	if got := len(rb.snapshot()); got != 256 {
		t.Fatalf("snapshot len = %d, want 256 (default cap)", got)
	}
}

func TestRingBufferPushCopiesInput(t *testing.T) {
	rb := newRingBuffer(2)
	buf := []byte("orig")
	rb.push(buf)
	// Mutate the caller's slice; the stored copy must be unaffected.
	copy(buf, "MUTA")
	snap := rb.snapshot()
	if string(snap[0]) != "orig" {
		t.Fatalf("stored line = %q, want %q (push must copy)", snap[0], "orig")
	}
}
