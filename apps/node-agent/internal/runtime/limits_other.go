//go:build !linux && !windows

package runtime

import "github.com/refxfrank/refxhosting/node-agent/internal/server"

// On platforms without a dedicated limiter (e.g. macOS dev machines), native
// hosting runs unconstrained. This keeps the agent buildable everywhere while
// the real resource control lives in limits_linux.go / limits_windows.go.
func newLimiter(_ string, _ server.Limits) (limiter, error) { return noopLimiter{}, nil }

func sampleProcess(_ int, _ limiter) (processSample, error) { return processSample{}, nil }
