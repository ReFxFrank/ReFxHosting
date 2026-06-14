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

// Delete removes a local archive.
func (l *LocalStorage) Delete(_ context.Context, location string) error {
	return os.Remove(location)
}

var _ Storage = (*LocalStorage)(nil)
