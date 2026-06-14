// Package stats collects per-server and node-level metrics on an interval and
// pushes them to the panel (heartbeat + stat batches).
package stats

import (
	"context"
	"time"

	"github.com/rs/zerolog"

	"github.com/refxfrank/refxhosting/node-agent/internal/panel"
	rt "github.com/refxfrank/refxhosting/node-agent/internal/runtime"
	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

// Collector samples servers via the runtime Manager and reports to the panel.
type Collector struct {
	log     zerolog.Logger
	mgr     Manager
	client  *panel.Client
	nodeID  string
	version string

	host *HostSampler

	statInterval time.Duration
	hbInterval   time.Duration
}

// Manager is the subset of runtime.Manager the collector depends on.
type Manager interface {
	List() []*server.Server
	Stats(ctx context.Context, s *server.Server) (rt.Stats, error)
}

// Options configure a Collector.
type Options struct {
	Logger            zerolog.Logger
	Manager           Manager
	Client            *panel.Client
	NodeID            string
	Version           string
	StatInterval      time.Duration
	HeartbeatInterval time.Duration
}

// New constructs a Collector.
func New(opts Options) *Collector {
	if opts.StatInterval == 0 {
		opts.StatInterval = 5 * time.Second
	}
	if opts.HeartbeatInterval == 0 {
		opts.HeartbeatInterval = 15 * time.Second
	}
	return &Collector{
		log:          opts.Logger.With().Str("component", "stats").Logger(),
		mgr:          opts.Manager,
		client:       opts.Client,
		nodeID:       opts.NodeID,
		version:      opts.Version,
		host:         NewHostSampler(),
		statInterval: opts.StatInterval,
		hbInterval:   opts.HeartbeatInterval,
	}
}

// Run drives the collection loops until ctx is cancelled.
func (c *Collector) Run(ctx context.Context) {
	statTicker := time.NewTicker(c.statInterval)
	hbTicker := time.NewTicker(c.hbInterval)
	defer statTicker.Stop()
	defer hbTicker.Stop()

	c.log.Info().Dur("stat_interval", c.statInterval).Dur("hb_interval", c.hbInterval).Msg("stats collector started")
	// Prime the host CPU sampler so the first heartbeat reports a real delta
	// rather than 0% (CPU% is computed between successive samples).
	c.host.Sample()
	for {
		select {
		case <-ctx.Done():
			return
		case <-statTicker.C:
			c.collectAndPush(ctx)
		case <-hbTicker.C:
			c.heartbeat(ctx)
		}
	}
}

// collectAndPush gathers per-server stats and ships them in one batch.
func (c *Collector) collectAndPush(ctx context.Context) {
	servers := c.mgr.List()
	batch := make([]panel.ServerStat, 0, len(servers))
	for _, s := range servers {
		st, err := c.mgr.Stats(ctx, s)
		if err != nil {
			c.log.Debug().Err(err).Str("server", s.ID()).Msg("stats sample failed")
			continue
		}
		batch = append(batch, panel.ServerStat{
			ServerID:   s.ID(),
			CPUPct:     st.CPUPercent,
			MemUsedMB:  st.MemUsedMB,
			DiskUsedMB: st.DiskUsedMB,
			NetRxBytes: st.NetRxBytes,
			NetTxBytes: st.NetTxBytes,
			State:      string(st.State),
		})
	}
	if len(batch) == 0 {
		return
	}
	if err := c.client.PushStats(ctx, batch); err != nil {
		c.log.Warn().Err(err).Msg("push stats failed")
	}
}

// heartbeat reports node-level health.
func (c *Collector) heartbeat(ctx context.Context) {
	servers := c.mgr.List()
	var memUsed, diskUsed, rx, tx int64
	running := 0
	for _, s := range servers {
		st, err := c.mgr.Stats(ctx, s)
		if err != nil {
			continue
		}
		memUsed += st.MemUsedMB
		diskUsed += st.DiskUsedMB
		rx += st.NetRxBytes
		tx += st.NetTxBytes
		if st.State == server.StateRunning {
			running++
		}
	}

	// Host-level CPU is sampled from /proc/stat (Linux) or GetSystemTimes
	// (Windows); memory falls back to the host figure when no servers report.
	host := c.host.Sample()
	if memUsed == 0 {
		memUsed = host.MemUsedMB
	}

	hb := panel.Heartbeat{
		NodeID:       c.nodeID,
		CPUPct:       host.CPUPercent,
		MemUsedMB:    memUsed,
		DiskUsedMB:   diskUsed,
		NetRxBytes:   rx,
		NetTxBytes:   tx,
		Containers:   running,
		AgentVersion: c.version,
	}
	if err := c.client.SendHeartbeat(ctx, hb); err != nil {
		c.log.Warn().Err(err).Msg("heartbeat failed")
	}
}
