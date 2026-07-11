// Package backup creates and restores server backups (tar.gz of the server data
// directory) and ships them to local storage or S3-compatible object storage,
// reporting progress back to the panel.
package backup

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/rs/zerolog"
)

// Storage abstracts where a backup archive is persisted. Implementations:
// localStorage and s3Storage.
type Storage interface {
	// Put streams an archive to storage and returns its location handle.
	Put(ctx context.Context, key string, r io.Reader, size int64) (location string, err error)
	// Get opens an archive for restore.
	Get(ctx context.Context, location string) (io.ReadCloser, error)
	// Delete removes an archive.
	Delete(ctx context.Context, location string) error
}

// ProgressFunc receives backup progress updates (0..1) for panel reporting.
type ProgressFunc func(pct float64, message string)

// Result describes a completed backup.
type Result struct {
	Location  string
	SizeBytes int64
	Checksum  string // sha256 hex
	// StorageKind is where the archive actually landed: "local" or "s3"
	// (an S3 request degrades to local when the node has no S3 config).
	StorageKind string
}

// Manager performs backup operations. It holds BOTH storage backends (local
// always; s3 when the node is configured for it) so the panel can route each
// backup per server — express plans go offsite, everyone else stays on disk.
type Manager struct {
	log     zerolog.Logger
	local   Storage
	s3      Storage // nil when the node has no S3 config
	defKind string  // "local" | "s3" — used when a request doesn't specify
	tmpDir  string
}

// New constructs a backup Manager. s3 may be nil; defKind selects the backend
// for requests that don't name one (legacy panels).
func New(log zerolog.Logger, local, s3 Storage, defKind string, tmpDir string) *Manager {
	if defKind != "s3" || s3 == nil {
		defKind = "local"
	}
	return &Manager{
		log:     log.With().Str("component", "backup").Logger(),
		local:   local,
		s3:      s3,
		defKind: defKind,
		tmpDir:  tmpDir,
	}
}

// storageFor resolves a requested kind ("local"/"s3"/"") to a backend, falling
// back to local when S3 was asked for but isn't configured on this node.
func (m *Manager) storageFor(kind string) (Storage, string) {
	switch strings.ToLower(kind) {
	case "s3":
		if m.s3 != nil {
			return m.s3, "s3"
		}
		return m.local, "local"
	case "local":
		return m.local, "local"
	default:
		if m.defKind == "s3" && m.s3 != nil {
			return m.s3, "s3"
		}
		return m.local, "local"
	}
}

// storageForLocation routes an EXISTING archive by its location shape: local
// locations are absolute filesystem paths; S3 locations are object keys. This
// keeps old rows working regardless of what the panel thinks their storage is.
func (m *Manager) storageForLocation(location string) Storage {
	if filepath.IsAbs(location) || strings.HasPrefix(location, "/") {
		return m.local
	}
	if m.s3 != nil {
		return m.s3
	}
	return m.local
}

// Create archives the server data dir into a tar.gz, computes its checksum, and
// uploads it. ignoredGlobs are matched against the data-dir-relative path.
func (m *Manager) Create(ctx context.Context, backupID, dataDir string, ignoredGlobs []string, progress ProgressFunc, kind string) (*Result, error) {
	if progress == nil {
		progress = func(float64, string) {}
	}
	progress(0, "starting backup")

	tmpFile := filepath.Join(m.tmpDir, backupID+".tar.gz")
	out, err := os.Create(tmpFile)
	if err != nil {
		return nil, fmt.Errorf("backup: create temp: %w", err)
	}
	defer os.Remove(tmpFile)
	defer out.Close()

	// Hash while writing so we never re-read the whole archive.
	hasher := sha256.New()
	mw := io.MultiWriter(out, hasher)
	gz := gzip.NewWriter(mw)
	tw := tar.NewWriter(gz)

	total := countFiles(dataDir)
	done := 0

	walkErr := filepath.Walk(dataDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		rel, _ := filepath.Rel(dataDir, path)
		if rel == "." {
			return nil
		}
		if isIgnored(rel, ignoredGlobs) {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		hdr, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		hdr.Name = filepath.ToSlash(rel)
		if err := tw.WriteHeader(hdr); err != nil {
			return err
		}
		if !info.IsDir() {
			f, err := os.Open(path)
			if err != nil {
				return err
			}
			defer f.Close()
			if _, err := io.Copy(tw, f); err != nil {
				return err
			}
			done++
			if total > 0 {
				progress(0.9*float64(done)/float64(total), "archiving "+rel)
			}
		}
		return nil
	})
	if walkErr != nil {
		_ = tw.Close()
		_ = gz.Close()
		return nil, fmt.Errorf("backup: archive: %w", walkErr)
	}
	if err := tw.Close(); err != nil {
		return nil, err
	}
	if err := gz.Close(); err != nil {
		return nil, err
	}
	if err := out.Sync(); err != nil {
		return nil, err
	}

	info, _ := out.Stat()
	if _, err := out.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}

	progress(0.92, "uploading")
	store, actual := m.storageFor(kind)
	key := fmt.Sprintf("backups/%s.tar.gz", backupID)
	location, err := store.Put(ctx, key, out, info.Size())
	if err != nil {
		return nil, fmt.Errorf("backup: upload: %w", err)
	}

	progress(1, "complete")
	return &Result{
		Location:    location,
		SizeBytes:   info.Size(),
		Checksum:    hex.EncodeToString(hasher.Sum(nil)),
		StorageKind: actual,
	}, nil
}

