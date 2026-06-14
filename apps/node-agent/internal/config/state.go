package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// persistedState is the subset of identity learned during registration that we
// write back to disk so subsequent boots don't need to re-register.
type persistedState struct {
	NodeID     string `json:"node_id"`
	SigningKey string `json:"signing_key"`
}

// loadState overlays a previously-persisted identity onto the config, unless the
// config already supplied one explicitly (explicit config wins).
func (c *Config) loadState() error {
	b, err := os.ReadFile(c.StateFile())
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read state file: %w", err)
	}
	var st persistedState
	if err := json.Unmarshal(b, &st); err != nil {
		return fmt.Errorf("parse state file: %w", err)
	}
	if c.NodeID == "" {
		c.NodeID = st.NodeID
	}
	if c.SigningKey == "" {
		c.SigningKey = st.SigningKey
	}
	return nil
}

// SaveState persists the node identity learned during registration.
func (c *Config) SaveState() error {
	if err := os.MkdirAll(c.DataDir, 0o750); err != nil {
		return fmt.Errorf("create data dir: %w", err)
	}
	b, err := json.MarshalIndent(persistedState{
		NodeID:     c.NodeID,
		SigningKey: c.SigningKey,
	}, "", "  ")
	if err != nil {
		return err
	}
	tmp := c.StateFile() + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return fmt.Errorf("write state file: %w", err)
	}
	return os.Rename(tmp, c.StateFile())
}

// EnsureDirs creates the agent's directory layout.
func (c *Config) EnsureDirs() error {
	for _, d := range []string{c.DataDir, c.ServersDir(), filepath.Join(c.DataDir, "tmp")} {
		if err := os.MkdirAll(d, 0o750); err != nil {
			return fmt.Errorf("mkdir %q: %w", d, err)
		}
	}
	if c.Backup.Driver == "local" && c.Backup.LocalDir != "" {
		if err := os.MkdirAll(c.Backup.LocalDir, 0o750); err != nil {
			return fmt.Errorf("mkdir backup dir: %w", err)
		}
	}
	return nil
}
