//go:build windows

package main

import (
	"context"

	"golang.org/x/sys/windows/svc"
)

// windowsServiceName must match the service registered by install-node.ps1.
const windowsServiceName = "refx-agent"

// isWindowsService reports whether this process was launched by the Windows
// Service Control Manager (vs. run directly in a console).
func isWindowsService() bool {
	is, err := svc.IsWindowsService()
	return err == nil && is
}

// agentService adapts the agent to the Windows service-control protocol: it runs
// the normal agent (run) under a cancellable context and stops it cleanly when
// the SCM sends Stop/Shutdown.
type agentService struct{ cfgPath string }

func (s *agentService) Execute(_ []string, r <-chan svc.ChangeRequest, status chan<- svc.Status) (bool, uint32) {
	const accepts = svc.AcceptStop | svc.AcceptShutdown
	status <- svc.Status{State: svc.StartPending}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	runErr := make(chan error, 1)
	go func() { runErr <- run(ctx, s.cfgPath) }()

	status <- svc.Status{State: svc.Running, Accepts: accepts}
	for {
		select {
		case c := <-r:
			switch c.Cmd {
			case svc.Interrogate:
				status <- c.CurrentStatus
			case svc.Stop, svc.Shutdown:
				status <- svc.Status{State: svc.StopPending}
				cancel()
				<-runErr
				status <- svc.Status{State: svc.Stopped}
				return false, 0
			}
		case err := <-runErr:
			// The agent exited on its own (fatal error). Report stopped with a
			// non-zero exit so the SCM's restart action relaunches it.
			status <- svc.Status{State: svc.Stopped}
			if err != nil {
				return false, 1
			}
			return false, 0
		}
	}
}

// runWindowsService runs the agent under the Windows service control dispatcher.
func runWindowsService(cfgPath string) error {
	return svc.Run(windowsServiceName, &agentService{cfgPath: cfgPath})
}
