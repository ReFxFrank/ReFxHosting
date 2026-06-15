// Package panel is the agent's client for talking back to the central NestJS
// panel: registration, heartbeats, stat/log push, and verifying that inbound
// control requests are genuinely signed by the panel.
package panel

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/rs/zerolog"

	"github.com/refxfrank/refxhosting/node-agent/internal/osabstraction"
	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

// Client talks to the panel API.
type Client struct {
	log     zerolog.Logger
	http    *http.Client
	baseURL string

	nodeID     string
	signingKey string // HMAC key shared with the panel after registration
}

// Options configure a panel Client.
type Options struct {
	Logger        zerolog.Logger
	BaseURL       string
	NodeID        string
	SigningKey    string
	Timeout       time.Duration
	SkipTLSVerify bool
}

// New builds a panel client.
func New(opts Options) *Client {
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: opts.SkipTLSVerify}, //nolint:gosec // dev opt-in
	}
	if opts.Timeout == 0 {
		opts.Timeout = 30 * time.Second
	}
	return &Client{
		log:        opts.Logger.With().Str("component", "panel-client").Logger(),
		http:       &http.Client{Timeout: opts.Timeout, Transport: tr},
		baseURL:    opts.BaseURL,
		nodeID:     opts.NodeID,
		signingKey: opts.SigningKey,
	}
}

// SigningKey returns the HMAC key used to verify inbound panel requests.
func (c *Client) SigningKey() string { return c.signingKey }

// NodeID returns the registered node id.
func (c *Client) NodeID() string { return c.nodeID }

// --- Registration ----------------------------------------------------------

// RegisterRequest is sent on first boot using the one-time bootstrap token.
type RegisterRequest struct {
	BootstrapToken string                     `json:"bootstrapToken"`
	AgentVersion   string                     `json:"agentVersion"`
	Capabilities   osabstraction.Capabilities `json:"capabilities"`
	// TLSFingerprint lets the panel pin the agent's self-signed cert.
	TLSFingerprint string `json:"tlsFingerprint,omitempty"`
}

// RegisterResponse is the panel's reply: the durable node identity + signing key.
type RegisterResponse struct {
	NodeID     string `json:"nodeId"`
	SigningKey string `json:"signingKey"`
	// Servers is the initial set of servers assigned to this node, in the
	// panel's ServerInstallSpec shape (see ServerInstallSpec).
	Servers []ServerInstallSpec `json:"servers"`
}

// ServerInstallSpec is the panel's wire representation of a server assigned to
// this node. It is the payload of both the register/assign response and the
// per-server assign push. It mirrors the panel's ServerInstallSpec DTO and is
// converted to the agent's internal server.Spec via ToSpec.
//
// SFTP credentials travel alongside the spec so the agent can populate its SFTP
// authenticator without a second round-trip.
type ServerInstallSpec struct {
	ServerID       string               `json:"serverId"`
	ShortID        string               `json:"shortId"`
	DeployMethod   string               `json:"deployMethod"`
	DockerImage    string               `json:"dockerImage"`
	StartupCommand string               `json:"startupCommand"`
	StartupDetect  string               `json:"startupDetect,omitempty"`
	StopCommand    string               `json:"stopCommand,omitempty"`
	Environment    map[string]string    `json:"environment"`
	Limits         server.Limits        `json:"limits"`
	Allocations    []server.Allocation  `json:"allocations"`
	InstallScript  server.InstallScript `json:"installScript"`
	ConfigFiles    []server.ConfigFile  `json:"configFiles,omitempty"`
	// PreserveData asks a reinstall to keep existing files (skip wipe).
	PreserveData bool `json:"preserveData"`

	// SFTP credentials the panel issues for this server.
	SFTPUsername string `json:"sftpUsername"`
	SFTPPassword string `json:"sftpPassword"`
}

// ToSpec converts the panel DTO into the agent's internal server.Spec. The SFTP
// credentials are intentionally left out of the Spec (they live in the SFTP
// authenticator); callers read them directly off the DTO.
func (s ServerInstallSpec) ToSpec() server.Spec {
	env := s.Environment
	if env == nil {
		env = map[string]string{}
	}
	return server.Spec{
		ID:             s.ServerID,
		ShortID:        s.ShortID,
		DeployMethod:   server.DeployMethod(s.DeployMethod),
		Image:          s.DockerImage,
		StartupCommand: s.StartupCommand,
		StartupDetect:  s.StartupDetect,
		StopCommand:    s.StopCommand,
		Env:            env,
		Limits:         s.Limits,
		Allocations:    s.Allocations,
		Install:        s.InstallScript,
		ConfigFiles:    s.ConfigFiles,
	}
}

