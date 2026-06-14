//go:build windows

package stats

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	modkernel32 = windows.NewLazySystemDLL("kernel32.dll")

	procGetSystemTimes       = modkernel32.NewProc("GetSystemTimes")
	procGlobalMemoryStatusEx = modkernel32.NewProc("GlobalMemoryStatusEx")
)

// filetime mirrors the Win32 FILETIME structure: a 64-bit value split across two
// 32-bit words, counting 100-nanosecond intervals.
type filetime struct {
	low  uint32
	high uint32
}

func (f filetime) uint64() uint64 {
	return uint64(f.high)<<32 | uint64(f.low)
}

// memoryStatusEx mirrors the Win32 MEMORYSTATUSEX structure.
type memoryStatusEx struct {
	length               uint32
	memoryLoad           uint32
	totalPhys            uint64
	availPhys            uint64
	totalPageFile        uint64
	availPageFile        uint64
	totalVirtual         uint64
	availVirtual         uint64
	availExtendedVirtual uint64
}

// readCPUTimes calls GetSystemTimes, which reports cumulative idle, kernel, and
// user FILETIMEs since boot. Per Win32 docs, kernel time *includes* idle time,
// so total busy+idle = kernel + user, and idle is the idle component. Units are
// 100ns ticks; only the ratio of deltas matters (see cpu.go).
func readCPUTimes() (cpuTimes, bool) {
	var idle, kernel, user filetime
	r, _, _ := procGetSystemTimes.Call(
		uintptr(unsafe.Pointer(&idle)),
		uintptr(unsafe.Pointer(&kernel)),
		uintptr(unsafe.Pointer(&user)),
	)
	if r == 0 {
		return cpuTimes{}, false
	}
	total := kernel.uint64() + user.uint64()
	if total == 0 {
		return cpuTimes{}, false
	}
	return cpuTimes{total: total, idle: idle.uint64()}, true
}

// readMemory calls GlobalMemoryStatusEx and returns used/total physical memory
// in megabytes. Used is total-available, matching Task Manager.
func readMemory() (usedMB, totalMB int64) {
	var ms memoryStatusEx
	ms.length = uint32(unsafe.Sizeof(ms))
	r, _, _ := procGlobalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&ms)))
	if r == 0 || ms.totalPhys == 0 {
		return 0, 0
	}
	used := ms.totalPhys - ms.availPhys
	const mb = 1024 * 1024
	return int64(used / mb), int64(ms.totalPhys / mb)
}
