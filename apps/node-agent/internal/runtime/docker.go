package runtime

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/stdcopy"
	"github.com/docker/go-connections/nat"
	"github.com/rs/zerolog"

	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

// Game processes run as this non-root uid:gid inside the container (the data dir
// is chowned to match on start), so servers never run as root — avoiding the
// "running as root is not advised" warnings and the associated risk.
const (
	containerUID = 1000
	containerGID = 1000
)

// DockerRuntime hosts servers as Docker containers. It is the preferred backend
// on Linux: strong isolation, image-based game versions, and first-class
// resource limits via the Engine host config.
type DockerRuntime struct {
	log     zerolog.Logger
	cli     *client.Client
	network string
	// steamHome is a node-level directory bind-mounted into install containers at
	// /mnt/steamhome. The host game-download Steam account writes its machine-auth
	// (sentry) here, so a Steam Guard code is only needed once per node rather than
	// once per server. Empty disables the mount.
	steamHome string
}

// containerLabel marks containers managed by this agent.
const (
	labelManaged = "io.refxhosting.managed"
	labelServer  = "io.refxhosting.server-id"
)

// NewDockerRuntime constructs a DockerRuntime. host may be empty to honour the
// DOCKER_HOST environment / default socket.
func NewDockerRuntime(log zerolog.Logger, host, dockerNetwork, steamHome string) (*DockerRuntime, error) {
	opts := []client.Opt{client.FromEnv, client.WithAPIVersionNegotiation()}
	if host != "" {
		opts = append(opts, client.WithHost(host))
	}
	cli, err := client.NewClientWithOpts(opts...)
	if err != nil {
		return nil, fmt.Errorf("docker: create client: %w", err)
	}
	if dockerNetwork == "" {
		dockerNetwork = "refx0"
	}
	return &DockerRuntime{
		log:       log.With().Str("runtime", "docker").Logger(),
		cli:       cli,
		network:   dockerNetwork,
		steamHome: steamHome,
	}, nil
}

// containerSteamHome is where the node-level Steam home is mounted inside install
// containers; eggs read REFX_NODE_STEAM_HOME to find it.
const containerSteamHome = "/mnt/steamhome"

// Name implements Runtime.
func (d *DockerRuntime) Name() string { return "docker" }

func containerName(s *server.Server) string { return "refx-" + s.Spec.ShortID }

// EnsureNetwork creates the agent's user-defined bridge network if absent. The
// daemon calls this once at startup.
func (d *DockerRuntime) EnsureNetwork(ctx context.Context) error {
	_, err := d.cli.NetworkInspect(ctx, d.network, network.InspectOptions{})
	if err == nil {
		return nil
	}
	if !client.IsErrNotFound(err) {
		return fmt.Errorf("docker: inspect network: %w", err)
	}
	_, err = d.cli.NetworkCreate(ctx, d.network, network.CreateOptions{Driver: "bridge"})
	if err != nil {
		return fmt.Errorf("docker: create network: %w", err)
	}
	d.log.Info().Str("network", d.network).Msg("created docker network")
	return nil
}

// Install pulls the install image, runs the install script with the data dir
// mounted, renders config files, then pulls the runtime image.
func (d *DockerRuntime) Install(ctx context.Context, s *server.Server) (<-chan InstallProgress, error) {
	ch := make(chan InstallProgress, 64)
	go func() {
		defer close(ch)
		emit := func(line string) { ch <- InstallProgress{Line: line} }

		emit("==> rendering config files")
		if err := renderConfigFiles(s.DataDir, s); err != nil {
			ch <- InstallProgress{Err: fmt.Errorf("render config: %w", err)}
			return
		}

		installImage := s.Spec.Install.Image
		if installImage == "" {
			installImage = s.Spec.Image
		}
		if installImage != "" {
			emit("==> pulling install image " + installImage)
			if err := d.pull(ctx, installImage, ch); err != nil {
				ch <- InstallProgress{Err: err}
				return
			}
		}

		if s.Spec.Install.Script != "" && installImage != "" {
			emit("==> running install script")
			if err := d.runInstallScript(ctx, s, installImage, ch); err != nil {
				ch <- InstallProgress{Err: err}
				return
			}
		}

		if s.Spec.Image != "" && s.Spec.Image != installImage {
			emit("==> pulling runtime image " + s.Spec.Image)
			if err := d.pull(ctx, s.Spec.Image, ch); err != nil {
				ch <- InstallProgress{Err: err}
				return
			}
		}

		s.MarkInstalled()
		s.SetState(server.StateOffline)
		ch <- InstallProgress{Line: "==> installation complete", Done: true}
	}()
	return ch, nil
}

