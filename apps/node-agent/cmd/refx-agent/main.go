// Command refx-agent is the ReFx Hosting node daemon. A single static binary
// runs on every Linux and Windows node and is driven by the central NestJS panel.
//
// Boot sequence:
//  1. load config (file + env), set up structured logging
//  2. detect host capabilities and build the runtime Manager (Docker + native)
//  3. register with the panel if not already registered (handshake -> signing key)
//  4. start the HTTPS control API, WebSocket hub, SFTP server, and stats reporter
//  5. block until SIGINT/SIGTERM, then shut everything down gracefully
package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog"
	"github.com/spf13/cobra"

	"github.com/refxfrank/refxhosting/node-agent/internal/api"
	"github.com/refxfrank/refxhosting/node-agent/internal/backup"
	"github.com/refxfrank/refxhosting/node-agent/internal/config"
	"github.com/refxfrank/refxhosting/node-agent/internal/osabstraction"
	"github.com/refxfrank/refxhosting/node-agent/internal/panel"
	"github.com/refxfrank/refxhosting/node-agent/internal/runtime"
	"github.com/refxfrank/refxhosting/node-agent/internal/server"
	"github.com/refxfrank/refxhosting/node-agent/internal/sftp"
	"github.com/refxfrank/refxhosting/node-agent/internal/stats"
)

// version is overridden at build time via -ldflags "-X main.version=...".
var version = "dev"

func main() {
	var cfgPath string
	root := &cobra.Command{
		Use:           "refx-agent",
		Short:         "ReFx Hosting node daemon",
		Version:       version,
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			// Launched by the Windows SCM? Run under the service control
			// dispatcher (handles Start/Stop) instead of the console path.
			if isWindowsService() {
				return runWindowsService(cfgPath)
			}
			return run(cmd.Context(), cfgPath)
		},
	}
	root.PersistentFlags().StringVarP(&cfgPath, "config", "c", "", "path to config.yaml (or set REFX_CONFIG)")

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := root.ExecuteContext(ctx); err != nil {
		l := zerolog.New(os.Stderr)
		l.Error().Err(err).Msg("agent exited with error")
		os.Exit(1)
	}
}

