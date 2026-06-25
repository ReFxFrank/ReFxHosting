package files

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveNeutralisesTraversal(t *testing.T) {
	root := filepath.Clean(t.TempDir())
	m, err := New(root)
	if err != nil {
		t.Fatal(err)
	}
	// `..` segments are absorbed by the leading-slash Clean idiom, so every
	// resolved path must stay within (or equal) the jail root rather than
	// escaping it.
	for _, p := range []string{"../etc/passwd", "../../x", "a/../../b", "/../../root"} {
		abs, err := m.resolve(p)
		if err != nil {
			continue // explicit rejection is also acceptable
		}
		if abs != root && !strings.HasPrefix(abs, root+string(os.PathSeparator)) {
			t.Errorf("path %q escaped jail: resolved to %q (root %q)", p, abs, root)
		}
	}
}

func TestResolveAllowsInside(t *testing.T) {
	root := t.TempDir()
	m, _ := New(root)
	abs, err := m.resolve("sub/dir/file.txt")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(abs, filepath.Clean(root)) {
		t.Errorf("resolved path %q escaped root %q", abs, root)
	}
}

// A symlink planted inside the jail (e.g. by the game process) whose target is
// outside the jail must NOT be followed for read or write — otherwise the file
// manager reads/overwrites arbitrary host files.
func TestResolveRejectsFinalComponentSymlinkEscape(t *testing.T) {
	root := filepath.Clean(t.TempDir())
	outside := filepath.Clean(t.TempDir())
	secret := filepath.Join(outside, "secret.txt")
	if err := os.WriteFile(secret, []byte("TOP-SECRET"), 0o600); err != nil {
		t.Fatal(err)
	}
	m, err := New(root)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(secret, filepath.Join(root, "link")); err != nil {
		t.Skipf("symlinks unsupported on this platform: %v", err)
	}

	if rc, err := m.Read("link"); err == nil {
		b, _ := io.ReadAll(rc)
		rc.Close()
		t.Fatalf("Read followed a symlink out of the jail; leaked %q", string(b))
	}
	if err := m.Write("link", strings.NewReader("PWNED")); err == nil {
		t.Fatal("Write followed a symlink out of the jail")
	}
	if b, _ := os.ReadFile(secret); string(b) != "TOP-SECRET" {
		t.Fatalf("outside file modified through symlink: %q", string(b))
	}
}

func TestListJailRoot(t *testing.T) {
	root := t.TempDir()
	m, _ := New(root)
	if err := m.Write("server.jar", strings.NewReader("x")); err != nil {
		t.Fatal(err)
	}
	if err := m.Mkdir("world"); err != nil {
		t.Fatal(err)
	}
	// Listing the jail root must succeed (regression: the symlink-parent check
	// used to reject "/" because Dir(root) lives above the jail).
	for _, p := range []string{"/", "", "."} {
		entries, err := m.List(p)
		if err != nil {
			t.Fatalf("List(%q) at jail root: %v", p, err)
		}
		if len(entries) != 2 {
			t.Errorf("List(%q): got %d entries, want 2", p, len(entries))
		}
	}
}

func TestWriteReadDelete(t *testing.T) {
	root := t.TempDir()
	m, _ := New(root)
	if err := m.Write("a/b.txt", strings.NewReader("hello")); err != nil {
		t.Fatal(err)
	}
	rc, err := m.Read("a/b.txt")
	if err != nil {
		t.Fatal(err)
	}
	defer rc.Close()
	buf := make([]byte, 5)
	_, _ = rc.Read(buf)
	if string(buf) != "hello" {
		t.Errorf("got %q", buf)
	}
	if err := m.Delete("a/b.txt"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "a", "b.txt")); !os.IsNotExist(err) {
		t.Error("file not deleted")
	}
}