func (d *DockerRuntime) pull(ctx context.Context, imageRef string, ch chan<- InstallProgress) error {
	rc, err := d.cli.ImagePull(ctx, imageRef, image.PullOptions{})
	if err != nil {
		return fmt.Errorf("docker: pull %s: %w", imageRef, err)
	}
	defer rc.Close()
	sc := bufio.NewScanner(rc)
	for sc.Scan() {
		ch <- InstallProgress{Line: sc.Text()}
	}
	return sc.Err()
}

// runInstallScript runs an ephemeral container that executes the template's
// install script with the server data dir bind-mounted at /mnt/server.
func (d *DockerRuntime) runInstallScript(ctx context.Context, s *server.Server, image string, ch chan<- InstallProgress) error {
	entry := s.Spec.Install.Entrypoint
	if entry == "" {
		entry = "/bin/sh"
	}
	env := envSlice(s.Spec.Env)
	mounts := []mount.Mount{{Type: mount.TypeBind, Source: s.DataDir, Target: "/mnt/server"}}
	// Node-level Steam home: lets the host game-download account's Steam Guard
	// machine-auth persist across servers (once per node, not once per server).
	if steamHome := d.ensureSteamHome(); steamHome != "" {
		mounts = append(mounts, mount.Mount{Type: mount.TypeBind, Source: steamHome, Target: containerSteamHome})
		env = append(env, "REFX_NODE_STEAM_HOME="+containerSteamHome)
	}
	cfg := &container.Config{
		Image:      image,
		Entrypoint: strings.Fields(entry),
		Cmd:        []string{"-c", s.Spec.Install.Script},
		Env:        env,
		WorkingDir: "/mnt/server",
		// Run installs as ROOT. They must write the data dir (chowned to the non-root
		// runtime uid) and some need apt-get, but install image users differ
		// (eclipse-temurin is root; parkervcp/steamcmd is non-root and otherwise gets
		// "Permission denied" on /mnt/server). This is the Wings model; the installed
		// files are handed back to the runtime user right after the script runs.
		User:   "0:0",
		Labels: map[string]string{labelManaged: "true", labelServer: s.Spec.ID},
	}
	// Make /mnt/server writable by the install image's (non-root) user before it
	// runs, so `cd /mnt/server` / writes succeed without running as root.
	d.prepareDataDir(ctx, s, image)
	host := &container.HostConfig{
		Mounts: mounts,
		// NOTE: deliberately NOT AutoRemove. With auto-remove the daemon deletes
		// the container the instant it exits, which races ContainerWait and yields
		// "No such container" — spuriously failing a successful install. We remove
		// it ourselves below after reading the exit code.
	}
	installName := containerName(s) + "-install"
	// Clear any leftover install container with this name first: a crashed or
	// restarted agent mid-install leaks one, and a remake would otherwise collide
	// on the name ("Conflict. The container name is already in use").
	_ = d.cli.ContainerRemove(ctx, installName, container.RemoveOptions{Force: true})
	created, err := d.cli.ContainerCreate(ctx, cfg, host, &network.NetworkingConfig{}, nil, installName)
	if err != nil {
		return fmt.Errorf("docker: create install container: %w", err)
	}
	// Always clean the install container up, even on error/cancel (use a detached
	// context so cancellation of ctx can't skip the removal).
	defer func() {
		_ = d.cli.ContainerRemove(context.Background(), created.ID, container.RemoveOptions{Force: true})
	}()

	// Register the exit wait BEFORE starting so the exit event can never be missed
	// (the daemon buffers it for us).
	statusCh, errCh := d.cli.ContainerWait(ctx, created.ID, container.WaitConditionNotRunning)

	if err := d.cli.ContainerStart(ctx, created.ID, container.StartOptions{}); err != nil {
		return fmt.Errorf("docker: start install container: %w", err)
	}
	// Stream logs until the container exits.
	logs, err := d.cli.ContainerLogs(ctx, created.ID, container.LogsOptions{
		ShowStdout: true, ShowStderr: true, Follow: true,
	})
	if err == nil {
		defer logs.Close()
		streamDockerLogs(logs, func(line []byte) { ch <- InstallProgress{Line: string(line)} })
	}
	select {
	case err := <-errCh:
		if err != nil {
			return fmt.Errorf("docker: wait install: %w", err)
		}
	case st := <-statusCh:
		if st.StatusCode != 0 {
			return fmt.Errorf("docker: install script exited with code %d", st.StatusCode)
		}
	case <-ctx.Done():
		return ctx.Err()
	}
	// The root install created the files root-owned; hand them to the non-root
	// runtime user so the game can read/execute/write them.
	d.prepareDataDir(ctx, s, image)
	return nil
}