// Restore downloads an archive and extracts it into dataDir, overwriting files.
func (m *Manager) Restore(ctx context.Context, location, dataDir string, progress ProgressFunc) error {
	if progress == nil {
		progress = func(float64, string) {}
	}
	progress(0, "downloading backup")
	rc, err := m.storageForLocation(location).Get(ctx, location)
	if err != nil {
		return fmt.Errorf("backup: download: %w", err)
	}
	defer rc.Close()

	gz, err := gzip.NewReader(rc)
	if err != nil {
		return err
	}
	defer gz.Close()
	tr := tar.NewReader(gz)

	root := filepath.Clean(dataDir)
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		target := filepath.Join(root, filepath.Clean("/"+hdr.Name))
		// Jail extraction within dataDir.
		if target != root && !strings.HasPrefix(target, root+string(os.PathSeparator)) {
			continue
		}
		if hdr.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o750); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o750); err != nil {
			return err
		}
		f, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, os.FileMode(hdr.Mode))
		if err != nil {
			return err
		}
		if _, err := io.Copy(f, tr); err != nil { //nolint:gosec // jailed above
			f.Close()
			return err
		}
		f.Close()
	}
	progress(1, "restore complete")
	return nil
}

// Delete removes a stored backup.
func (m *Manager) Delete(ctx context.Context, location string) error {
	return m.storageForLocation(location).Delete(ctx, location)
}

// Open returns a reader over a stored backup archive for downloads.
func (m *Manager) Open(ctx context.Context, location string) (io.ReadCloser, error) {
	return m.storageForLocation(location).Get(ctx, location)
}

// Presigner is implemented by storages that can mint direct-download URLs
// (S3). Local storage can't — those downloads relay through the agent.
type Presigner interface {
	Presign(ctx context.Context, location string, ttl time.Duration) (string, error)
}

// PresignDownload returns a direct-download URL for the archive, or "" when
// the storage doesn't support presigning (the caller then falls back to
// relaying the bytes).
func (m *Manager) PresignDownload(ctx context.Context, location string, ttl time.Duration) (string, error) {
	p, ok := m.storageForLocation(location).(Presigner)
	if !ok {
		return "", nil
	}
	return p.Presign(ctx, location, ttl)
}

// DownloadURL returns a short-lived URL the panel/browser can use to fetch a
// completed backup archive identified by its storage location.
//
// TODO(impl): for S3-backed storage return a presigned GET URL (add a Presign
// method to the Storage interface); for local storage mint a signed single-use
// token served from an unauthenticated transfer route on the agent. For now the
// contract exists and echoes the storage location so the route is wired.
func (m *Manager) DownloadURL(_ context.Context, location string) (string, error) {
	return location, nil
}

// --- helpers ---------------------------------------------------------------

func countFiles(dir string) int {
	n := 0
	_ = filepath.Walk(dir, func(_ string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			n++
		}
		return nil
	})
	return n
}

func isIgnored(rel string, globs []string) bool {
	rel = filepath.ToSlash(rel)
	for _, g := range globs {
		if g == "" {
			continue
		}
		if ok, _ := filepath.Match(g, rel); ok {
			return true
		}
		// Also match a leading-directory prefix (e.g. "logs" ignores logs/*).
		if strings.HasPrefix(rel, strings.TrimSuffix(g, "/")+"/") {
			return true
		}
	}
	return false
}

var _ = time.Now // retained for future scheduled-backup timestamps
