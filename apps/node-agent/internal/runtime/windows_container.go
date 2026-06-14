package runtime

import (
	"context"
	"time"

	"github.com/rs/zerolog"

	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

// WindowsContainerRuntime is a skeleton backend for hosting servers in Windows
// containers (process-isolated or Hyper-V isolated) on Windows Server hosts.
//
// It implements the same Runtime contract as Docker/Native so the Manager can
// route WINDOWS_CONTAINER deploys here transparently. The mechanics differ from
// the Linux Docker path: Windows containers require matching host/container OS
// builds, use HCS (Host Compute Service) under the hood, and have a distinct
// image ecosystem (mcr.microsoft.com/windows/servercore, etc.).
//
// Two implementation routes are viable; both are deferred:
//  1. Drive the Docker Engine running in Windows-container mode (same SDK as
//     DockerRuntime, different daemon configuration).
//  2. Talk to HCS directly via github.com/Microsoft/hcsshim for finer control.
type WindowsContainerRuntime struct {
	log zerolog.Logger
}

// NewWindowsContainerRuntime constructs the skeleton runtime.
func NewWindowsContainerRuntime(log zerolog.Logger) *WindowsContainerRuntime {
	return &WindowsContainerRuntime{log: log.With().Str("runtime", "windows-container").Logger()}
}

// Name implements Runtime.
func (w *WindowsContainerRuntime) Name() string { return "windows-container" }

func (w *WindowsContainerRuntime) Install(_ context.Context, s *server.Server) (<-chan InstallProgress, error) {
	ch := make(chan InstallProgress, 1)
	// TODO(impl): pull windows base image + run install via HCS/Docker-Windows.
	ch <- InstallProgress{Err: ErrNotImplemented}
	close(ch)
	return ch, nil
}

// TODO(impl): the methods below mirror DockerRuntime but target HCS/Windows
// containers. They are stubbed so the type satisfies Runtime today.

func (w *WindowsContainerRuntime) Start(context.Context, *server.Server) error {
	return ErrNotImplemented
}
func (w *WindowsContainerRuntime) Stop(context.Context, *server.Server, time.Duration) error {
	return ErrNotImplemented
}
func (w *WindowsContainerRuntime) Kill(context.Context, *server.Server) error {
	return ErrNotImplemented
}
func (w *WindowsContainerRuntime) Restart(context.Context, *server.Server, time.Duration) error {
	return ErrNotImplemented
}
func (w *WindowsContainerRuntime) AttachConsole(context.Context, *server.Server) (*Console, error) {
	return nil, ErrNotImplemented
}
func (w *WindowsContainerRuntime) Stats(context.Context, *server.Server) (Stats, error) {
	return Stats{State: server.StateOffline}, ErrNotImplemented
}
func (w *WindowsContainerRuntime) Reconfigure(context.Context, *server.Server, server.Limits) error {
	return ErrNotImplemented
}
func (w *WindowsContainerRuntime) Destroy(context.Context, *server.Server) error {
	return ErrNotImplemented
}

// Compile-time assertion that the skeleton satisfies the interface.
var _ Runtime = (*WindowsContainerRuntime)(nil)
