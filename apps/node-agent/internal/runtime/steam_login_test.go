package runtime

import "testing"

func TestSteamLoginSucceeded(t *testing.T) {
	cases := []struct {
		name string
		out  string
		want bool
	}{
		{
			// The REAL success log: ANSI colour codes split "Public...\x1b[0mOK", a
			// benign "Steam Guard code provided." line appears, and "Waiting for user
			// info..." has compat text injected before its OK. Must still read success.
			name: "success with ANSI codes + guard-provided + compat text",
			out: "Loading Steam API...\x1b[0mOK\n" +
				"\x1b[0m\x1b[1mLogging in using username/password.\n" +
				"\x1b[0m\x1b[1mSteam Guard code provided.\n" +
				"\x1b[0mLogging in user 'refxhosting' [U:1:727415439] to Steam Public...\x1b[0mOK\n" +
				"\x1b[0mWaiting for client config...\x1b[0mOK\n" +
				"\x1b[0mWaiting for user info...\x1b[0mWaiting for compat in post-logon took: 0.098792sOK\n",
			want: true,
		},
		{name: "login result FAILED", out: "Logging in user 'x' to Steam Public...\x1b[0mFAILED (Invalid Login Auth Code)", want: false},
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
