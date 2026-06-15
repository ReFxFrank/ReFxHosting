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
	containerUID  = 1000
	containerGID  = 1000
	containerUser = "1000:1000"
)

// DockerRuntime hosts servers as Docker containers. It is the preferred backend
// on Linux: strong isolation, image-based game versions, and first-class
// resource limits via the Engine host config.
type DockerRuntime struct {
	log     zerolog.Logger
	cli     *client.Client
	network string
}

// containerLabel marks containers managed by this agent.
const (
	labelManaged = "io.refxhosting.managed"
	labelServer  = "io.refxhosting.server-id"
)

// NewDockerRuntime constructs a DockerRuntime. host may be empty to honour the
// DOCKER_HOST environment / default socket.
func NewDockerRuntime(log zerolog.Logger, host, dockerNetwork string) (*DockerRuntime, error) {
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
		log:     log.With().Str("runtime", "docker").Logger(),
		cli:     cli,
		network: dockerNetwork,
	}, nil
}

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
	cfg := &container.Config{
		Image:      image,
		Entrypoint: strings.Fields(entry),
		Cmd:        []string{"-c", s.Spec.Install.Script},
		Env:        envSlice(s.Spec.Env),
		WorkingDir: "/mnt/server",
		Labels:     map[string]string{labelManaged: "true", labelServer: s.Spec.ID},
	}
	host := &container.HostConfig{
		Mounts: []mount.Mount{{Type: mount.TypeBind, Source: s.DataDir, Target: "/mnt/server"}},
		// NOTE: deliberately NOT AutoRemove. With auto-remove the daemon deletes
		// the container the instant it exits, which races ContainerWait and yields
		// "No such container" — spuriously failing a successful install. We remove
		// it ourselves below after reading the exit code.
	}
	created, err := d.cli.ContainerCreate(ctx, cfg, host, &network.NetworkingConfig{}, nil, containerName(s)+"-install")
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
		for _, proto := range []string{"tcp", "udp"} {
			p, _ := nat.NewPort(proto, fmt.Sprintf("%d", a.Port))
			ports[p] = struct{}{}
			bindings[p] = []nat.PortBinding{{HostIP: a.IP, HostPort: fmt.Sprintf("%d", a.Port)}}
		}
	}

	host := &container.HostConfig{
		Resources:     res,
		PortBindings:  bindings,
		Mounts:        []mount.Mount{{Type: mount.TypeBind, Source: s.DataDir, Target: "/home/container"}},
		RestartPolicy: container.RestartPolicy{Name: "no"},
		NetworkMode:   container.NetworkMode(d.network),
	}
	return host, ports, bindings
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
		Tty:          false,
		OpenStdin:    true,
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		Labels:       map[string]string{labelManaged: "true", labelServer: s.Spec.ID},
	}

	// Run the game as a non-root user on Linux nodes (the data dir is chowned to
	// match below). This is deliberately skipped on Windows: Docker Desktop's
	// WSL2 bind mounts don't honor Linux file ownership, so a uid:1000 process
	// can't write the mounted data dir and the server crashes immediately — there
	// the image's default user (root) is correct.
	if goruntime.GOOS != "windows" {
		cfg.User = containerUser
		// The install step runs as root; make the data dir writable by the
		// non-root runtime user before launching.
		if err := chownTree(s.DataDir, containerUID, containerGID); err != nil {
			d.log.Warn().Err(err).Str("server", s.ID()).Msg("chown data dir failed")
		}
	}

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
	return nil
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
func (d *DockerRuntime) AttachConsole(ctx context.Context, s *server.Server) (*Console, error) {
	resp, err := d.cli.ContainerAttach(ctx, containerName(s), container.AttachOptions{
		Stream: true, Stdin: true, Stdout: true, Stderr: true,
	})
	if err != nil {
		return nil, fmt.Errorf("docker: attach: %w", err)
	}

	out := make(chan []byte, 256)
	go func() {
		defer close(out)
		streamDockerLogs(resp.Reader, func(line []byte) {
			cp := make([]byte, len(line))
			copy(cp, line)
			select {
			case out <- cp:
			case <-ctx.Done():
			}
		})
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

// Destroy removes the container (data dir is left intact).
func (d *DockerRuntime) Destroy(ctx context.Context, s *server.Server) error {
	err := d.cli.ContainerRemove(ctx, containerName(s), container.RemoveOptions{Force: true})
	if err != nil && !client.IsErrNotFound(err) {
		return fmt.Errorf("docker: remove: %w", err)
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
		id := c.Labels[labelServer]
		s, ok := lookup(id)
		if !ok {
			continue
		}
		s.RuntimeRef = c.ID
		if strings.HasPrefix(c.State, "running") {
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