// hostConfig builds the resource-limited HostConfig from the server limits and
// allocations.
func (d *DockerRuntime) hostConfig(s *server.Server) (*container.HostConfig, nat.PortSet, nat.PortMap) {
	lim := s.Spec.Limits
	res := container.Resources{
		Memory:     lim.MemoryMB * 1024 * 1024,
		MemorySwap: (lim.MemoryMB + lim.SwapMB) * 1024 * 1024,
		// NanoCPUs encodes fractional cores: 1.0 core == 1e9.
		NanoCPUs:  int64(lim.CPUCores * 1e9),
		PidsLimit: pidsPtr(lim.PidsLimit),
	}
	// Block-IO weight maps to the cgroup v2 `io` controller, which isn't exposed
	// under Docker Desktop's WSL2 kernel — setting it makes runc fail to start
	// the container ("io.weight: no such file or directory"). Apply on Linux only.
	if goruntime.GOOS != "windows" {
		res.BlkioWeight = uint16(clampIO(lim.IOWeight))
	}

	ports := nat.PortSet{}
	bindings := nat.PortMap{}
	for _, a := range s.Spec.Allocations {
		// Bind the published port to all interfaces (0.0.0.0) by default, NOT to
		// the advertised IP. On NAT'd hosts (most cloud VPS) the node's public IP
		// isn't a local interface — inbound packets arrive with the private dest
		// IP, so a port bound to the public IP never matches and the server is
		// unreachable (esp. UDP, e.g. TeamSpeak voice) even though it's running.
		// A non-empty BindIP (future multi-IP nodes) overrides this.
		hostIP := a.BindIP
		if hostIP == "" {
			hostIP = "0.0.0.0"
		}
		for _, proto := range []string{"tcp", "udp"} {
			p, _ := nat.NewPort(proto, fmt.Sprintf("%d", a.Port))
			ports[p] = struct{}{}
			bindings[p] = []nat.PortBinding{{HostIP: hostIP, HostPort: fmt.Sprintf("%d", a.Port)}}
		}
	}

	host := &container.HostConfig{
		Resources:     res,
		PortBindings:  bindings,
		Mounts:        []mount.Mount{{Type: mount.TypeBind, Source: s.DataDir, Target: "/home/container"}},
		RestartPolicy: container.RestartPolicy{Name: "no"},
		NetworkMode:   container.NetworkMode(d.network),
	}
	// Give the container an /etc/passwd + /etc/group entry for the (non-root) uid
	// it runs as. Steam-API games (Arma 3, DayZ, …) call getpwuid(getuid()) inside
	// steamclient.so at init and SIGSEGV instantly — no output, no log — when it
	// returns NULL, which it does for a uid absent from the stock game image's
	// passwd. The game always runs non-root (uid 1000 under a root agent, or the
	// agent's own uid otherwise), so without this every Steam game silently crash-
	// loops on launch. Linux only (Windows uses Docker Desktop path bridging).
	if goruntime.GOOS != "windows" {
		if passwdPath, groupPath := d.ensureNSSFiles(s); passwdPath != "" && groupPath != "" {
			host.Mounts = append(host.Mounts,
				mount.Mount{Type: mount.TypeBind, Source: passwdPath, Target: "/etc/passwd", ReadOnly: true},
				mount.Mount{Type: mount.TypeBind, Source: groupPath, Target: "/etc/group", ReadOnly: true},
			)
		}
	}
	return host, ports, bindings
}

