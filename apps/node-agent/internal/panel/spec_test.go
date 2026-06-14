package panel

import (
	"encoding/json"
	"testing"

	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

func TestServerInstallSpecToSpec(t *testing.T) {
	dto := ServerInstallSpec{
		ServerID:       "uuid-1",
		ShortID:        "abc123",
		DeployMethod:   "NATIVE_PROCESS",
		DockerImage:    "ghcr.io/refx/mc:latest",
		StartupCommand: "java -jar {{JAR}}",
		StartupDetect:  "Done (",
		StopCommand:    "stop",
		Environment:    map[string]string{"JAR": "server.jar", "MEM": "2G"},
		Limits:         server.Limits{CPUCores: 2, MemoryMB: 4096},
		Allocations:    []server.Allocation{{IP: "0.0.0.0", Port: 25565, IsPrimary: true}},
		InstallScript:  server.InstallScript{Script: "echo install", SteamAppID: 0},
		ConfigFiles:    []server.ConfigFile{{Path: "server.properties", Content: "port={{PORT}}"}},
		PreserveData:   true,
		SFTPUsername:   "abc123",
		SFTPPassword:   "secret",
	}

	spec := dto.ToSpec()

	if spec.ID != "uuid-1" || spec.ShortID != "abc123" {
		t.Fatalf("ids not mapped: %+v", spec)
	}
	if spec.DeployMethod != server.DeployNativeProcess {
		t.Fatalf("deploy method = %q, want NATIVE_PROCESS", spec.DeployMethod)
	}
	if spec.Image != "ghcr.io/refx/mc:latest" {
		t.Fatalf("image (dockerImage) not mapped: %q", spec.Image)
	}
	if spec.StartupCommand != "java -jar {{JAR}}" || spec.StopCommand != "stop" || spec.StartupDetect != "Done (" {
		t.Fatalf("command fields not mapped: %+v", spec)
	}
	if spec.Env["JAR"] != "server.jar" || spec.Env["MEM"] != "2G" {
		t.Fatalf("env not mapped: %+v", spec.Env)
	}
	if spec.Limits.MemoryMB != 4096 || spec.Limits.CPUCores != 2 {
		t.Fatalf("limits not mapped: %+v", spec.Limits)
	}
	if spec.Primary().Port != 25565 {
		t.Fatalf("primary allocation not mapped: %+v", spec.Allocations)
	}
	if spec.Install.Script != "echo install" {
		t.Fatalf("install script not mapped: %+v", spec.Install)
	}
	if len(spec.ConfigFiles) != 1 || spec.ConfigFiles[0].Path != "server.properties" {
		t.Fatalf("config files not mapped: %+v", spec.ConfigFiles)
	}

	// SFTP creds intentionally do not live on the Spec.
	if spec.ShortID == "" {
		t.Fatal("shortId must remain set (used as SFTP username)")
	}
}

func TestServerInstallSpecNilEnvBecomesEmptyMap(t *testing.T) {
	dto := ServerInstallSpec{ServerID: "x", ShortID: "y", Environment: nil}
	spec := dto.ToSpec()
	if spec.Env == nil {
		t.Fatal("nil environment must be normalized to an empty (non-nil) map")
	}
	if len(spec.Env) != 0 {
		t.Fatalf("expected empty env, got %+v", spec.Env)
	}
}

func TestRegisterResponseUnmarshal(t *testing.T) {
	// The panel sends servers as a JSON array of ServerInstallSpec objects; make
	// sure the RegisterResponse decodes them into typed specs.
	raw := `{
		"nodeId": "node-1",
		"signingKey": "key",
		"servers": [
			{"serverId":"s1","shortId":"short1","deployMethod":"DOCKER","dockerImage":"img","startupCommand":"run","environment":{"A":"1"},"sftpUsername":"short1","sftpPassword":"pw"}
		]
	}`
	var resp RegisterResponse
	if err := json.Unmarshal([]byte(raw), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(resp.Servers) != 1 {
		t.Fatalf("expected 1 server, got %d", len(resp.Servers))
	}
	s := resp.Servers[0]
	if s.ServerID != "s1" || s.SFTPUsername != "short1" || s.SFTPPassword != "pw" {
		t.Fatalf("server fields not decoded: %+v", s)
	}
	if s.ToSpec().DeployMethod != server.DeployDocker {
		t.Fatalf("deploy method not decoded: %q", s.ToSpec().DeployMethod)
	}
}