// run wires the agent together and blocks until shutdown.
func run(ctx context.Context, cfgPath string) error {
	// A restarting agent (Windows path) spawns its replacement with a short delay
	// so the old process can release its listeners first; honor it before we bind.
	if ms := os.Getenv("REFX_RESTART_DELAY_MS"); ms != "" {
		if d, perr := strconv.Atoi(ms); perr == nil && d > 0 {
			time.Sleep(time.Duration(d) * time.Millisecond)
		}
	}

	cfg, err := config.Load(cfgPath)
	if err != nil {
		return err
	}
	log := newLogger(cfg.Log)
	log.Info().Str("version", version).Str("data_dir", cfg.DataDir).Msg("starting refx-agent")

	if err := cfg.EnsureDirs(); err != nil {
		return err
	}

	caps := osabstraction.DetectCapabilities()
	log.Info().
		Str("os", caps.OS).
		Bool("cgroups_v2", caps.CgroupsV2).
		Bool("job_objects", caps.JobObjects).
		Bool("docker", caps.DockerAvailable).
		Msg("detected host capabilities")

	// --- runtime Manager (Docker + native + windows-container skeleton) ----
	mgr, dockerRT := buildManager(log, cfg, caps)

	// --- TLS for the control API + SFTP host key ---------------------------
	// Default to a persisted self-signed cert under the data dir when no explicit
	// paths are configured, so the cert (and its pinned fingerprint) survives
	// restarts instead of being regenerated each start.
	certPath, keyPath := cfg.API.TLSCert, cfg.API.TLSKey
	if certPath == "" || keyPath == "" {
		certPath = filepath.Join(cfg.DataDir, "agent_cert.pem")
		keyPath = filepath.Join(cfg.DataDir, "agent_key.pem")
	}
	tlsCfg, fingerprint, err := loadOrGenerateTLS(certPath, keyPath)
	if err != nil {
		return err
	}

	// --- panel client + registration --------------------------------------
	pc := panel.New(panel.Options{
		Logger:        log,
		BaseURL:       cfg.Panel.URL,
		NodeID:        cfg.NodeID,
		SigningKey:    cfg.SigningKey,
		Timeout:       cfg.Panel.Timeout,
		SkipTLSVerify: cfg.Panel.SkipTLSVerify,
	})

	// assigned holds the server specs the panel hands us at registration so we
	// can apply them onto the Manager and SFTP authenticator once both exist.
	var assigned []panel.ServerInstallSpec
	if !cfg.IsRegistered() {
		log.Info().Msg("node not registered; performing handshake")
		resp, regErr := pc.Register(ctx, panel.RegisterRequest{
			BootstrapToken: cfg.Panel.BootstrapToken,
			AgentVersion:   version,
			Capabilities:   caps,
			TLSFingerprint: fingerprint,
		})
		if regErr != nil {
			return regErr
		}
		cfg.NodeID = resp.NodeID
		cfg.SigningKey = resp.SigningKey
		if err := cfg.SaveState(); err != nil {
			log.Warn().Err(err).Msg("failed to persist node identity")
		}
		assigned = resp.Servers
	} else {
		// Already registered: reload the assigned servers so the Manager and
		// SFTP credentials survive restarts (the register handshake, which
		// carries the server list, only runs on first boot).
		servers, ferr := pc.FetchServers(ctx)
		if ferr != nil {
			log.Warn().Err(ferr).Msg("failed to reload assigned servers")
		} else {
			assigned = servers
			log.Info().Int("count", len(servers)).Msg("reloaded assigned servers")
		}
	}

	// Ensure the network exists before servers are applied/adopted below.
	if dockerRT != nil {
		_ = dockerRT.EnsureNetwork(ctx)
	}

	// --- WebSocket hub -----------------------------------------------------
	hub := newHub(log, mgr, cfg.SigningKey)

	// --- backup manager ----------------------------------------------------
	// Panel-distributed S3 credentials (pushed or fetched earlier) persist in
	// the data dir and take precedence over config.yaml's backup.s3 block.
	if pushed := loadPushedBackupStorage(log, cfg.DataDir); pushed != nil {
		applyBackupStorageToConfig(cfg, pushed)
	}
	backups, err := buildBackups(ctx, log, cfg)
	if err != nil {
		return err
	}
	// Converge on the panel's centrally-managed storage config at every boot
	// (covers nodes that were offline during an admin push, and fresh installs).
	if cfg.IsRegistered() {
		if s3cfg, ferr := pc.FetchBackupStorage(ctx); ferr == nil {
			if aerr := applyBackupStorage(log, cfg, backups, s3cfg); aerr != nil {
				log.Warn().Err(aerr).Msg("applying panel backup storage failed")
			}
		} else {
			log.Debug().Err(ferr).Msg("no centrally-managed backup storage (or panel unreachable)")
		}
	}

	// --- SFTP server -------------------------------------------------------
	sftpAuth := sftp.NewMemoryAuthenticator()
	// Apply panel-assigned server specs: register each onto the Manager and
	// populate its SFTP credential from the same payload.
	applyAssignedServers(log, mgr, sftpAuth, assigned)

	// Now that the Manager knows the assigned servers, adopt any surviving
	// Docker containers (e.g. a server that kept running across an agent
	// restart) so their state/stats/console reattach.
	if dockerRT != nil {
		_ = dockerRT.Reconcile(ctx, mgr.Get)
	}

	hostKey, err := loadOrGenerateHostKey(filepath.Join(cfg.DataDir, "sftp_host_key"))
	if err != nil {
		return err
	}
	sftpSrv, err := sftp.New(log, cfg.SFTP.BindAddr, sftpAuth, hostKey)
	if err != nil {
		return err
	}

	// --- control API -------------------------------------------------------
	apiSrv := api.New(cfg.API.BindAddr, tlsCfg, api.Deps{
		Logger:         log,
		Manager:        mgr,
		Installer:      server.NewInstaller(log),
		Backups:        backups,
		Hub:            hub,
		Panel:          pc,
		SigningKey:     cfg.SigningKey,
		MetricsHandler: promhttp.Handler(),
		SFTPAuth:       sftpAuth,
		SteamHomeDir:   filepath.Join(cfg.DataDir, "steam-home"),
		ApplyBackupStorage: func(s3cfg *panel.BackupStorageS3) error {
			return applyBackupStorage(log, cfg, backups, s3cfg)
		},
	})

	// --- stats collector ---------------------------------------------------
	collector := stats.New(stats.Options{
		Logger:            log,
		Manager:           mgr,
		Client:            pc,
		NodeID:            cfg.NodeID,
		Version:           version,
		StatInterval:      cfg.Stats.Interval,
		HeartbeatInterval: cfg.Stats.HeartbeatInterval,
	})

	// Stream the console of any already-running (adopted) servers to the panel.
	apiSrv.StartRunningForwarders()

	// --- run all subsystems; first error or signal triggers shutdown -------
	return supervise(ctx, log, []service{
		{"control-api", apiSrv.Start},
		{"sftp", sftpSrv.Start},
		{"stats", func(c context.Context) error { collector.Run(c); return nil }},
	})
}

