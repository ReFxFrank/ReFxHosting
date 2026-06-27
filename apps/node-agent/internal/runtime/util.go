package runtime

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

// decodeJSON decodes a single JSON value from r.
func decodeJSON(r io.Reader, v any) error {
	return json.NewDecoder(r).Decode(v)
}

// dirSizeMB returns the total size of a directory tree in megabytes. Errors are
// swallowed so stats collection never fails on a transient FS race.
func dirSizeMB(dir string) int64 {
	var total int64
	_ = filepath.Walk(dir, func(_ string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() {
			total += info.Size()
		}
		return nil
	})
	return total / (1024 * 1024)
}

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

// splitArgs splits a rendered command line into argv, honouring single and double
// quotes and backslash escapes the way a shell would — so a quoted argument with
// spaces (e.g. -servername="My Cool Server") survives as ONE token. The previous
// strings.Fields approach shredded such args on their internal whitespace, which
// silently mangled server names, passwords, and any other spaced startup value.
func splitArgs(s string) []string {
	var args []string
	var cur strings.Builder
	inSingle, inDouble, started := false, false, false
	flush := func() {
		if started {
			args = append(args, cur.String())
			cur.Reset()
			started = false
		}
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case inSingle:
			if c == '\'' {
				inSingle = false
			} else {
				cur.WriteByte(c)
			}
		case inDouble:
			switch {
			case c == '"':
				inDouble = false
			case c == '\\' && i+1 < len(s) && (s[i+1] == '"' || s[i+1] == '\\'):
				i++
				cur.WriteByte(s[i])
			default:
				cur.WriteByte(c)
			}
		case c == '\'':
			inSingle, started = true, true
		case c == '"':
			inDouble, started = true, true
		case c == '\\' && i+1 < len(s):
			i++
			cur.WriteByte(s[i])
			started = true
		case c == ' ' || c == '\t' || c == '\n' || c == '\r':
			flush()
		default:
			cur.WriteByte(c)
			started = true
		}
	}
	flush()
	return args
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
