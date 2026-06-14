package server

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/rs/zerolog"
)

// Installer coordinates the (re)installation of a server: preparing the data
// directory, delegating image/script execution to the runtime, and rendering
// config files. The heavy lifting (running the install script in a container or
// process) lives in the runtime layer; this type owns the filesystem prep and
// config templating that is identical across backends.
type Installer struct {
	log zerolog.Logger
}

// NewInstaller constructs an Installer.
func NewInstaller(log zerolog.Logger) *Installer {
	return &Installer{log: log.With().Str("component", "installer").Logger()}
}

// Prepare ensures the server data directory exists and is owned correctly before
// an install runs.
func (i *Installer) Prepare(s *Server) error {
	if err := os.MkdirAll(s.DataDir, 0o750); err != nil {
		return fmt.Errorf("installer: create data dir: %w", err)
	}
	return nil
}

// RenderConfigFiles writes the spec's config files into the data dir, applying
// {{VAR}} interpolation from the resolved environment. It is path-traversal safe
// and reused on reinstall / game switch.
func (i *Installer) RenderConfigFiles(s *Server) error {
	root := filepath.Clean(s.DataDir)
	for _, cf := range s.Spec.ConfigFiles {
		target := filepath.Join(root, filepath.Clean("/"+cf.Path))
		if target != root && !strings.HasPrefix(target, root+string(os.PathSeparator)) {
			i.log.Warn().Str("path", cf.Path).Msg("skipping config file outside data dir")
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o750); err != nil {
			return err
		}
		mode := os.FileMode(0o644)
		if cf.Mode != "" {
			if parsed, err := strconv.ParseUint(cf.Mode, 8, 32); err == nil {
				mode = os.FileMode(parsed)
			}
		}
		content := Interpolate(cf.Content, s.Spec.Env)
		if err := os.WriteFile(target, []byte(content), mode); err != nil {
			return fmt.Errorf("installer: write %s: %w", cf.Path, err)
		}
	}
	return nil
}

// Interpolate replaces {{VAR}} placeholders with environment values. Unknown
// placeholders are left intact so misconfiguration is observable.
func Interpolate(in string, env map[string]string) string {
	out := in
	for k, v := range env {
		out = strings.ReplaceAll(out, "{{"+k+"}}", v)
	}
	return out
}

// Wipe removes the contents of the data directory (used by reinstall when the
// panel requests a clean slate) while keeping the directory itself.
func (i *Installer) Wipe(ctx context.Context, s *Server) error {
	entries, err := os.ReadDir(s.DataDir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		if err := os.RemoveAll(filepath.Join(s.DataDir, e.Name())); err != nil {
			return err
		}
	}
	return nil
}
