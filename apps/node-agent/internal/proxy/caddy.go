// Package proxy maps customer domains to local web-app upstreams by driving a
// local Caddy server's admin API. Caddy terminates TLS and issues/renews Let's
// Encrypt certificates automatically for any hostname it routes — so adding a
// site is just "register domain -> localhost:port" and SSL takes care of itself.
//
// The node operator runs Caddy with an http app whose server is named "srv0"
// listening on :80 + :443 with automatic HTTPS (see infra docs). This client
// appends/removes one @id-tagged route per domain via the admin API (default
// http://localhost:2019, override with REFX_CADDY_ADMIN).
package proxy

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// Client talks to a local Caddy admin API.
type Client struct {
	adminURL string
	http     *http.Client
}

// NewClient builds a Caddy admin client. Admin URL comes from REFX_CADDY_ADMIN,
// defaulting to Caddy's standard localhost:2019.
func NewClient() *Client {
	url := os.Getenv("REFX_CADDY_ADMIN")
	if url == "" {
		url = "http://localhost:2019"
	}
	return &Client{
		adminURL: strings.TrimRight(url, "/"),
		http:     &http.Client{Timeout: 15 * time.Second},
	}
}

// routeID is the stable @id tag for a domain's route, so add is idempotent and
// remove is a single targeted call.
func routeID(domain string) string { return "refx-site-" + domain }

// siteRoute builds the Caddy JSON route mapping host=domain to a reverse proxy
// at upstream (e.g. "localhost:25591"). The host matcher is what makes Caddy's
// automatic HTTPS obtain a certificate for the domain.
func siteRoute(domain, upstream string) map[string]any {
	return map[string]any{
		"@id":   routeID(domain),
		"match": []any{map[string]any{"host": []any{domain}}},
		"handle": []any{map[string]any{
			"handler":   "reverse_proxy",
			"upstreams": []any{map[string]any{"dial": upstream}},
		}},
	}
}

// AddSite routes domain -> upstream, replacing any existing route for the domain
// (idempotent). Caddy issues/renews TLS for the domain automatically.
func (c *Client) AddSite(ctx context.Context, domain, upstream string) error {
	if domain == "" || upstream == "" {
		return fmt.Errorf("proxy: domain and upstream are required")
	}
	// Replace semantics: drop any existing route for this domain first.
	_ = c.RemoveSite(ctx, domain)
	body, err := json.Marshal(siteRoute(domain, upstream))
	if err != nil {
		return err
	}
	// POST appends to srv0's routes array.
	url := c.adminURL + "/config/apps/http/servers/srv0/routes"
	return c.do(ctx, http.MethodPost, url, body)
}

// RemoveSite deletes the domain's route. A missing route (404) is not an error.
func (c *Client) RemoveSite(ctx context.Context, domain string) error {
	if domain == "" {
		return fmt.Errorf("proxy: domain is required")
	}
	url := c.adminURL + "/id/" + routeID(domain)
	return c.do(ctx, http.MethodDelete, url, nil)
}

func (c *Client) do(ctx context.Context, method, url string, body []byte) error {
	var rdr io.Reader
	if body != nil {
		rdr = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, rdr)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("proxy: caddy admin %s: %w", method, err)
	}
	defer resp.Body.Close()
	// DELETE of a missing @id returns 404/400 — treat as already-gone.
	if method == http.MethodDelete && (resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusBadRequest) {
		return nil
	}
	if resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 2000))
		return fmt.Errorf("proxy: caddy admin %s %s -> %d: %s", method, url, resp.StatusCode, strings.TrimSpace(string(msg)))
	}
	return nil
}