// ensureNSSFiles writes a minimal /etc/passwd and /etc/group naming the runtime
// uid/gid the game container runs as, and returns their host paths (best-effort;
// "" disables the mount). Without a passwd entry for its uid, a game that calls
// getpwuid()/getgrgid() at startup — notably Steam's steamclient.so — segfaults
// on the NULL result before printing anything. The files depend only on the
// node-constant runtime uid/gid, so they live in a node-level ".nss" dir (sibling
// of the per-server data dirs) and are regenerated idempotently on each launch.
func (d *DockerRuntime) ensureNSSFiles(s *server.Server) (passwdPath, groupPath string) {
	uid, gid := d.runtimeIDs()
	dir := filepath.Join(filepath.Dir(s.DataDir), ".nss")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		d.log.Warn().Err(err).Str("dir", dir).Msg("create nss dir failed")
		return "", ""
	}
	passwd := fmt.Sprintf(
		"root:x:0:0:root:/root:/bin/sh\n"+
			"container:x:%d:%d:container:/home/container:/bin/bash\n"+
			"nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin\n",
		uid, gid)
	group := fmt.Sprintf("root:x:0:\ncontainer:x:%d:\nnogroup:x:65534:\n", gid)
	pPath := filepath.Join(dir, fmt.Sprintf("passwd-%d-%d", uid, gid))
	gPath := filepath.Join(dir, fmt.Sprintf("group-%d", gid))
	if err := os.WriteFile(pPath, []byte(passwd), 0o644); err != nil {
		d.log.Warn().Err(err).Msg("write nss passwd failed")
		return "", ""
	}
	if err := os.WriteFile(gPath, []byte(group), 0o644); err != nil {
		d.log.Warn().Err(err).Msg("write nss group failed")
		return "", ""
	}
	return pPath, gPath
}

// ensureSteamHome creates the node-level Steam home directory (owned by the
// non-root container user so steamcmd can write its sentry) and returns its host
// path, or "" when not configured / not creatable. Best-effort.
func (d *DockerRuntime) ensureSteamHome() string {
	if d.steamHome == "" {
		return ""
	}
	if err := os.MkdirAll(d.steamHome, 0o750); err != nil {
		d.log.Warn().Err(err).Str("dir", d.steamHome).Msg("create steam home failed")
		return ""
	}
	// On Linux the agent (root) can chown so the non-root install user can write.
	if goruntime.GOOS != "windows" {
		if err := chownTree(d.steamHome, containerUID, containerGID); err != nil {
			d.log.Warn().Err(err).Str("dir", d.steamHome).Msg("chown steam home failed")
		}
		// World-writable: steamcmd install/verify containers run as the image's OWN
		// user (parkervcp/steamcmd, eclipse-temurin, … differ and aren't always
		// uid 1000), so a chown alone leaves the home unwritable and the per-node
		// Steam sentry never persists (installs silently fall back to a per-server
		// home, so an owned-game Guard code is needed every time). 0777 lets any
		// image user create its per-account subdir here. Holds machine-auth tokens
		// only, on a node-internal path mounted solely into steam install containers.
		if err := os.Chmod(d.steamHome, 0o777); err != nil {
			d.log.Warn().Err(err).Str("dir", d.steamHome).Msg("chmod steam home failed")
		}
	}
	return d.steamHome
}

// prepareDataDir makes a server's data dir owned by the non-root container user
// (uid 1000) before an install or runtime container runs, so the game never has
// to run as root yet can still write its files:
//   - Linux: the agent (root) chowns the host tree directly.
//   - Windows: the agent is a Windows process and can't chown the Docker-mounted
//     path, and Docker Desktop presents root-created files (e.g. those written by
//     a root install image) as root-owned. So run a throwaway root container that
//     chowns the mount to 1000:1000 — the Wings pattern, just containerized. The
//     game server itself still runs strictly non-root.
// Both are best-effort; failures are logged, not fatal.
func (d *DockerRuntime) prepareDataDir(ctx context.Context, s *server.Server, image string) {
	uid, gid := d.runtimeIDs()
	// A ROOT agent can chown the host tree directly. A NON-root agent (the default
	// systemd install runs as the unprivileged `refx` user) cannot: chown(2) to a
	// different uid needs CAP_CHOWN. So files written by a root install image stay
	// root-owned (the container can't read them — "Unable to access jarfile") and
	// files the AGENT writes (mod uploads, SFTP, config) would be unreadable by a
	// differently-owned container. We solve both by running the container as the
	// agent's own uid (see runtimeIDs) and chowning the tree to it via a throwaway
	// root container when the agent itself can't.
	if goruntime.GOOS != "windows" && os.Geteuid() == 0 {
		if err := chownTree(s.DataDir, uid, gid); err != nil {
			d.log.Warn().Err(err).Str("dir", s.DataDir).Msg("chown data dir failed")
		}
		return
	}
	d.chownViaContainer(ctx, s, image, uid, gid)
}

