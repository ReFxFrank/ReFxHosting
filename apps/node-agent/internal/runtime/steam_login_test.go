package runtime

import "testing"

func TestSteamLoginSucceeded(t *testing.T) {
	cases := []struct {
		name string
		out  string
		want bool
	}{
		{
			// The real success log: a benign "Steam Guard code provided." line must
			// NOT be mistaken for a failure — the late "Waiting for user info...OK"
			// marker is definitive.
			name: "success with guard-code-provided line",
			out: `Logging in using username/password.
Steam Guard code provided.
Logging in user 'refxhosting' to Steam Public...OK
Waiting for client config...OK
Waiting for user info...OK`,
			want: true,
		},
		{name: "legacy logged-in-ok", out: "Logging in...\nLogged in OK", want: true},
		{name: "guard prompt (no code)", out: "Logging in...\nSteam Guard code:", want: false},
		{name: "invalid password", out: "FAILED login with result code Invalid Password", want: false},
		{name: "rate limited", out: "FAILED login with result code Rate Limit Exceeded", want: false},
		{name: "permission denied bootstrap", out: "mkdir: cannot create directory: Permission denied\nREFX: failed to fetch steamcmd", want: false},
		{name: "empty", out: "", want: false},
	}
	for _, c := range cases {
		if got := steamLoginSucceeded(c.out, 0); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}
