package runtime

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

func secondsDur(s, fallback int) time.Duration {
	if s <= 0 {
		return time.Duration(fallback) * time.Second
	}
	return time.Duration(s) * time.Second
}

// renderTemplate replaces {{VAR}} placeholders with values from env. Unknown
// placeholders are left intact so misconfiguration is visible rather than
// silently blanked.
func renderTemplate(in string, env map[string]string) string {
	out := in
	for k, v := range env {
		out = strings.ReplaceAll(out, "{{"+k+"}}", v)
	}
	return out
}

// renderConfigFiles writes the spec's config files into the data dir, applying
// {{VAR}} interpolation. Paths are cleaned and confined to dataDir.
func renderConfigFiles(dataDir string, s *server.Server) error {
	for _, cf := range s.Spec.ConfigFiles {
		rel := filepath.Clean("/" + cf.Path) // force-absolute then trim leading slash
		target := filepath.Join(dataDir, strings.TrimPrefix(rel, string(os.PathSeparator)))
		if !strings.HasPrefix(target, filepath.Clean(dataDir)+string(os.PathSeparator)) && target != dataDir {
			continue // path traversal attempt; skip
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
		content := renderTemplate(cf.Content, s.Spec.Env)
		if err := os.WriteFile(target, []byte(content), mode); err != nil {
			return err
		}
	}
	return nil
}

// envSlice converts the spec env map into KEY=VALUE form for os/exec & Docker.
func envSlice(env map[string]string) []string {
	out := make([]string, 0, len(env))
	for k, v := range env {
		out = append(out, k+"="+v)
	}
	return out
}
