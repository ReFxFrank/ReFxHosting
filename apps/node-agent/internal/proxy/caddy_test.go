package proxy

import (
	"encoding/json"
	"testing"
)

func TestSiteRoute(t *testing.T) {
	r := siteRoute("site.example.com", "localhost:25591")
	if got := r["@id"]; got != "refx-site-site.example.com" {
		t.Fatalf("@id = %v", got)
	}
	// Round-trips to the JSON shape Caddy's admin API expects.
	b, err := json.Marshal(r)
	if err != nil {
		t.Fatal(err)
	}
	var back map[string]any
	if err := json.Unmarshal(b, &back); err != nil {
		t.Fatal(err)
	}
	handle := back["handle"].([]any)[0].(map[string]any)
	if handle["handler"] != "reverse_proxy" {
		t.Fatalf("handler = %v", handle["handler"])
	}
	up := handle["upstreams"].([]any)[0].(map[string]any)
	if up["dial"] != "localhost:25591" {
		t.Fatalf("dial = %v", up["dial"])
	}
	match := back["match"].([]any)[0].(map[string]any)["host"].([]any)
	if len(match) != 1 || match[0] != "site.example.com" {
		t.Fatalf("host matcher = %v", match)
	}
}

func TestRouteID(t *testing.T) {
	if routeID("a.com") != "refx-site-a.com" {
		t.Fatal("routeID mismatch")
	}
}
