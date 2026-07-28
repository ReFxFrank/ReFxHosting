package runtime

import (
	"os"
	"strings"
	"testing"
)

// The host game-download Steam account (STEAM_GAME_*) is needed by the INSTALL
// script (steamcmd +login/+app_update) but must never reach a RUNNING game: the
// launcher script and mod directories live in the customer-writable data dir, so
// a leaked value would hand every customer the operator's fleet-wide Steam
// password. Install keeps them; runtime drops them.
func TestInstallOnlyEnvStrippedFromRuntimeOnly(t *testing.T) {
	spec := map[string]string{
		"SERVER_PORT":         "25565",
		"STEAM_GAME_USERNAME": "host-acct",
		"STEAM_GAME_PASSWORD": "s3cret",
		"STEAM_GAME_GUARD":    "ABC12",
	}

	has := func(env []string, key string) bool {
		for _, kv := range env {
			if strings.HasPrefix(kv, key+"=") {
				return true
			}
		}
		return false
	}

	// Runtime (docker + native) must not carry the credentials...
	for name, env := range map[string][]string{
		"runtimeEnvSlice":   runtimeEnvSlice(spec),
		"processRuntimeEnv": processRuntimeEnv(spec),
	} {
		for _, secret := range []string{"STEAM_GAME_USERNAME", "STEAM_GAME_PASSWORD", "STEAM_GAME_GUARD"} {
			if has(env, secret) {
				t.Errorf("%s leaked %s into the runtime environment", name, secret)
			}
		}
		if !has(env, "SERVER_PORT") {
			t.Errorf("%s dropped a normal game variable", name)
		}
	}

	// ...but the install path still receives them, or paid games can't download.
	install := processEnv(spec)
	for _, needed := range []string{"STEAM_GAME_USERNAME", "STEAM_GAME_PASSWORD", "STEAM_GAME_GUARD"} {
		if !has(install, needed) {
			t.Errorf("install env is missing %s — paid-game downloads would fail", needed)
		}
	}
	if !has(envSlice(spec), "STEAM_GAME_PASSWORD") {
		t.Error("envSlice (install container env) must keep the credentials")
	}
}

// A same-named variable inherited from the AGENT's own host environment must be
// dropped for runtime too, not just the spec copy.
func TestInstallOnlyEnvStrippedFromInheritedHostEnv(t *testing.T) {
	t.Setenv("STEAM_GAME_PASSWORD", "from-host-env")
	for _, kv := range processRuntimeEnv(map[string]string{}) {
		if strings.HasPrefix(kv, "STEAM_GAME_PASSWORD=") {
			t.Fatal("inherited STEAM_GAME_PASSWORD leaked into the runtime environment")
		}
	}
	// Sanity: the test actually set it on the host env.
	if os.Getenv("STEAM_GAME_PASSWORD") == "" {
		t.Fatal("test setup failed to set the host env var")
	}
}
