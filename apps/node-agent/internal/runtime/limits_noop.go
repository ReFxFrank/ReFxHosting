package runtime

import "github.com/refxfrank/refxhosting/node-agent/internal/server"

// noopLimiter satisfies limiter without enforcing anything. It is used when the
// host lacks cgroups v2 / Job Objects, so native servers still run (a warning is
// logged at the call site).
type noopLimiter struct{}

func (noopLimiter) Apply(int) error            { return nil }
func (noopLimiter) Update(server.Limits) error { return nil }
func (noopLimiter) Destroy() error             { return nil }
