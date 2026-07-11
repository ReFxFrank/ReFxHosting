package backup

import (
	"context"
	"io"
	"os"
	"path/filepath"
)

// LocalStorage persists backups on the node's own filesystem.
type LocalStorage struct {
	dir string
}

// NewLocalStorage constructs a local backup store rooted at dir.
func NewLocalStorage(dir string) (*LocalStorage, error) {
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, err
	}
	return &LocalStorage{dir: dir}, nil
}

// Put writes the archive to disk and returns its absolute path.
func (l *LocalStorage) Put(_ context.Context, key string, r io.Reader, _ int64) (string, error) {
	dst := filepath.Join(l.dir, filepath.Base(key))
	f, err := os.Create(dst)
	if err != nil {
		return "", err
	}
	defer f.Close()
	if _, err := io.Copy(f, r); err != nil {
		return "", err
	}
	return dst, nil
}

// Get opens a local archive.
func (l *LocalStorage) Get(_ context.Context, location string) (io.ReadCloser, error) {
	return os.Open(location)
}

// Delete removes a local archive. Idempotent: a missing file is success — the
// panel deletes the DB row afterwards either way, and failing here would
// strand rows for archives that are already gone.
func (l *LocalStorage) Delete(_ context.Context, location string) error {
	err := os.Remove(location)
	if err != nil && os.IsNotExist(err) {
		return nil
	}
	return err
}

var _ Storage = (*LocalStorage)(nil)
