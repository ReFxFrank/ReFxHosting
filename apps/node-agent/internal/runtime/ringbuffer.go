package runtime

import "sync"

// ringBuffer is a fixed-capacity FIFO of recent console lines. The native
// runtime keeps one per server so a freshly-attaching console can be primed with
// scrollback, mirroring the behaviour Docker gives us via `logs --tail`.
type ringBuffer struct {
	mu    sync.Mutex
	lines [][]byte
	cap   int
}

func newRingBuffer(capacity int) *ringBuffer {
	if capacity <= 0 {
		capacity = 256
	}
	return &ringBuffer{cap: capacity, lines: make([][]byte, 0, capacity)}
}

// push appends a line, evicting the oldest when at capacity.
func (r *ringBuffer) push(line []byte) {
	r.mu.Lock()
	defer r.mu.Unlock()
	cp := make([]byte, len(line))
	copy(cp, line)
	if len(r.lines) >= r.cap {
		r.lines = r.lines[1:]
	}
	r.lines = append(r.lines, cp)
}

// snapshot returns a copy of the buffered lines, oldest first.
func (r *ringBuffer) snapshot() [][]byte {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([][]byte, len(r.lines))
	copy(out, r.lines)
	return out
}