// applyAssignedServers registers each panel-assigned server spec onto the
// Manager and seeds the SFTP authenticator with its credential. It is safe to
// call with an empty slice (e.g. an already-registered node that boots without a
// fresh assign payload).
func applyAssignedServers(log zerolog.Logger, mgr *runtime.Manager, auth *sftp.MemoryAuthenticator, specs []panel.ServerInstallSpec) {
	for _, s := range specs {
		if s.ServerID == "" || s.ShortID == "" {
			log.Warn().Str("server", s.ServerID).Msg("skipping assigned server with missing id/shortId")
			continue
		}
		srv := mgr.Register(s.ToSpec())
		if s.SFTPUsername != "" {
			auth.Upsert(sftp.Credential{
				Username: s.SFTPUsername,
				Password: s.SFTPPassword,
				JailDir:  srv.DataDir,
			})
		}
		// Containers keep running across an agent restart/update; push the
		// current spec limits onto them so limit-model changes (e.g. the CPU
		// weight+burst pair) don't wait for the next server restart.
		func() {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			mgr.ReconcileLimits(ctx, srv)
		}()
		log.Info().Str("server", s.ServerID).Str("short", s.ShortID).Msg("applied panel-assigned server")
	}
}

// buildManager constructs the runtime Manager with the backends available on the
// host. Docker is wired only when an engine is reachable; native is always
// available; the Windows container backend is a skeleton.
func buildManager(log zerolog.Logger, cfg *config.Config, caps osabstraction.Capabilities) (*runtime.Manager, *runtime.DockerRuntime) {
	// Node-level Steam home: shared across servers so the host game-download
	// account's Steam Guard machine-auth (sentry) only needs a code once per node.
	steamHome := filepath.Join(cfg.DataDir, "steam-home")

	var dockerRT *runtime.DockerRuntime
	if caps.DockerAvailable || cfg.Runtime.Docker.Host != "" {
		if d, err := runtime.NewDockerRuntime(log, cfg.Runtime.Docker.Host, cfg.Runtime.Docker.Network, steamHome); err == nil {
			dockerRT = d
		} else {
			log.Warn().Err(err).Msg("docker runtime unavailable")
		}
	}

	native := runtime.NewNativeRuntime(log, steamHome, cfg.Runtime.Native.RunAsUID, cfg.Runtime.Native.RunAsGID)
	winc := runtime.NewWindowsContainerRuntime(log)

	opts := runtime.Options{
		Logger:           log,
		ServersDir:       cfg.ServersDir(),
		Native:           native,
		WindowsContainer: winc,
	}
	if dockerRT != nil {
		opts.Docker = dockerRT
	}
	return runtime.NewManager(opts), dockerRT
}

// backupStorageFile is where panel-distributed S3 credentials persist across
// agent restarts (0600, refx-owned). Presence means "panel manages storage".
func backupStorageFile(dataDir string) string {
	return filepath.Join(dataDir, "backup-storage.json")
}

// loadPushedBackupStorage reads persisted panel-distributed S3 config; nil when
// absent/unreadable (falls back to config.yaml).
func loadPushedBackupStorage(log zerolog.Logger, dataDir string) *panel.BackupStorageS3 {
	b, err := os.ReadFile(backupStorageFile(dataDir))
	if err != nil {
		return nil
	}
	var cfg panel.BackupStorageS3
	if err := json.Unmarshal(b, &cfg); err != nil || cfg.Bucket == "" {
		log.Warn().Err(err).Msg("ignoring invalid persisted backup-storage.json")
		return nil
	}
	return &cfg
}

