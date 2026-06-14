package panel

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"strconv"
	"time"
)

// maxClockSkew is how far an inbound request timestamp may drift before it is
// rejected as a replay.
const maxClockSkew = 5 * time.Minute

// Sign produces the canonical HMAC-SHA256 signature for a request. The panel and
// agent both compute it over the same canonical string so each side can verify
// the other. The body hash binds the signature to the exact payload.
//
// Canonical string: METHOD\nPATH\nTIMESTAMP\nSHA256(body)
func Sign(key, method, path, timestamp string, body []byte) string {
	bodyHash := sha256.Sum256(body)
	canonical := method + "\n" + path + "\n" + timestamp + "\n" + hex.EncodeToString(bodyHash[:])
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(canonical))
	return hex.EncodeToString(mac.Sum(nil))
}

// Verify checks an inbound signature in constant time and enforces the clock
// skew window to defeat replays.
func Verify(key, method, path, timestamp, signature string, body []byte) bool {
	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return false
	}
	if d := time.Since(time.Unix(ts, 0)); d > maxClockSkew || d < -maxClockSkew {
		return false
	}
	expected := Sign(key, method, path, timestamp, body)
	return subtle.ConstantTimeCompare([]byte(expected), []byte(signature)) == 1
}
