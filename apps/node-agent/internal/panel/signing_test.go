package panel

import (
	"strconv"
	"testing"
	"time"
)

func TestSignVerifyRoundTrip(t *testing.T) {
	key := "node-signing-key"
	method, path := "POST", "/api/v1/servers/abc/power"
	body := []byte(`{"action":"start"}`)
	ts := strconv.FormatInt(time.Now().Unix(), 10)

	sig := Sign(key, method, path, ts, body)
	if !Verify(key, method, path, ts, sig, body) {
		t.Fatal("valid signature failed verification")
	}
}

func TestVerifyRejectsTamper(t *testing.T) {
	key := "k"
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	sig := Sign(key, "POST", "/x", ts, []byte("a"))

	if Verify(key, "POST", "/x", ts, sig, []byte("b")) {
		t.Error("tampered body accepted")
	}
	if Verify("other", "POST", "/x", ts, sig, []byte("a")) {
		t.Error("wrong key accepted")
	}
	if Verify(key, "GET", "/x", ts, sig, []byte("a")) {
		t.Error("wrong method accepted")
	}
}

func TestVerifyRejectsStaleTimestamp(t *testing.T) {
	key := "k"
	stale := strconv.FormatInt(time.Now().Add(-1*time.Hour).Unix(), 10)
	sig := Sign(key, "POST", "/x", stale, nil)
	if Verify(key, "POST", "/x", stale, sig, nil) {
		t.Error("stale timestamp accepted (replay window not enforced)")
	}
}

func TestVerifyReplayWindowEdges(t *testing.T) {
	key := "k"
	method, path := "POST", "/edge"
	body := []byte(`{"x":1}`)

	sign := func(offset time.Duration) (ts, sig string) {
		ts = strconv.FormatInt(time.Now().Add(offset).Unix(), 10)
		return ts, Sign(key, method, path, ts, body)
	}

	cases := []struct {
		name   string
		offset time.Duration
		accept bool
	}{
		{"within past window", -(maxClockSkew - 30*time.Second), true},
		{"just past window", -(maxClockSkew + 30*time.Second), false},
		{"future within window (clock drift)", maxClockSkew - 30*time.Second, true},
		{"future beyond window", maxClockSkew + 30*time.Second, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ts, sig := sign(tc.offset)
			got := Verify(key, method, path, ts, sig, body)
			if got != tc.accept {
				t.Fatalf("Verify(offset=%s) = %v, want %v", tc.offset, got, tc.accept)
			}
		})
	}
}

func TestVerifyRejectsMalformedTimestamp(t *testing.T) {
	key := "k"
	sig := Sign(key, "POST", "/x", "not-a-number", nil)
	if Verify(key, "POST", "/x", "not-a-number", sig, nil) {
		t.Error("non-numeric timestamp accepted")
	}
}
