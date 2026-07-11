//go:build windows

package runtime

import (
	"fmt"
	goruntime "runtime"
	"unsafe"

	"golang.org/x/sys/windows"

	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

// jobObjectLimiter implements limiter using a Windows Job Object. A Job Object
// is the native, kernel-enforced way to cap CPU, memory, and process count for a
// process and all of its children — the Windows analogue of a Linux cgroup.
type jobObjectLimiter struct {
	handle windows.Handle
	limits server.Limits
}

// newLimiter creates a Job Object configured with the given limits.
func newLimiter(serverID string, limits server.Limits) (limiter, error) {
	name, _ := windows.UTF16PtrFromString("refx-" + serverID)
	h, err := windows.CreateJobObject(nil, name)
	if err != nil {
		return noopLimiter{}, fmt.Errorf("create job object: %w", err)
	}
	l := &jobObjectLimiter{handle: h, limits: limits}
	if err := l.write(limits); err != nil {
		_ = windows.CloseHandle(h)
		return noopLimiter{}, err
	}
	return l, nil
}

// JOBOBJECT_EXTENDED_LIMIT_INFORMATION fields we care about. The structs in
// x/sys/windows cover the common cases; memory + process-count limits go through
// the extended limit information class.
func (l *jobObjectLimiter) write(limits server.Limits) error {
	var info windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION
	var flags uint32

	if limits.MemoryMB > 0 {
		flags |= windows.JOB_OBJECT_LIMIT_JOB_MEMORY
		info.JobMemoryLimit = uintptr(limits.MemoryMB) * 1024 * 1024
	}
	if limits.PidsLimit > 0 {
		flags |= windows.JOB_OBJECT_LIMIT_ACTIVE_PROCESS
		info.BasicLimitInformation.ActiveProcessLimit = uint32(limits.PidsLimit)
	}
	// Kill all child processes when the job handle closes — prevents orphans.
	flags |= windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	info.BasicLimitInformation.LimitFlags = flags

	if _, err := windows.SetInformationJobObject(
		l.handle,
		windows.JobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&info)),
		uint32(unsafe.Sizeof(info)),
	); err != nil {
		return fmt.Errorf("set job extended limits: %w", err)
	}

	// CPU rate control is a separate information class.
	if limits.CPUCores > 0 {
		if err := l.setCPURate(limits.CPUCores); err != nil {
			return err
		}
	}
	l.limits = limits
	return nil
}

// CPU rate-control constants/struct. x/sys/windows exposes the
// JobObjectCpuRateControlInformation class id but not the matching struct/flags,
// so we declare them here to match the Win32 SDK definitions.
const (
	jobObjectCPURateControlEnable  uint32 = 0x1
	jobObjectCPURateControlHardCap uint32 = 0x4
)

// jobObjectCPURateControlInformation mirrors
// JOBOBJECT_CPU_RATE_CONTROL_INFORMATION. The second field is a C union; for the
// hard-cap path it holds the CpuRate value (hundredths of a percent).
type jobObjectCPURateControlInformation struct {
	ControlFlags uint32
	CpuRate      uint32
}

// setCPURate caps CPU using the rate-control information class. The rate is a
// percentage of total machine CPU expressed in hundredths of a percent, so a
// plan's cores are scaled by the host's core count — 1 core on an 8-core host
// is 12.5% (1250). The cap is set at the burst allowance, not the sold cores
// (see cpuplan.go); job objects have no usable weight knob alongside a hard
// cap, so Windows gets ceiling-only enforcement.
func (l *jobObjectLimiter) setCPURate(cores float64) error {
	rate := jobObjectCPURateControlInformation{
		ControlFlags: jobObjectCPURateControlEnable | jobObjectCPURateControlHardCap,
	}
	host := float64(goruntime.NumCPU())
	if host <= 0 {
		host = 1
	}
	burst := cpuBurstCores(cores, host)
	pct := uint32(burst / host * 100 * 100) // machine fraction in hundredths of a %
	if pct == 0 {
		pct = 1
	}
	if pct > 10000 {
		pct = 10000
	}
	rate.CpuRate = pct

	if _, err := windows.SetInformationJobObject(
		l.handle,
		windows.JobObjectCpuRateControlInformation,
		uintptr(unsafe.Pointer(&rate)),
		uint32(unsafe.Sizeof(rate)),
	); err != nil {
		return fmt.Errorf("set job cpu rate: %w", err)
	}
	return nil
}

// Apply assigns the process (by PID) to the job object.
func (l *jobObjectLimiter) Apply(pid int) error {
	h, err := windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE, false, uint32(pid))
	if err != nil {
		return fmt.Errorf("open process %d: %w", pid, err)
	}
	defer windows.CloseHandle(h)
	if err := windows.AssignProcessToJobObject(l.handle, h); err != nil {
		return fmt.Errorf("assign process to job: %w", err)
	}
	return nil
}

func (l *jobObjectLimiter) Update(limits server.Limits) error { return l.write(limits) }

func (l *jobObjectLimiter) Destroy() error {
	if l.handle != 0 {
		return windows.CloseHandle(l.handle)
	}
	return nil
}

// sampleProcess reads accounting information from the job object.
func sampleProcess(_ int, lim limiter) (processSample, error) {
	l, ok := lim.(*jobObjectLimiter)
	if !ok || l.handle == 0 {
		return processSample{}, nil
	}
	// TODO(impl): query JOBOBJECT_BASIC_ACCOUNTING_INFORMATION for CPU time and
	// JOBOBJECT_EXTENDED_LIMIT_INFORMATION for PeakJobMemoryUsed to compute a
	// real sample. Returning a zero sample keeps stats flowing meanwhile.
	return processSample{}, nil
}
