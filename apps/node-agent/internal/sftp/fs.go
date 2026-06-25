package sftp

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/pkg/sftp"
)

// errEscape is returned for any request whose resolved path leaves the jail.
var errEscape = errors.New("sftp: path escapes jail")

// newJailedHandlers builds a sftp.Handlers set rooted at jail. Every SFTP
// request path is treated as absolute within the jail and validated, so clients
// cannot traverse outside their server data dir.
func newJailedHandlers(jail string) sftp.Handlers {
	fs := &jailedFS{root: filepath.Clean(jail)}
	return sftp.Handlers{
		FileGet:  fs,
		FilePut:  fs,
		FileCmd:  fs,
		FileList: fs,
	}
}

type jailedFS struct {
	root string
}

// abs maps an SFTP (always slash, always absolute) path into the jail and
// rejects traversal.
func (f *jailedFS) abs(p string) (string, error) {
	clean := filepath.Clean("/" + strings.TrimPrefix(p, "/"))
	abs := filepath.Join(f.root, filepath.FromSlash(clean))
	if abs != f.root && !strings.HasPrefix(abs, f.root+string(os.PathSeparator)) {
		return "", errEscape
	}
	if abs != f.root {
		// Reject symlink escapes. The game process can plant a symlink on the
		// volume; without this, Fileread/Filewrite would follow it to read/write
		// host files outside the jail. Check the parent's real path AND reject a
		// final-component symlink (the SFTP server never follows symlinks; it also
		// refuses to create them). A not-yet-existent leaf (new file) is allowed.
		if parent, err := filepath.EvalSymlinks(filepath.Dir(abs)); err == nil {
			if parent != f.root && !strings.HasPrefix(parent, f.root+string(os.PathSeparator)) {
				return "", errEscape
			}
		}
		if fi, err := os.Lstat(abs); err == nil && fi.Mode()&os.ModeSymlink != 0 {
			return "", errEscape
		}
	}
	return abs, nil
}

// Filereader implements FileGet.
func (f *jailedFS) Fileread(r *sftp.Request) (io.ReaderAt, error) {
	p, err := f.abs(r.Filepath)
	if err != nil {
		return nil, err
	}
	return os.OpenFile(p, os.O_RDONLY, 0)
}

// Filewrite implements FilePut.
func (f *jailedFS) Filewrite(r *sftp.Request) (io.WriterAt, error) {
	p, err := f.abs(r.Filepath)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o750); err != nil {
		return nil, err
	}
	return os.OpenFile(p, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o640)
}

// Filecmd implements FileCmd (mkdir/remove/rename/setstat).
func (f *jailedFS) Filecmd(r *sftp.Request) error {
	p, err := f.abs(r.Filepath)
	if err != nil {
		return err
	}
	switch r.Method {
	case "Mkdir":
		return os.MkdirAll(p, 0o750)
	case "Rmdir", "Remove":
		return os.RemoveAll(p)
	case "Rename":
		t, err := f.abs(r.Target)
		if err != nil {
			return err
		}
		return os.Rename(p, t)
	case "Setstat":
		if r.Attributes().FileMode() != 0 {
			return os.Chmod(p, r.Attributes().FileMode())
		}
		return nil
	default:
		return sftp.ErrSSHFxOpUnsupported
	}
}

// Filelist implements FileList (List/Stat/Readlink).
func (f *jailedFS) Filelist(r *sftp.Request) (sftp.ListerAt, error) {
	p, err := f.abs(r.Filepath)
	if err != nil {
		return nil, err
	}
	switch r.Method {
	case "List":
		des, err := os.ReadDir(p)
		if err != nil {
			return nil, err
		}
		infos := make([]os.FileInfo, 0, len(des))
		for _, de := range des {
			if info, err := de.Info(); err == nil {
				infos = append(infos, info)
			}
		}
		return listerAt(infos), nil
	case "Stat":
		info, err := os.Stat(p)
		if err != nil {
			return nil, err
		}
		return listerAt{info}, nil
	default:
		return nil, sftp.ErrSSHFxOpUnsupported
	}
}

// listerAt adapts a slice of FileInfo to sftp.ListerAt.
type listerAt []os.FileInfo

func (l listerAt) ListAt(out []os.FileInfo, offset int64) (int, error) {
	if offset >= int64(len(l)) {
		return 0, io.EOF
	}
	n := copy(out, l[offset:])
	if n < len(out) {
		return n, io.EOF
	}
	return n, nil
}
