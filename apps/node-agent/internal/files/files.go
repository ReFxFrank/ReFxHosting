// Package files implements a jailed file manager rooted at a single server's
// data directory. Every path the panel sends is resolved relative to the jail
// root and validated so a malicious or buggy request can never escape it
// (path-traversal safe), regardless of OS path semantics.
package files

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ErrTraversal is returned when a requested path escapes the jail root.
var ErrTraversal = errors.New("files: path escapes jail root")

// Manager provides jailed file operations for one server data directory.
type Manager struct {
	root string // absolute, cleaned jail root
}

// New constructs a Manager jailed to root.
func New(root string) (*Manager, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	return &Manager{root: filepath.Clean(abs)}, nil
}

// resolve maps a jail-relative path to an absolute filesystem path, rejecting
// any path that would escape the root. Symlinks pointing outside the jail are
// also rejected via EvalSymlinks on the parent.
func (m *Manager) resolve(rel string) (string, error) {
	clean := filepath.Clean("/" + strings.ReplaceAll(rel, "\\", "/"))
	abs := filepath.Join(m.root, strings.TrimPrefix(clean, "/"))
	if abs != m.root && !strings.HasPrefix(abs, m.root+string(os.PathSeparator)) {
		return "", ErrTraversal
	}
	// Defend against symlink escapes: the real parent must stay within the jail.
	// Skip this for the jail root itself — its parent legitimately lives *above*
	// the jail, so checking Dir(root) would wrongly reject listing "/".
	if abs != m.root {
		if parent, err := filepath.EvalSymlinks(filepath.Dir(abs)); err == nil {
			if parent != m.root && !strings.HasPrefix(parent, m.root+string(os.PathSeparator)) {
				return "", ErrTraversal
			}
		}
		// The parent check above does NOT cover the final component: if the leaf
		// is itself a symlink (e.g. planted by the game process), os.Open /
		// os.OpenFile would follow it out of the jail (read/write/truncate
		// arbitrary host files). Reject any final-component symlink — the file
		// manager never follows symlinks, matching the SFTP server which refuses
		// to create them. Lstat (not Stat) so the link itself is inspected; a
		// not-yet-existent leaf (new file) returns an error and is allowed.
		if fi, err := os.Lstat(abs); err == nil && fi.Mode()&os.ModeSymlink != 0 {
			return "", ErrTraversal
		}
	}
	return abs, nil
}

// Entry describes a single directory listing entry.
type Entry struct {
	Name     string    `json:"name"`
	Path     string    `json:"path"`
	Size     int64     `json:"size"`
	Mode     string    `json:"mode"`
	IsDir    bool      `json:"isDir"`
	Modified time.Time `json:"modified"`
}

// List returns the entries of a directory.
func (m *Manager) List(rel string) ([]Entry, error) {
	abs, err := m.resolve(rel)
	if err != nil {
		return nil, err
	}
	des, err := os.ReadDir(abs)
	if err != nil {
		return nil, err
	}
	out := make([]Entry, 0, len(des))
	for _, de := range des {
		info, err := de.Info()
		if err != nil {
			continue
		}
		out = append(out, Entry{
			Name:     de.Name(),
			Path:     filepath.ToSlash(filepath.Join(rel, de.Name())),
			Size:     info.Size(),
			Mode:     info.Mode().String(),
			IsDir:    de.IsDir(),
			Modified: info.ModTime(),
		})
	}
	return out, nil
}

// Read returns a reader for a file. The caller closes it.
func (m *Manager) Read(rel string) (io.ReadCloser, error) {
	abs, err := m.resolve(rel)
	if err != nil {
		return nil, err
	}
	return os.Open(abs)
}

// Write creates/overwrites a file from r, creating parent directories.
func (m *Manager) Write(rel string, r io.Reader) error {
	abs, err := m.resolve(rel)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o750); err != nil {
		return err
	}
	f, err := os.OpenFile(abs, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o640)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, r)
	return err
}

// Mkdir creates a directory (and parents).
func (m *Manager) Mkdir(rel string) error {
	abs, err := m.resolve(rel)
	if err != nil {
		return err
	}
	return os.MkdirAll(abs, 0o750)
}

// Delete removes a file or directory tree.
func (m *Manager) Delete(rel string) error {
	abs, err := m.resolve(rel)
	if err != nil {
		return err
	}
	if abs == m.root {
		return errors.New("files: refusing to delete jail root")
	}
	return os.RemoveAll(abs)
}

// Rename moves src to dst, both jailed.
func (m *Manager) Rename(srcRel, dstRel string) error {
	src, err := m.resolve(srcRel)
	if err != nil {
		return err
	}
	dst, err := m.resolve(dstRel)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o750); err != nil {
		return err
	}
	return os.Rename(src, dst)
}

// Chmod sets a file's mode (no-op semantics on Windows for permission bits).
func (m *Manager) Chmod(rel string, mode os.FileMode) error {
	abs, err := m.resolve(rel)
	if err != nil {
		return err
	}
	return os.Chmod(abs, mode)
}

// CompressZip writes a zip archive of the given paths to dst (all jailed).
func (m *Manager) CompressZip(dstRel string, srcRels []string) error {
	dst, err := m.resolve(dstRel)
	if err != nil {
		return err
	}
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	zw := zip.NewWriter(out)
	defer zw.Close()

	for _, srcRel := range srcRels {
		src, err := m.resolve(srcRel)
		if err != nil {
			return err
		}
		base := filepath.Dir(src)
		walkErr := filepath.Walk(src, func(p string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			if info.IsDir() {
				return nil
			}
			name, _ := filepath.Rel(base, p)
			w, err := zw.Create(filepath.ToSlash(name))
			if err != nil {
				return err
			}
			f, err := os.Open(p)
			if err != nil {
				return err
			}
			defer f.Close()
			_, err = io.Copy(w, f)
			return err
		})
		if walkErr != nil {
			return walkErr
		}
	}
	return nil
}

// ExtractArchive extracts a .zip or .tar.gz archive (jailed) into destRel.
func (m *Manager) ExtractArchive(srcRel, destRel string) error {
	src, err := m.resolve(srcRel)
	if err != nil {
		return err
	}
	if _, err := m.resolve(destRel); err != nil {
		return err
	}
	lower := strings.ToLower(src)
	switch {
	case strings.HasSuffix(lower, ".zip"):
		return m.extractZip(src, destRel)
	case strings.HasSuffix(lower, ".tar.gz"), strings.HasSuffix(lower, ".tgz"):
		return m.extractTarGz(src, destRel)
	default:
		return fmt.Errorf("files: unsupported archive type: %s", src)
	}
}

func (m *Manager) extractZip(src, destRel string) error {
	zr, err := zip.OpenReader(src)
	if err != nil {
		return err
	}
	defer zr.Close()
	for _, f := range zr.File {
		target := filepath.Join(destRel, f.Name)
		if f.FileInfo().IsDir() {
			if err := m.Mkdir(target); err != nil {
				return err
			}
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		err = m.Write(target, rc) // Write re-validates the jail for every entry
		rc.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func (m *Manager) extractTarGz(src, destRel string) error {
	f, err := os.Open(src)
	if err != nil {
		return err
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return err
		}
		target := filepath.Join(destRel, hdr.Name)
		if hdr.FileInfo().IsDir() {
			if err := m.Mkdir(target); err != nil {
				return err
			}
			continue
		}
		if err := m.Write(target, tr); err != nil {
			return err
		}
	}
	return nil
}
