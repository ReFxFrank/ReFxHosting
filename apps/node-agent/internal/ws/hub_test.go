package ws

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/rs/zerolog"

	"github.com/refxfrank/refxhosting/node-agent/internal/runtime"
	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

// Regression for the "console goes permanently blank" bug: the room attached
// to the container once, and when the container was replaced by a restart the
// dead attachment was never cleared — so no output flowed again until every
// viewer disconnected. The room's maintainer must (re)attach whenever clients
// are present and the server is up.

type fakeCtrl struct {
	mu       sync.Mutex
	attempts int
	failN    int // first N attach attempts error (server "not up yet")
	outs     []chan []byte
}

func (f *fakeCtrl) AttachConsole(_ context.Context, _ *server.Server) (*runtime.Console, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.attempts++
	if f.attempts <= f.failN {
		return nil, errors.New("no container")
	}
	out := make(chan []byte, 16)
	f.outs = append(f.outs, out)
	return runtime.NewConsole(out, func(p []byte) (int, error) { return len(p), nil }, func() error { return nil }), nil
}

func (f *fakeCtrl) attaches() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.attempts
}

func (f *fakeCtrl) consoleN(n int) chan []byte {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.outs) < n {
		return nil
	}
	return f.outs[n-1]
}

func (f *fakeCtrl) Get(string) (*server.Server, bool) { return nil, false }
func (f *fakeCtrl) Start(context.Context, *server.Server) error {
	return nil
}
func (f *fakeCtrl) Stop(context.Context, *server.Server, int) error    { return nil }
func (f *fakeCtrl) Restart(context.Context, *server.Server, int) error { return nil }
func (f *fakeCtrl) Kill(context.Context, *server.Server) error         { return nil }
func (f *fakeCtrl) Stats(context.Context, *server.Server) (runtime.Stats, error) {
	return runtime.Stats{}, nil
}

// waitFor polls cond (nudging the room each round so the test doesn't sit out
// the maintainer's 2s tick) until it holds or the deadline passes.
func waitFor(t *testing.T, rm *room, cond func() bool, what string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		select {
		case rm.nudge <- struct{}{}:
		default:
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

// recvConsoleLine drains the client channel until a console.output line arrives.
func recvConsoleLine(t *testing.T, c *client) string {
	t.Helper()
	deadline := time.After(5 * time.Second)
	for {
		select {
		case msg := <-c.send:
			if msg.Type != TypeConsoleOutput {
				continue
			}
			var p ConsoleLine
			if err := unmarshal(msg.Payload, &p); err != nil {
				t.Fatalf("bad console payload: %v", err)
			}
			return p.Line
		case <-deadline:
			t.Fatal("timed out waiting for console output")
		}
	}
}

func TestConsoleReattachesAfterStreamDeathAndLateStart(t *testing.T) {
	ctrl := &fakeCtrl{failN: 1} // first attach fails: server "was down" when the viewer arrived
	h := NewHub(zerolog.Nop(), ctrl, "test-key")
	srv := server.New(server.Spec{ID: "srv-1"}, t.TempDir())
	srv.SetState(server.StateRunning)

	c := &client{send: make(chan Message, 256)}
	rm := h.joinRoom(srv, c)

	// The maintainer must retry past the initial failure and attach.
	waitFor(t, rm, func() bool { return ctrl.consoleN(1) != nil }, "first attach")
	ctrl.consoleN(1) <- []byte("hello from boot")
	if got := recvConsoleLine(t, c); !strings.Contains(got, "hello from boot") {
		t.Fatalf("got %q", got)
	}

	// Container replaced by a restart: the attach stream EOFs. The room must
	// clear the dead console and re-attach — previously it stayed blank forever.
	close(ctrl.consoleN(1))
	waitFor(t, rm, func() bool { return ctrl.consoleN(2) != nil }, "re-attach after stream death")
	ctrl.consoleN(2) <- []byte("hello after restart")
	if got := recvConsoleLine(t, c); !strings.Contains(got, "hello after restart") {
		t.Fatalf("got %q", got)
	}

	// Room teardown stops the maintainer: no further attach attempts.
	h.leaveRoom(srv.ID(), c)
	before := ctrl.attaches()
	time.Sleep(150 * time.Millisecond)
	if after := ctrl.attaches(); after != before {
		t.Fatalf("maintainer kept attaching after room emptied: %d -> %d", before, after)
	}
	h.mu.Lock()
	_, still := h.rooms[srv.ID()]
	h.mu.Unlock()
	if still {
		t.Fatal("room not removed after last client left")
	}
}

func TestConsoleWaitsForServerToBeUp(t *testing.T) {
	ctrl := &fakeCtrl{}
	h := NewHub(zerolog.Nop(), ctrl, "test-key")
	srv := server.New(server.Spec{ID: "srv-2"}, t.TempDir())
	srv.SetState(server.StateOffline)

	c := &client{send: make(chan Message, 256)}
	rm := h.joinRoom(srv, c)

	// While the server is offline the maintainer must NOT attach (attaching to
	// a stopped container would EOF instantly and spam scrollback replays).
	for i := 0; i < 5; i++ {
		select {
		case rm.nudge <- struct{}{}:
		default:
		}
		time.Sleep(20 * time.Millisecond)
	}
	if n := ctrl.attaches(); n != 0 {
		t.Fatalf("attached %d time(s) while offline", n)
	}

	// The moment the server is up, the console attaches.
	srv.SetState(server.StateRunning)
	waitFor(t, rm, func() bool { return ctrl.consoleN(1) != nil }, "attach once running")

	h.leaveRoom(srv.ID(), c)
}
