package runtime

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

// Regression for the catalog-wide config clobber: Pterodactyl-style
// {path, parser, find} configFiles entries decode with Content == "" (the
// agent implements no parser), and renderConfigFiles used to WRITE that empty
// content — truncating the game's primary config (PalWorldSettings.ini,
// server.properties, GameUserSettings.ini, ...) to zero bytes on every install
// and preserve-data reinstall. Empty-content entries must be skipped.
func TestRenderConfigFilesSkipsEmptyContent(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "Pal", "Saved", "Config", "LinuxServer", "PalWorldSettings.ini")
	if err := os.MkdirAll(filepath.Dir(cfgPath), 0o750); err != nil {
		t.Fatal(err)
	}
	customer := `[/Script/Pal.PalGameWorldSettings]
OptionSettings=(ServerName="Franks World",ExpRate=3.000000,AdminPassword="hunter22")`
	if err := os.WriteFile(cfgPath, []byte(customer), 0o644); err != nil {
		t.Fatal(err)
	}

	s := &server.Server{
		DataDir: dir,
		Spec: server.Spec{
			ConfigFiles: []server.ConfigFile{
				// What a {path, parser: "ini", find: {}} egg entry decodes to.
				{Path: "Pal/Saved/Config/LinuxServer/PalWorldSettings.ini", Content: ""},
				// A real content entry must still render (with interpolation).
				{Path: "refx-note.txt", Content: "port={{SERVER_PORT}}"},
			},
			Env: map[string]string{"SERVER_PORT": "25601"},
		},
	}

	if err := renderConfigFiles(dir, s); err != nil {
		t.Fatalf("renderConfigFiles: %v", err)
	}

	got, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != customer {
		t.Errorf("empty-content entry clobbered the customer config:\n got: %q\nwant: %q", got, customer)
	}

	note, err := os.ReadFile(filepath.Join(dir, "refx-note.txt"))
	if err != nil {
		t.Fatalf("content entry was not rendered: %v", err)
	}
	if string(note) != "port=25601" {
		t.Errorf("content entry rendered wrong: %q", note)
	}

	// And an empty-content entry must not create a file either.
	s.Spec.ConfigFiles = []server.ConfigFile{{Path: "should-not-exist.cfg", Content: ""}}
	if err := renderConfigFiles(dir, s); err != nil {
		t.Fatalf("renderConfigFiles: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "should-not-exist.cfg")); !os.IsNotExist(err) {
		t.Error("empty-content entry created a file")
	}
}