// runtimeIDs returns the uid/gid the game container runs as — and that the data
// dir is chowned to. A root agent uses the unprivileged 1000 (never run the game
// as root). A NON-root agent uses ITS OWN uid/gid so the agent and the container
// share a file owner: otherwise files the agent writes (mod/modpack uploads,
// SFTP, config) end up unreadable by the container, or vice-versa. On Windows
// uids don't map this way, so keep 1000 (Docker Desktop bridges host access).
func (d *DockerRuntime) runtimeIDs() (int, int) {
	if goruntime.GOOS != "windows" && os.Geteuid() != 0 {
		return os.Getuid(), os.Getgid()
	}
	return containerUID, containerGID
}

// runtimeUser is runtimeIDs formatted for container.Config.User ("uid:gid").
func (d *DockerRuntime) runtimeUser() string {
	uid, gid := d.runtimeIDs()
	return fmt.Sprintf("%d:%d", uid, gid)
}

// chownViaContainer runs a short-lived root container that chowns the server's
// data dir to uid:gid. Used when the agent itself can't chown the bind mount
// (Windows, or a non-root Linux agent). The image is reused from the install/
// runtime step (already present, has coreutils `chown`).
func (d *DockerRuntime) chownViaContainer(ctx context.Context, s *server.Server, image string, uid, gid int) {
	name := containerName(s) + "-chown"
	_ = d.cli.ContainerRemove(ctx, name, container.RemoveOptions{Force: true})
	cfg := &container.Config{
		Image:      image,
		User:       "0:0",
		Entrypoint: []string{"chown"},
		Cmd:        []string{"-R", fmt.Sprintf("%d:%d", uid, gid), "/data"},
		Labels:     map[string]string{labelManaged: "true", labelServer: s.Spec.ID},
	}
	host := &container.HostConfig{
		Mounts: []mount.Mount{{Type: mount.TypeBind, Source: s.DataDir, Target: "/data"}},
	}
	created, err := d.cli.ContainerCreate(ctx, cfg, host, &network.NetworkingConfig{}, nil, name)
	if err != nil {
		d.log.Warn().Err(err).Str("server", s.ID()).Msg("windows chown: create failed")
		return
	}
	defer func() {
		_ = d.cli.ContainerRemove(context.Background(), created.ID, container.RemoveOptions{Force: true})
	}()
	if err := d.cli.ContainerStart(ctx, created.ID, container.StartOptions{}); err != nil {
		d.log.Warn().Err(err).Str("server", s.ID()).Msg("windows chown: start failed")
		return
	}
	waitCh, errCh := d.cli.ContainerWait(ctx, created.ID, container.WaitConditionNotRunning)
	select {
	case <-waitCh:
	case e := <-errCh:
		if e != nil {
			d.log.Warn().Err(e).Str("server", s.ID()).Msg("windows chown: wait failed")
		}
	case <-time.After(2 * time.Minute):
		d.log.Warn().Str("server", s.ID()).Msg("windows chown: timed out")
	}
}

// chownTree recursively sets ownership of root to uid:gid (best-effort). Used to
// hand a server's data dir to the non-root container user after a root install.
func chownTree(root string, uid, gid int) error {
	return filepath.WalkDir(root, func(p string, _ fs.DirEntry, err error) error {
		if err != nil {
			return nil // skip unreadable entries; ownership is best-effort
		}
		_ = os.Lchown(p, uid, gid)
		return nil
	})
}

