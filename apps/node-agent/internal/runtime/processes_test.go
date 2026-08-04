package runtime

import (
	"reflect"
	"testing"
)

func TestParseTop(t *testing.T) {
	cases := []struct {
		name   string
		titles []string
		rows   [][]string
		want   []ProcessInfo
	}{
		{
			// The preferred `-eo pid,ppid,pcpu,rss,etimes,args` request; procps
			// titles pcpu as %CPU and etimes as ELAPSED (raw seconds).
			name:   "eo column set",
			titles: []string{"PID", "PPID", "%CPU", "RSS", "ELAPSED", "ARGS"},
			rows: [][]string{
				{"1", "0", "3.2", "524288", "3723", "./srv -port 27015 +map ctf_2fort"},
				// RSS is KiB and converts by integer division: 1023 KiB -> 0 MiB.
				{"27", "1", "0.0", "1023", "90061", "bash refx-run.sh"},
			},
			want: []ProcessInfo{
				{PID: 1, PPID: 0, CPUPercent: 3.2, MemMB: 512, ElapsedSec: 3723, Command: "./srv -port 27015 +map ctf_2fort"},
				{PID: 27, PPID: 1, CPUPercent: 0, MemMB: 0, ElapsedSec: 90061, Command: "bash refx-run.sh"},
			},
		},
		{
			// busybox/-ef fallback: C (CPU) and TIME (cumulative CPU, not
			// elapsed) have no matching column names, so CPUPercent, MemMB and
			// ElapsedSec stay zero; the command comes from CMD.
			name:   "busybox -ef style",
			titles: []string{"UID", "PID", "PPID", "C", "STIME", "TTY", "TIME", "CMD"},
			rows: [][]string{
				{"root", "42", "1", "2", "10:00", "?", "00:00:03", "java -Xmx4G -jar server.jar"},
			},
			want: []ProcessInfo{
				{PID: 42, PPID: 1, Command: "java -Xmx4G -jar server.jar"},
			},
		},
		{
			name:   "PCPU and COMMAND spellings",
			titles: []string{"PID", "PCPU", "COMMAND"},
			rows:   [][]string{{"7", "12.5", "./ArmaReforgerServer -config server.json"}},
			want:   []ProcessInfo{{PID: 7, CPUPercent: 12.5, Command: "./ArmaReforgerServer -config server.json"}},
		},
		{
			name:   "CPU, ETIMES and ARGS spellings",
			titles: []string{"PID", "CPU", "ETIMES", "ARGS"},
			rows:   [][]string{{"8", "50", "77", "./srv"}},
			want:   []ProcessInfo{{PID: 8, CPUPercent: 50, ElapsedSec: 77, Command: "./srv"}},
		},
		{
			// A row with fewer cells than titles must not panic; columns whose
			// index is past the end of the row are treated as absent.
			name:   "row shorter than titles",
			titles: []string{"PID", "PPID", "%CPU", "RSS", "ELAPSED", "ARGS"},
			rows:   [][]string{{"123", "45"}},
			want:   []ProcessInfo{{PID: 123, PPID: 45}},
		},
		{
			// A row that yields PID 0 and an empty command is dropped.
			name:   "all-empty row is skipped",
			titles: []string{"PID", "PPID", "%CPU", "RSS", "ELAPSED", "ARGS"},
			rows: [][]string{
				{"", "", "", "", "", ""},
				{"9", "1", "0.0", "2048", "10", "sleep 10"},
			},
			want: []ProcessInfo{{PID: 9, PPID: 1, MemMB: 2, ElapsedSec: 10, Command: "sleep 10"}},
		},
		{
			// Titles are matched case-insensitively with surrounding whitespace
			// trimmed, and row cells are trimmed too.
			name:   "titles normalized for case and whitespace",
			titles: []string{" pid ", "Ppid", "%cpu ", " rss", "elapsed", " Args "},
			rows:   [][]string{{" 11 ", "1", " 1.5", "4096", "05:33", " ./game --headless "}},
			want:   []ProcessInfo{{PID: 11, PPID: 1, CPUPercent: 1.5, MemMB: 4, ElapsedSec: 333, Command: "./game --headless"}},
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := parseTop(c.titles, c.rows)
			if !reflect.DeepEqual(got, c.want) {
				t.Errorf("parseTop(%v, %v) = %#v, want %#v", c.titles, c.rows, got, c.want)
			}
		})
	}
}

func TestParseElapsed(t *testing.T) {
	cases := []struct {
		in   string
		want int64
	}{
		{"", 0},
		// etimes: raw seconds pass straight through.
		{"90061", 90061},
		// etime: [[dd-]hh:]mm:ss.
		{"05:33", 333},
		{"1:02:03", 3723},
		{"2-03:04:05", 183845},
		// Garbage in either the days or the clock part -> 0.
		{"abc", 0},
		{"1-xx:00", 0},
	}
	for _, c := range cases {
		if got := parseElapsed(c.in); got != c.want {
			t.Errorf("parseElapsed(%q) = %d, want %d", c.in, got, c.want)
		}
	}
}
