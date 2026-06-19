package api

import "testing"

// isModrinthURL guards the /files/pull endpoint against being used as a general
// SSRF proxy: only https Modrinth hosts are allowed.
func TestIsModrinthURL(t *testing.T) {
	allowed := []string{
		"https://cdn.modrinth.com/data/abc/versions/1/cobblemon.jar",
		"https://modrinth.com/file.jar",
		"https://api.modrinth.com/x",
		"https://staging.modrinth.dev/y",
	}
	for _, u := range allowed {
		if !isModrinthURL(u) {
			t.Errorf("expected allowed: %s", u)
		}
	}

	denied := []string{
		"http://cdn.modrinth.com/insecure.jar", // not https
		"https://evil.com/x.jar",
		"https://modrinth.com.evil.com/x.jar", // suffix trick
		"https://notmodrinth.com/x.jar",
		"https://169.254.169.254/latest/meta-data/", // cloud metadata
		"ftp://modrinth.com/x",
		"not a url",
		"",
	}
	for _, u := range denied {
		if isModrinthURL(u) {
			t.Errorf("expected denied: %s", u)
		}
	}
}
