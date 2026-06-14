//go:build linux

package stats

import (
	"bufio"
	"io"
	"os"
	"strconv"
	"strings"
)

// readCPUTimes parses the aggregate "cpu" line of /proc/stat.
func readCPUTimes() (cpuTimes, bool) {
	f, err := os.Open("/proc/stat")
	if err != nil {
		return cpuTimes{}, false
	}
	defer f.Close()
	return parseProcStat(f)
}

// parseProcStat reads the aggregate "cpu" line from a /proc/stat-formatted
// stream. Fields are, in order: user nice system idle iowait irq softirq steal
// guest guest_nice (all in USER_HZ jiffies). idle counts idle+iowait; everything
// sums to total. Split out from readCPUTimes so the delta math can be tested with
// synthetic samples (no real /proc needed).
func parseProcStat(r io.Reader) (cpuTimes, bool) {
	sc := bufio.NewScanner(r)
	for sc.Scan() {
		line := sc.Text()
		if !strings.HasPrefix(line, "cpu ") {
			continue
		}
		fields := strings.Fields(line)[1:] // drop the "cpu" label
		var total, idle uint64
		for i, fld := range fields {
			v, err := strconv.ParseUint(fld, 10, 64)
			if err != nil {
				continue
			}
			total += v
			// index 3 = idle, index 4 = iowait
			if i == 3 || i == 4 {
				idle += v
			}
		}
		if total == 0 {
			return cpuTimes{}, false
		}
		return cpuTimes{total: total, idle: idle}, true
	}
	return cpuTimes{}, false
}

// readMemory parses /proc/meminfo and returns used/total in megabytes. "Used" is
// MemTotal-MemAvailable, matching the figure tools like `free` report, so cache
// reclaimable memory is not counted as used.
func readMemory() (usedMB, totalMB int64) {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0, 0
	}
	defer f.Close()

	var totalKB, availKB, freeKB int64
	haveAvail := false
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		fields := strings.Fields(sc.Text())
		if len(fields) < 2 {
			continue
		}
		v, err := strconv.ParseInt(fields[1], 10, 64) // value is in kB
		if err != nil {
			continue
		}
		switch fields[0] {
		case "MemTotal:":
			totalKB = v
		case "MemAvailable:":
			availKB = v
			haveAvail = true
		case "MemFree:":
			freeKB = v
		}
	}
	if totalKB == 0 {
		return 0, 0
	}
	usedKB := totalKB - availKB
	if !haveAvail {
		// Older kernels without MemAvailable: fall back to MemFree.
		usedKB = totalKB - freeKB
	}
	if usedKB < 0 {
		usedKB = 0
	}
	return usedKB / 1024, totalKB / 1024
}