// Start creates (if needed) and starts the runtime container.
func (d *DockerRuntime) Start(ctx context.Context, s *server.Server) error {
	if s.State() == server.StateRunning {
		return ErrAlreadyRunning
	}
	s.SetState(server.StateStarting)

	host, ports, _ := d.hostConfig(s)
	cfg := &container.Config{
		Image:        s.Spec.Image,
		Cmd:          strings.Fields(renderTemplate(s.Spec.StartupCommand, s.Spec.Env)),
		Env:          append(envSlice(s.Spec.Env), "HOME=/home/container"),
		ExposedPorts: ports,
		WorkingDir:   "/home/container",
		// Always run the game as a non-root user — never as root, on any OS. On a
		// non-root Linux agent this is the agent's own uid so the agent and the
		// container can both read/write the data dir (see runtimeIDs).
		User:         d.runtimeUser(),
		Tty:          false,
		OpenStdin:    true,
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		Labels:       map[string]string{labelManaged: "true", labelServer: s.Spec.ID},
	}

	// Hand the data dir to the non-root container user before launching (fixes
	// root-owned files created by a root install image, e.g. Minecraft's).
	d.prepareDataDir(ctx, s, s.Spec.Image)

	name := containerName(s)
	// Always (re)create the container from the current config so changes to the
	// image, user, mounts or env take effect. An existing container is removed
	// first (unless it's actively running) — its data lives in the bind-mounted
	// data dir, so the container itself is disposable. This also avoids
	// re-starting a previously-crashed container in a bad state.
	if existing, err := d.cli.ContainerInspect(ctx, name); err == nil {
		if existing.State != nil && existing.State.Running {
			s.SetState(server.StateRunning)
			return nil
		}
		if rmErr := d.cli.ContainerRemove(ctx, name, container.RemoveOptions{Force: true}); rmErr != nil {
			d.log.Warn().Err(rmErr).Str("server", s.ID()).Msg("removing stale container failed")
		}
	} else if !client.IsErrNotFound(err) {
		s.SetState(server.StateCrashed)
		return fmt.Errorf("docker: inspect: %w", err)
	}

	created, err := d.cli.ContainerCreate(ctx, cfg, host, &network.NetworkingConfig{}, nil, name)
	if err != nil {
		s.SetState(server.StateCrashed)
		return fmt.Errorf("docker: create: %w", err)
	}
	s.RuntimeRef = created.ID

	if err := d.cli.ContainerStart(ctx, name, container.StartOptions{}); err != nil {
		s.SetState(server.StateCrashed)
		return fmt.Errorf("docker: start: %w", err)
	}
	s.SetState(server.StateRunning)
	d.log.Info().Str("server", s.ID()).Msg("container started")
	go d.watchExit(s, created.ID)
	return nil
}

// watchExit flips a server's state when its container exits, so a process that
// dies on boot (e.g. a misconfigured game/voice server) shows as CRASHED/OFFLINE
// instead of a stale "running". Skips if the container has since been replaced.
func (d *DockerRuntime) watchExit(s *server.Server, id string) {
	waitCh, errCh := d.cli.ContainerWait(
		context.Background(),
		id,
		container.WaitConditionNotRunning,
	)
	var code int64 = -1
	select {
	case st := <-waitCh:
		code = st.StatusCode
	case <-errCh:
	}
	// A restart created a new container; don't clobber its state.
	if s.RuntimeRef != id {
		return
	}
	if code == 0 {
		s.SetState(server.StateOffline)
	} else {
		s.SetState(server.StateCrashed)
		d.log.Warn().Str("server", s.ID()).Int64("exit", code).Msg("container exited")
	}
}

// Stop sends the configured stop command (a console command) or SIGTERM, waiting
// up to timeout for the container to exit.
func (d *DockerRuntime) Stop(ctx context.Context, s *server.Server, timeout time.Duration) error {
	s.SetState(server.StateStopping)
	name := containerName(s)

	stop := strings.TrimSpace(s.Spec.StopCommand)
	if stop != "" && stop != "^C" && !strings.HasPrefix(stop, "SIG") {
		// Treat as a console command: write it to stdin then wait for exit.
		if con, err := d.AttachConsole(ctx, s); err == nil {
			_, _ = con.Write([]byte(stop + "\n"))
			_ = con.Close()
		}
	}

	secs := int(timeout.Seconds())
	if err := d.cli.ContainerStop(ctx, name, container.StopOptions{Timeout: &secs}); err != nil {
		return fmt.Errorf("docker: stop: %w", err)
	}
	s.SetState(server.StateOffline)
	return nil
}

