//go:build linux

package osabstraction

import (
	"os"
	"os/exec"
	"syscall"
)

func shell() (string, string) { return "/bin/sh", "-c" }

// setProcessGroup puts the child in its own process group so signals can target
// the whole tree (negative PID).
func setProcessGroup(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.Setpgid = true
}

// killProcessGroup sends SIGKILL to the entire process group.
func killProcessGroup(p *os.Process) error {
	if p == nil {
		return os.ErrProcessDone
	}
	// Negative pid targets the process group led by p.Pid.
	return syscall.Kill(-p.Pid, syscall.SIGKILL)
}

func defaultDataDir() string { return "/var/lib/refx-agent" }

func execName(base string) string { return base }

func isExecutable(info os.FileInfo) bool {
	return info.Mode()&0o111 != 0
}

// toSyscall maps a portable StopSignal onto a POSIX signal.
func (s StopSignal) toSyscall() syscall.Signal {
	switch s {
	case SignalInt:
		return syscall.SIGINT
	default:
		return syscall.SIGTERM
	}
}

// SignalProcess delivers a graceful stop signal to a running OS process.
func SignalProcess(p *os.Process, s StopSignal) error {
	if p == nil {
		return os.ErrProcessDone
	}
	return p.Signal(s.toSyscall())
}

func detectCapabilities() Capabilities {
	c := Capabilities{OS: "linux"}
	// cgroups v2 mounts a unified hierarchy at /sys/fs/cgroup with a
	// cgroup.controllers file at the root.
	if _, err := os.Stat("/sys/fs/cgroup/cgroup.controllers"); err == nil {
		c.CgroupsV2 = true
	}
	if _, err := os.Stat("/var/run/docker.sock"); err == nil {
		c.DockerAvailable = true
	}
	return c
}
