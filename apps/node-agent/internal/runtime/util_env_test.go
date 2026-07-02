package runtime

import (
	"strings"
	"testing"
)

// processEnv must strip the agent's own secrets (REFX_* and known secret names)
// from a hosted process's environment while preserving benign host vars and
// applying the server's Spec.Env. This is the CWE-668 fix for native nodes,
// where the game process runs as the agent's OS user.
func TestProcessEnvScrubsAgentSecrets(t *testing.T) {
	t.Setenv("PATH", "/usr/bin:/bin")
	t.Setenv("HOME", "/home/refx")
	t.Setenv("REFX_SIGNING_KEY", "super-secret-hmac")
	t.Setenv("REFX_PANEL_URL", "https://api.refx.gg")
	t.Setenv("SECRETS_ENC_KEY", "deadbeef")
	t.Setenv("STRIPE_SECRET_KEY", "sk_live_x")

	out := processEnv(map[string]string{"SERVER_MEMORY": "4096", "PATH": "/opt/java/bin"})
	joined := strings.Join(out, "\n")

	// Secrets must be gone.
	for _, banned := range []string{"REFX_SIGNING_KEY", "REFX_PANEL_URL", "SECRETS_ENC_KEY", "STRIPE_SECRET_KEY", "super-secret-hmac"} {
		if strings.Contains(joined, banned) {
			t.Errorf("processEnv leaked secret %q into the hosted env:\n%s", banned, joined)
		}
	}

	// Benign host vars survive; Spec.Env is applied (and overrides).
	if !strings.Contains(joined, "HOME=/home/refx") {
		t.Error("processEnv dropped a benign host var (HOME)")
	}
	if !strings.Contains(joined, "SERVER_MEMORY=4096") {
		t.Error("processEnv did not apply Spec.Env (SERVER_MEMORY)")
	}
	if !strings.Contains(joined, "PATH=/opt/java/bin") {
		t.Error("processEnv did not let Spec.Env override a base key (PATH)")
	}
}

func TestIsSecretEnvKey(t *testing.T) {
	secret := []string{"REFX_SIGNING_KEY", "refx_panel_url", "SECRETS_ENC_KEY", "DATABASE_URL", "SMTP_PASSWORD"}
	for _, k := range secret {
		if !isSecretEnvKey(k) {
			t.Errorf("expected %q to be treated as secret", k)
		}
	}
	benign := []string{"PATH", "HOME", "JAVA_HOME", "LANG", "SERVER_MEMORY", "TZ"}
	for _, k := range benign {
		if isSecretEnvKey(k) {
			t.Errorf("expected %q to be preserved (not secret)", k)
		}
	}
}