// Kill forcibly terminates the container.
func (d *DockerRuntime) Kill(ctx context.Context, s *server.Server) error {
	if err := d.cli.ContainerKill(ctx, containerName(s), "SIGKILL"); err != nil && !client.IsErrNotFound(err) {
		return fmt.Errorf("docker: kill: %w", err)
	}
	s.SetState(server.StateOffline)
	return nil
}

// Restart stops then starts.
func (d *DockerRuntime) Restart(ctx context.Context, s *server.Server, timeout time.Duration) error {
	if err := d.Stop(ctx, s, timeout); err != nil && !errors.Is(err, ErrNotRunning) {
		d.log.Warn().Err(err).Msg("stop during restart failed, continuing")
	}
	return d.Start(ctx, s)
}

// AttachConsole attaches to the container's stdio, demultiplexing stdout/stderr.
//
// Docker's attach stream only carries output produced AFTER the attach, so on its
// own a console opened after a server has started (and gone quiet) shows nothing —
// e.g. Arma 3, which prints its banner once at boot and is then largely silent.
// We therefore prime the stream with the container's recent log history (tail)
// before switching to the live attach, mirroring the native runtime's scrollback.
func (d *DockerRuntime) AttachConsole(ctx context.Context, s *server.Server) (*Console, error) {
	resp, err := d.cli.ContainerAttach(ctx, containerName(s), container.AttachOptions{
		Stream: true, Stdin: true, Stdout: true, Stderr: true,
	})
	if err != nil {
		return nil, fmt.Errorf("docker: attach: %w", err)
	}

	out := make(chan []byte, 256)
	emit := func(line []byte) {
		cp := make([]byte, len(line))
		copy(cp, line)
		select {
		case out <- cp:
		case <-ctx.Done():
		}
	}
	go func() {
		defer close(out)
		// Replay recent history first (best-effort) so the console isn't blank.
		if logs, lerr := d.cli.ContainerLogs(ctx, containerName(s), container.LogsOptions{
			ShowStdout: true, ShowStderr: true, Tail: "250",
		}); lerr == nil {
			streamDockerLogs(logs, emit)
			_ = logs.Close()
		}
		// Then stream live output (and accept stdin via resp.Conn).
		streamDockerLogs(resp.Reader, emit)
	}()

	write := func(p []byte) (int, error) { return resp.Conn.Write(p) }
	closeFn := func() error { resp.Close(); return nil }
	return NewConsole(out, write, closeFn), nil
}

// Stats samples the container's resource usage from the Docker stats stream.
func (d *DockerRuntime) Stats(ctx context.Context, s *server.Server) (Stats, error) {
	st := Stats{Timestamp: time.Now(), State: s.State(), MemLimitMB: s.Spec.Limits.MemoryMB}
	raw, err := d.cli.ContainerStatsOneShot(ctx, containerName(s))
	if err != nil {
		if client.IsErrNotFound(err) {
			st.State = server.StateOffline
			return st, nil
		}
		return st, fmt.Errorf("docker: stats: %w", err)
	}
	defer raw.Body.Close()

	var ds types.StatsJSON
	if err := decodeJSON(raw.Body, &ds); err != nil {
		return st, fmt.Errorf("docker: decode stats: %w", err)
	}

	// CPU percentage relative to a single core.
	cpuDelta := float64(ds.CPUStats.CPUUsage.TotalUsage) - float64(ds.PreCPUStats.CPUUsage.TotalUsage)
	sysDelta := float64(ds.CPUStats.SystemUsage) - float64(ds.PreCPUStats.SystemUsage)
	cores := float64(ds.CPUStats.OnlineCPUs)
	if cores == 0 {
		cores = float64(len(ds.CPUStats.CPUUsage.PercpuUsage))
	}
	if sysDelta > 0 && cpuDelta > 0 {
		st.CPUPercent = (cpuDelta / sysDelta) * cores * 100.0
	}
	st.MemUsedMB = int64(ds.MemoryStats.Usage) / (1024 * 1024)
	for _, nw := range ds.Networks {
		st.NetRxBytes += int64(nw.RxBytes)
		st.NetTxBytes += int64(nw.TxBytes)
	}
	st.DiskUsedMB = dirSizeMB(s.DataDir)
	return st, nil
}

