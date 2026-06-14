// Package config loads and validates the node-agent runtime configuration.
//
// Configuration is sourced (in increasing precedence) from:
//  1. built-in defaults
//  2. a YAML file (default: ./config.yaml, override with REFX_CONFIG)
//  3. environment variables prefixed REFX_ (e.g. REFX_PANEL_URL)
//
// The agent is deliberately tolerant on first boot: it can start with only a
// panel URL + bootstrap token and persist the rest of its identity (signing
// key, node id) under DataDir/agent.state after a successful registration.
package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/viper"
)

// Config is the fully-resolved agent configuration.
type Config struct {
	// Node identity. NodeID and SigningKey are usually empty until the agent
	// has completed registration; they are then persisted to the state file.
	NodeID     string `mapstructure:"node_id"`
	SigningKey string `mapstructure:"signing_key"`

	// Panel connection.
	Panel PanelConfig `mapstructure:"panel"`

	// Local API server (panel -> agent control plane).
	API APIConfig `mapstructure:"api"`

	// Embedded SFTP server.
	SFTP SFTPConfig `mapstructure:"sftp"`

	// Filesystem layout.
	DataDir string `mapstructure:"data_dir"`

	// Runtime backends.
	Runtime RuntimeConfig `mapstructure:"runtime"`

	// Stats / heartbeat cadence.
	Stats StatsConfig `mapstructure:"stats"`

	// Logging.
	Log LogConfig `mapstructure:"log"`

	// Backups.
	Backup BackupConfig `mapstructure:"backup"`
}

// PanelConfig describes how to reach the central panel.
type PanelConfig struct {
	// URL is the base URL of the panel API, e.g. https://panel.example.com.
	URL string `mapstructure:"url"`
	// BootstrapToken is the one-time per-node token used for registration.
	BootstrapToken string `mapstructure:"bootstrap_token"`
	// SkipTLSVerify disables panel TLS verification (dev only).
	SkipTLSVerify bool `mapstructure:"skip_tls_verify"`
	// Timeout for outbound panel HTTP calls.
	Timeout time.Duration `mapstructure:"timeout"`
}

// APIConfig configures the inbound HTTPS control API.
type APIConfig struct {
	// BindAddr is the listen address, e.g. 0.0.0.0:8443.
	BindAddr string `mapstructure:"bind_addr"`
	// TLSCert and TLSKey are PEM file paths. If empty, a self-signed cert is
	// generated on boot and its fingerprint reported to the panel.
	TLSCert string `mapstructure:"tls_cert"`
	TLSKey  string `mapstructure:"tls_key"`
}

// SFTPConfig configures the embedded SFTP server.
type SFTPConfig struct {
	BindAddr string `mapstructure:"bind_addr"`
	// HostKey is a PEM-encoded ed25519/rsa host key path. Generated if empty.
	HostKey string `mapstructure:"host_key"`
}

// RuntimeConfig selects and tunes the available runtime backends.
type RuntimeConfig struct {
	// Default is the deploy method used when the panel does not specify one.
	// One of: docker, native_process, windows_container.
	Default string `mapstructure:"default"`
	// Docker holds Docker-specific settings.
	Docker DockerConfig `mapstructure:"docker"`
}

// DockerConfig configures the Docker runtime.
type DockerConfig struct {
	// Host overrides DOCKER_HOST (e.g. unix:///var/run/docker.sock or
	// npipe:////./pipe/docker_engine on Windows).
	Host string `mapstructure:"host"`
	// Network is the user-defined bridge network containers join.
	Network string `mapstructure:"network"`
}

// StatsConfig controls metric collection cadence.
type StatsConfig struct {
	Interval          time.Duration `mapstructure:"interval"`
	HeartbeatInterval time.Duration `mapstructure:"heartbeat_interval"`
}

// LogConfig controls structured logging.
type LogConfig struct {
	Level  string `mapstructure:"level"`  // trace,debug,info,warn,error
	Pretty bool   `mapstructure:"pretty"` // human-friendly console output
}

// BackupConfig configures backup storage defaults.
type BackupConfig struct {
	// Driver is "local" or "s3".
	Driver string `mapstructure:"driver"`
	// LocalDir is where local backups are written.
	LocalDir string `mapstructure:"local_dir"`
	S3       S3Config `mapstructure:"s3"`
}

// S3Config holds S3 / S3-compatible (MinIO) settings.
type S3Config struct {
	Endpoint     string `mapstructure:"endpoint"`
	Region       string `mapstructure:"region"`
	Bucket       string `mapstructure:"bucket"`
	AccessKey    string `mapstructure:"access_key"`
	SecretKey    string `mapstructure:"secret_key"`
	UsePathStyle bool   `mapstructure:"use_path_style"`
}

// Load reads configuration from file + environment and validates it.
func Load(path string) (*Config, error) {
	v := viper.New()

	setDefaults(v)

	v.SetEnvPrefix("REFX")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	if path == "" {
		path = os.Getenv("REFX_CONFIG")
	}
	if path != "" {
		v.SetConfigFile(path)
		if err := v.ReadInConfig(); err != nil {
			return nil, fmt.Errorf("read config %q: %w", path, err)
		}
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("unmarshal config: %w", err)
	}

	// Overlay any persisted identity from the state file (registration output).
	if err := cfg.loadState(); err != nil {
		return nil, err
	}

	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func setDefaults(v *viper.Viper) {
	v.SetDefault("data_dir", "/var/lib/refx-agent")
	v.SetDefault("api.bind_addr", "0.0.0.0:8443")
	v.SetDefault("sftp.bind_addr", "0.0.0.0:2022")
	v.SetDefault("panel.timeout", 30*time.Second)
	v.SetDefault("runtime.default", "docker")
	v.SetDefault("runtime.docker.network", "refx0")
	v.SetDefault("stats.interval", 5*time.Second)
	v.SetDefault("stats.heartbeat_interval", 15*time.Second)
	v.SetDefault("log.level", "info")
	v.SetDefault("backup.driver", "local")
}

// Validate enforces the minimum viable configuration.
func (c *Config) Validate() error {
	if c.Panel.URL == "" {
		return errors.New("config: panel.url is required")
	}
	if c.NodeID == "" && c.Panel.BootstrapToken == "" {
		return errors.New("config: panel.bootstrap_token is required for first registration")
	}
	if c.DataDir == "" {
		return errors.New("config: data_dir is required")
	}
	return nil
}

// ServersDir is where per-server data directories live.
func (c *Config) ServersDir() string { return filepath.Join(c.DataDir, "servers") }

// StateFile is the persisted post-registration identity file.
func (c *Config) StateFile() string { return filepath.Join(c.DataDir, "agent.state") }

// IsRegistered reports whether the agent already has a node identity.
func (c *Config) IsRegistered() bool { return c.NodeID != "" && c.SigningKey != "" }
