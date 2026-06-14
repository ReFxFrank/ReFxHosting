# ReFx Hosting — node-agent

The **node-agent** is ReFx Hosting's cross-platform node daemon: a single static
Go binary that runs on every Linux and Windows node and is driven by the central
NestJS panel. It hosts game servers, streams consoles, manages files and
backups, runs an embedded SFTP server, and reports stats.

It is **not** a Pterodactyl Wings clone. Wings is hard-wired to Docker; the
node-agent is built around an original `Runtime` abstraction with multiple
interchangeable backends, so Docker containers and bare-metal native processes
run side by side behind one interface on both Linux and Windows.

## The `Runtime` abstraction (the headline design)

Every backend implements the same interface
(`internal/runtime/runtime.go`):

```
Install · Start · Stop · Kill · Restart · AttachConsole · Stats · Reconfigure · Destroy
```

| Backend                   | Hosts servers as            | Resource limits             | Platform |
|---------------------------|-----------------------------|-----------------------------|----------|
| `DockerRuntime`           | Docker containers (preferred) | Engine host config          | Linux    |
| `NativeRuntime`           | **raw OS processes**        | cgroups v2 / **Job Objects**| Linux + Windows |
| `WindowsContainerRuntime` | Windows containers (skeleton) | HCS / Docker-Windows      | Windows  |

A `Manager` (`internal/runtime/manager.go`) tracks every server and selects the
backend per-server from the panel-supplied **DeployMethod** (`DOCKER`,
`NATIVE_PROCESS`, `WINDOWS_CONTAINER`, `SANDBOX` — see
`database/prisma/schema.prisma`). The rest of the agent (API, WebSocket, stats)
talks only to the `Manager`, never to a concrete backend.

**Why native hosting is the differentiator:** games with kernel-level anti-cheat,
Windows-only engines, or SteamCMD-driven installs that containerize poorly run
directly on the host via `NativeRuntime`, while still exposing identical console,
stats, and lifecycle semantics to the panel. Resource control is real and
OS-native: cgroups v2 controllers on Linux (`limits_linux.go`) and Job Objects on
Windows (`limits_windows.go`).

## Package layout

```
cmd/refx-agent/        entrypoint: config, logging, registration, supervisor
internal/
  config/              YAML + env config, persisted post-registration state
  panel/               client to the panel: register, heartbeat, stats/log push,
                       HMAC request signing + verification
  api/                 HTTPS control API (chi); signed-request auth middleware
  ws/                  WebSocket hub: console relay + live stats; JSON protocol
  runtime/             Runtime interface + Docker/Native/WindowsContainer +
                       Manager; build-tagged limits_{linux,windows}.go
  server/              per-server state model + installer (config templating)
  files/               jailed, path-traversal-safe file manager
  backup/              tar.gz create/restore; local + S3 storage; checksums
  sftp/                embedded SFTP server, per-server creds, jailed sessions
  stats/               per-server + node stats collection and push
  osabstraction/       OS-specific helpers (signals, process groups, shells)
```

## Control API (panel → agent)

All routes under `/api/v1` require a valid HMAC signature
(`X-Refx-Node`, `X-Refx-Timestamp`, `X-Refx-Signature`) computed with the node's
signing key over `METHOD\nPATH\nTIMESTAMP\nSHA256(body)`.

| Method | Path                                         | Purpose                |
|--------|----------------------------------------------|------------------------|
| POST   | `/api/v1/servers`                            | create + install       |
| GET    | `/api/v1/servers/{id}`                       | state                  |
| DELETE | `/api/v1/servers/{id}`                       | destroy (keeps data)   |
| POST   | `/api/v1/servers/{id}/power`                 | start/stop/restart/kill|
| POST   | `/api/v1/servers/{id}/reinstall`             | reinstall (`?wipe=`)   |
| PATCH  | `/api/v1/servers/{id}/reconfigure`           | apply new limits       |
| *      | `/api/v1/servers/{id}/files/*`               | list/read/write/...    |
| *      | `/api/v1/servers/{id}/backups/*`             | create/restore/delete  |
| GET    | `/ws/servers/{id}`                           | console + stats (JWT)  |
| GET    | `/healthz`, `/metrics`                        | liveness, Prometheus   |

The WebSocket protocol (`internal/ws/protocol.go`) is a `{type, payload}` JSON
envelope with types like `console.output`, `console.command`, `stats`, and
`power.event`. A client authenticates with a panel-issued JWT as its first frame.

## Build & run

```bash
make build                       # host binary -> ./refx-agent
make release                     # cross-compile linux/amd64, linux/arm64, windows/amd64 -> ./dist
make run                         # build + run with config.example.yaml

./refx-agent --config config.yaml
# or: REFX_CONFIG=/etc/refx-agent/config.yaml ./refx-agent
```

See `config.example.yaml` for all settings (each is also a `REFX_`-prefixed env
var). On first boot supply `panel.url` + `panel.bootstrap_token`; the agent
registers, receives its node id + signing key, and persists them.

## Status

This is a working foundation. The `Runtime` abstraction, Docker and native
backends, control API, WebSocket hub, file manager, backups, SFTP, and stats are
implemented, along with:

- a real cross-platform **host CPU/memory sampler** (`internal/stats/host_*.go`:
  `/proc/stat` + `/proc/meminfo` on Linux, `GetSystemTimes` +
  `GlobalMemoryStatusEx` on Windows, portable fallback elsewhere), wired into the
  node heartbeat;
- **panel-pushed server specs + SFTP credentials** applied on registration
  (`panel.ServerInstallSpec` → `server.Spec`, see `cmd/refx-agent/main.go`);
- **install/backup progress forwarding** to the panel (`PushLogs` /
  `BackupProgress`) and to attached WebSocket clients (`install.output`).

Remaining genuine integration points are still marked `// TODO(impl):` — e.g.
Windows container/HCS mechanics and SteamCMD bootstrap.