// Reconfigure applies new limits live via ContainerUpdate.
func (d *DockerRuntime) Reconfigure(ctx context.Context, s *server.Server, lim server.Limits) error {
	res := container.Resources{
		Memory:     lim.MemoryMB * 1024 * 1024,
		MemorySwap: (lim.MemoryMB + lim.SwapMB) * 1024 * 1024,
		NanoCPUs:   int64(lim.CPUCores * 1e9),
		PidsLimit:  pidsPtr(lim.PidsLimit),
	}
	// See hostConfig: io.weight is unavailable under WSL2; Linux only.
	if goruntime.GOOS != "windows" {
		res.BlkioWeight = uint16(clampIO(lim.IOWeight))
	}
	upd := container.UpdateConfig{Resources: res}
	if _, err := d.cli.ContainerUpdate(ctx, containerName(s), upd); err != nil {
		if client.IsErrNotFound(err) {
			return nil // not yet created; new limits apply on next Start
		}
		return fmt.Errorf("docker: update: %w", err)
	}
	return nil
}

// Destroy removes the server's containers (data dir is left intact) — the
// runtime container plus any ephemeral install/chown helper containers, so
// deleting a server in the panel leaves nothing behind in Docker.
func (d *DockerRuntime) Destroy(ctx context.Context, s *server.Server) error {
	var firstErr error
	for _, name := range []string{
		containerName(s),
		containerName(s) + "-install",
		containerName(s) + "-chown",
	} {
		err := d.cli.ContainerRemove(ctx, name, container.RemoveOptions{Force: true})
		if err != nil && !client.IsErrNotFound(err) && firstErr == nil {
			firstErr = err
		}
	}
	if firstErr != nil {
		return fmt.Errorf("docker: remove: %w", firstErr)
	}
	s.SetState(server.StateOffline)
	return nil
}

// Reconcile inspects running managed containers at startup and corrects the
// in-memory state of known servers (e.g. a server that survived an agent
// restart). It is best-effort.
func (d *DockerRuntime) Reconcile(ctx context.Context, lookup func(serverID string) (*server.Server, bool)) error {
	args := filters.NewArgs(filters.Arg("label", labelManaged+"=true"))
	list, err := d.cli.ContainerList(ctx, container.ListOptions{All: true, Filters: args})
	if err != nil {
		return fmt.Errorf("docker: list: %w", err)
	}
	for _, c := range list {
		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}
		running := strings.HasPrefix(c.State, "running")

		// Ephemeral install/chown helpers are never meant to outlive their task. A
		// crashed/restarted agent leaks them (e.g. a stale "<server>-install"); reap
		// any that have exited. A running one is an in-progress install — leave it.
		if strings.HasSuffix(name, "-install") || strings.HasSuffix(name, "-chown") {
			if !running {
				_ = d.cli.ContainerRemove(ctx, c.ID, container.RemoveOptions{Force: true})
				d.log.Info().Str("container", name).Msg("reaped leftover install/chown container")
			}
			continue
		}

		id := c.Labels[labelServer]
		s, ok := lookup(id)
		if !ok {
			// Orphan: a runtime container for a server the panel no longer assigns
			// (e.g. a deleted server). Remove it if it's stopped; never force-kill a
			// running one (could be a valid server whose registration is in-flight).
			// The data dir is a separate bind mount and is left untouched.
			if !running {
				_ = d.cli.ContainerRemove(ctx, c.ID, container.RemoveOptions{Force: true})
				d.log.Info().Str("container", name).Msg("reaped orphaned server container")
			}
			continue
		}
		s.RuntimeRef = c.ID
		if running {
			s.SetState(server.StateRunning)
		} else {
			s.SetState(server.StateOffline)
		}
	}
	return nil
}

// --- helpers ---------------------------------------------------------------

// streamDockerLogs demultiplexes Docker's multiplexed stdout/stderr stream into
// individual lines. Non-TTY containers prefix each frame with an 8-byte header;
// stdcopy handles that for us.
func streamDockerLogs(r io.Reader, onLine func([]byte)) {
	pr, pw := io.Pipe()
	go func() {
		_, _ = stdcopy.StdCopy(pw, pw, r)
		_ = pw.Close()
	}()
	sc := bufio.NewScanner(pr)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for sc.Scan() {
		onLine(sc.Bytes())
	}
}

func pidsPtr(n int64) *int64 {
	if n <= 0 {
		return nil
	}
	return &n
}

func clampIO(w int) int {
	if w < 10 {
		return 10
	}
	if w > 1000 {
		return 1000
	}
	return w
}
