package sftp

import (
	"context"
	"crypto/subtle"
	"errors"
	"sync"
)

// errInvalidCredentials is returned for any failed SFTP login.
var errInvalidCredentials = errors.New("sftp: invalid credentials")

// Credential is a per-server SFTP login the panel issues. The username is the
// server shortId; the password is rotated on demand by the panel.
type Credential struct {
	Username string
	Password string // plaintext compared in constant time (panel-rotated)
	JailDir  string // absolute server data directory
}

// MemoryAuthenticator is an in-memory credential store the daemon keeps in sync
// with the panel. The panel pushes the current credential set (e.g. on the
// register handshake and whenever a password is rotated).
//
// It satisfies the Authenticator interface consumed by Server.
type MemoryAuthenticator struct {
	mu    sync.RWMutex
	creds map[string]Credential // keyed by username
}

// NewMemoryAuthenticator constructs an empty store.
func NewMemoryAuthenticator() *MemoryAuthenticator {
	return &MemoryAuthenticator{creds: make(map[string]Credential)}
}

// Upsert adds or replaces a credential.
func (a *MemoryAuthenticator) Upsert(c Credential) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.creds[c.Username] = c
}

// Remove deletes a credential.
func (a *MemoryAuthenticator) Remove(username string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	delete(a.creds, username)
}

// Authenticate validates a login and returns the jail directory.
func (a *MemoryAuthenticator) Authenticate(_ context.Context, username, password string) (string, error) {
	a.mu.RLock()
	c, ok := a.creds[username]
	a.mu.RUnlock()
	if !ok {
		return "", errInvalidCredentials
	}
	if subtle.ConstantTimeCompare([]byte(c.Password), []byte(password)) != 1 {
		return "", errInvalidCredentials
	}
	return c.JailDir, nil
}

var _ Authenticator = (*MemoryAuthenticator)(nil)
