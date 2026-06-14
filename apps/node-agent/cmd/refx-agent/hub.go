package main

import (
	"github.com/rs/zerolog"

	"github.com/refxfrank/refxhosting/node-agent/internal/runtime"
	"github.com/refxfrank/refxhosting/node-agent/internal/ws"
)

// newHub builds the WebSocket hub. The runtime.Manager satisfies ws.Controller,
// so the hub can drive console attach, power actions, and stats without knowing
// which backend hosts a given server.
func newHub(log zerolog.Logger, mgr *runtime.Manager, signingKey string) *ws.Hub {
	return ws.NewHub(log, mgr, signingKey)
}
