package runtime

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

// psFormats are tried in order. The first asks the host's ps for exactly the
// columns we want; busybox and other trimmed-down ps builds reject `-eo`, so we
// fall back to plain `-ef` and finally to whatever the daemon's default is.
var psFormats = [][]string{
	{"-eo", "pid,ppid,pcpu,rss,etimes,args"},
	{"-ef"},
	nil,
}

// Processes lists the processes inside the container via the Docker daemon's
// top endpoint (`ps` executed against the container's PIDs). The column set
// varies with the host's ps, so results are matched by title rather than
// position and any column we can't find is simply left zero.
func (d *DockerRuntime) Processes(ctx context.Context, s *server.Server) ([]ProcessInfo, error) {
	var lastErr error
	for _, args := range psFormats {
		top, err := d.cli.ContainerTop(ctx, containerName(s), args)
		if err != nil {
			lastErr = err
			continue
		}
		return parseTop(top.Titles, top.Processes), nil
	}
	if lastErr != nil {
		return nil, fmt.Errorf("docker: top: %w", lastErr)
	}
	return nil, nil
}

// parseTop maps ps output onto ProcessInfo by column title. Titles differ
// between ps implementations (`%CPU` vs `PCPU`, `COMMAND` vs `CMD`, `ELAPSED`
// vs `ETIMES`), so each field accepts the spellings seen in practice.
func parseTop(titles []string, rows [][]string) []ProcessInfo {
	idx := make(map[string]int, len(titles))
	for i, t := range titles {
		idx[strings.ToUpper(strings.TrimSpace(t))] = i
	}
	pick := func(row []string, names ...string) string {
		for _, n := range names {
			if i, ok := idx[n]; ok && i < len(row) {
				return strings.TrimSpace(row[i])
			}
		}
		return ""
	}

	out := make([]ProcessInfo, 0, len(rows))
	for _, row := range rows {
		p := ProcessInfo{
			Command: pick(row, "COMMAND", "CMD", "ARGS"),
		}
		p.PID, _ = strconv.Atoi(pick(row, "PID"))
		p.PPID, _ = strconv.Atoi(pick(row, "PPID"))
		if v, err := strconv.ParseFloat(pick(row, "%CPU", "PCPU", "CPU"), 64); err == nil {
			p.CPUPercent = v
		}
		// RSS is in KiB.
		if v, err := strconv.ParseInt(pick(row, "RSS", "RSZ"), 10, 64); err == nil {
			p.MemMB = v / 1024
		}
		p.ElapsedSec = parseElapsed(pick(row, "ELAPSED", "ETIMES"))
		if p.PID == 0 && p.Command == "" {
			continue
		}
		out = append(out, p)
	}
	return out
}

// parseElapsed accepts either raw seconds (`etimes`) or ps's `[[dd-]hh:]mm:ss`
// elapsed format, returning 0 when it is neither.
func parseElapsed(raw string) int64 {
	if raw == "" {
		return 0
	}
	if secs, err := strconv.ParseInt(raw, 10, 64); err == nil {
		return secs
	}
	days := int64(0)
	if d, rest, ok := strings.Cut(raw, "-"); ok {
		v, err := strconv.ParseInt(d, 10, 64)
		if err != nil {
			return 0
		}
		days = v
		raw = rest
	}
	parts := strings.Split(raw, ":")
	total := int64(0)
	for _, part := range parts {
		v, err := strconv.ParseInt(part, 10, 64)
		if err != nil {
			return 0
		}
		total = total*60 + v
	}
	return days*86400 + total
}

// Processes reports the server's own process. The native backend tracks only
// the root process it started, so children (an Arma headless client, a wrapper
// script's helpers) are not enumerated here.
func (n *NativeRuntime) Processes(_ context.Context, s *server.Server) ([]ProcessInfo, error) {
	n.mu.Lock()
	p, ok := n.processes[s.ID()]
	n.mu.Unlock()
	if !ok || p.cmd == nil || p.cmd.Process == nil {
		return nil, nil
	}
	info := ProcessInfo{
		PID:     p.cmd.Process.Pid,
		Command: strings.Join(p.cmd.Args, " "),
	}
	if !p.startedAt.IsZero() {
		info.ElapsedSec = int64(time.Since(p.startedAt) / time.Second)
	}
	if sample, err := sampleProcess(p.cmd.Process.Pid, p.limiter); err == nil {
		info.CPUPercent = sample.cpuPercent
		info.MemMB = sample.memBytes / (1024 * 1024)
	}
	return []ProcessInfo{info}, nil
}

// Processes is not implemented for Windows containers (HCS process enumeration
// is part of the wider TODO on this backend).
func (w *WindowsContainerRuntime) Processes(context.Context, *server.Server) ([]ProcessInfo, error) {
	return nil, ErrNotImplemented
}

// Processes routes to the backend that owns the server.
func (m *Manager) Processes(ctx context.Context, s *server.Server) ([]ProcessInfo, error) {
	rt, err := m.RuntimeFor(s)
	if err != nil {
		return nil, err
	}
	return rt.Processes(ctx, s)
}
