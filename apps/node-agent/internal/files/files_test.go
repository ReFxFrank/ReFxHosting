package files

import (
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
