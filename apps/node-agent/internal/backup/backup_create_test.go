package backup

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/rs/zerolog"
)

// discardStorage is a Storage that drains the archive to /dev/null so Create can
// run end-to-end in a unit test without a real backend.
type discardStorage struct{}

func (discardStorage) Put(_ context.Context, key string, r io.Reader, _ int64) (string, error) {
	_, err := io.Copy(io.Discard, r)
	return "/discard/" + key, err
}
func (discardStorage) Get(context.Context, string) (io.ReadCloser, error) { return nil, nil }
func (discardStorage) Delete(context.Context, string) error               { return nil }

// A Proton/wine data dir contains dosdevices symlinks (e.g. `z: -> /`). The
// backup walk must record such a symlink WITHOUT following it — otherwise
// os.Open+io.Copy would read the entire host filesystem and fail the whole
// backup. This is the regression for offsite backups failing on the
// palworld-windows egg.
func TestCreateHandlesSymlinkToDirectory(t *testing.T) {
	dataDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dataDir, "Level.sav"), []byte("world"), 0o644); err != nil {
		t.Fatal(err)
	}
	// A symlink whose target is a directory (mimics wine's `z: -> /`).
	if err := os.Symlink(dataDir, filepath.Join(dataDir, "zdrive")); err != nil {
		t.Skipf("symlinks unavailable on this platform: %v", err)
	}

	m := New(zerolog.Nop(), discardStorage{}, nil, "local", t.TempDir())
	res, err := m.Create(context.Background(), "bk-symlink", dataDir, nil, nil, "local")
	if err != nil {
		t.Fatalf("Create failed on a data dir containing a symlink: %v", err)
	}
	if res == nil || res.SizeBytes == 0 {
		t.Fatalf("expected a non-empty archive, got %+v", res)
	}
}