// Register completes the handshake. On success the client adopts the returned
// node id + signing key for all subsequent signed calls.
func (c *Client) Register(ctx context.Context, req RegisterRequest) (*RegisterResponse, error) {
	var resp RegisterResponse
	if err := c.do(ctx, http.MethodPost, "/api/v1/agent/register", req, &resp, false); err != nil {
		return nil, fmt.Errorf("panel: register: %w", err)
	}
	c.nodeID = resp.NodeID
	c.signingKey = resp.SigningKey
	c.log.Info().Str("node", resp.NodeID).Msg("registered with panel")
	return &resp, nil
}

// --- Heartbeat / telemetry -------------------------------------------------

// Heartbeat is the periodic node-level health report.
type Heartbeat struct {
	NodeID       string  `json:"nodeId"`
	CPUPct       float64 `json:"cpuPct"`
	MemUsedMB    int64   `json:"memUsedMb"`
	DiskUsedMB   int64   `json:"diskUsedMb"`
	NetRxBytes   int64   `json:"netRxBytes"`
	NetTxBytes   int64   `json:"netTxBytes"`
	Containers   int     `json:"containers"`
	AgentVersion string  `json:"agentVersion"`
}

// SendHeartbeat pushes a node heartbeat.
func (c *Client) SendHeartbeat(ctx context.Context, hb Heartbeat) error {
	return c.do(ctx, http.MethodPost, "/api/v1/agent/heartbeat", hb, nil, true)
}

// ServerStat is a single per-server stat sample pushed to the panel.
type ServerStat struct {
	ServerID   string  `json:"serverId"`
	CPUPct     float64 `json:"cpuPct"`
	MemUsedMB  int64   `json:"memUsedMb"`
	DiskUsedMB int64   `json:"diskUsedMb"`
	NetRxBytes int64   `json:"netRxBytes"`
	NetTxBytes int64   `json:"netTxBytes"`
	State      string  `json:"state"`
}

// PushStats batches per-server stats to the panel.
func (c *Client) PushStats(ctx context.Context, stats []ServerStat) error {
	return c.do(ctx, http.MethodPost, "/api/v1/agent/stats", map[string]any{"stats": stats}, nil, true)
}

// LogLine is a console line forwarded to the panel for persistence/streaming.
type LogLine struct {
	ServerID string `json:"serverId"`
	Line     string `json:"line"`
	Stream   string `json:"stream"` // "stdout" | "install" | "system"
	At       int64  `json:"at"`     // unix millis
}

// PushLogs forwards a batch of console lines.
func (c *Client) PushLogs(ctx context.Context, lines []LogLine) error {
	return c.do(ctx, http.MethodPost, "/api/v1/agent/logs", map[string]any{"lines": lines}, nil, true)
}

// PowerEvent notifies the panel of a server state transition.
func (c *Client) PowerEvent(ctx context.Context, serverID, state string) error {
	return c.do(ctx, http.MethodPost, "/api/v1/agent/power-event",
		map[string]string{"serverId": serverID, "state": state}, nil, true)
}

// BackupProgress reports backup status/progress to the panel.
func (c *Client) BackupProgress(ctx context.Context, payload any) error {
	return c.do(ctx, http.MethodPost, "/api/v1/agent/backup-progress", payload, nil, true)
}

// --- transport -------------------------------------------------------------

// do performs a JSON request, optionally signing it with the node's HMAC key.
func (c *Client) do(ctx context.Context, method, path string, body, out any, signed bool) error {
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			return fmt.Errorf("encode body: %w", err)
		}
	}
	payload := buf.Bytes()

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "refx-agent")
	if signed {
		ts := fmt.Sprintf("%d", time.Now().Unix())
		req.Header.Set("X-Refx-Node", c.nodeID)
		req.Header.Set("X-Refx-Timestamp", ts)
		req.Header.Set("X-Refx-Signature", Sign(c.signingKey, method, path, ts, payload))
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("panel %s %s: status %d: %s", method, path, resp.StatusCode, string(b))
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}
