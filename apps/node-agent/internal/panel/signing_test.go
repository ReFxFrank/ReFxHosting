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