// applyBackupStorageToConfig merges pushed S3 credentials over the yaml config.
func applyBackupStorageToConfig(cfg *config.Config, s3 *panel.BackupStorageS3) {
	cfg.Backup.S3.Endpoint = s3.Endpoint
	cfg.Backup.S3.Region = s3.Region
	cfg.Backup.S3.Bucket = s3.Bucket
	cfg.Backup.S3.AccessKey = s3.AccessKey
	cfg.Backup.S3.SecretKey = s3.SecretKey
	cfg.Backup.S3.UsePathStyle = s3.UsePathStyle
}

// applyBackupStorage persists panel-distributed S3 credentials and hot-swaps
// the backup manager's S3 backend. A nil/empty payload disables S3 (and
// removes the persisted file) — express backups then degrade to local disk.
func applyBackupStorage(log zerolog.Logger, cfg *config.Config, backups *backup.Manager, s3cfg *panel.BackupStorageS3) error {
	file := backupStorageFile(cfg.DataDir)
	if s3cfg == nil || s3cfg.Bucket == "" {
		_ = os.Remove(file)
		backups.SetS3(nil)
		return nil
	}
	store, err := backup.NewS3Storage(context.Background(), backup.S3Config{
		Endpoint:     s3cfg.Endpoint,
		Region:       s3cfg.Region,
		Bucket:       s3cfg.Bucket,
		AccessKey:    s3cfg.AccessKey,
		SecretKey:    s3cfg.SecretKey,
		UsePathStyle: s3cfg.UsePathStyle,
	})
	if err != nil {
		return err
	}
	b, _ := json.Marshal(s3cfg)
	if err := os.WriteFile(file, b, 0o600); err != nil {
		log.Warn().Err(err).Msg("could not persist backup storage config (applies until restart)")
	}
	backups.SetS3(store)
	return nil
}

// buildBackups constructs the backup manager from config (local or S3).
func buildBackups(ctx context.Context, log zerolog.Logger, cfg *config.Config) (*backup.Manager, error) {
	tmp := filepath.Join(cfg.DataDir, "tmp")
	// Local storage always exists (it's the fallback); S3 is built whenever the
	// node has credentials, even if it's not the default driver — the panel
	// routes express-backup servers to S3 per backup.
	dir := cfg.Backup.LocalDir
	if dir == "" {
		dir = filepath.Join(cfg.DataDir, "backups")
	}
	local, err := backup.NewLocalStorage(dir)
	if err != nil {
		return nil, err
	}
	var s3 backup.Storage
	if cfg.Backup.S3.Bucket != "" {
		st, err := backup.NewS3Storage(ctx, backup.S3Config{
			Endpoint:     cfg.Backup.S3.Endpoint,
			Region:       cfg.Backup.S3.Region,
			Bucket:       cfg.Backup.S3.Bucket,
			AccessKey:    cfg.Backup.S3.AccessKey,
			SecretKey:    cfg.Backup.S3.SecretKey,
			UsePathStyle: cfg.Backup.S3.UsePathStyle,
		})
		if err != nil {
			return nil, err
		}
		s3 = st
	}
	return backup.New(log, local, s3, cfg.Backup.Driver, tmp), nil
}

// service is a named long-running subsystem.
type service struct {
	name string
	run  func(context.Context) error
}

// supervise runs all services until the context is cancelled or one fails. A
// failing service cancels the rest so shutdown is coordinated.
func supervise(ctx context.Context, log zerolog.Logger, services []service) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	errCh := make(chan error, len(services))
	for _, svc := range services {
		svc := svc
		go func() {
			log.Info().Str("service", svc.name).Msg("starting subsystem")
			if err := svc.run(ctx); err != nil && !errors.Is(err, context.Canceled) {
				log.Error().Err(err).Str("service", svc.name).Msg("subsystem failed")
				errCh <- err
				cancel()
				return
			}
			errCh <- nil
		}()
	}

	<-ctx.Done()
	log.Info().Msg("shutdown signal received; stopping subsystems")

	// Allow subsystems a grace window to wind down.
	timer := time.NewTimer(20 * time.Second)
	defer timer.Stop()
	for range services {
		select {
		case <-errCh:
		case <-timer.C:
			log.Warn().Msg("shutdown grace period elapsed; forcing exit")
			return nil
		}
	}
	log.Info().Msg("agent stopped cleanly")
	return nil
}
