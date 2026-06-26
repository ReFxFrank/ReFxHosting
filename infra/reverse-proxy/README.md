# Reverse proxy (production TLS)

Ready-to-edit configs that terminate HTTPS and route to the loopback-bound
containers (`BIND_HOST=127.0.0.1`):

| File | For |
|------|-----|
| [`Caddyfile.example`](Caddyfile.example) | Caddy — automatic Let's Encrypt, WS upgrade handled for you. Simplest. |
| [`nginx.conf.example`](nginx.conf.example) | nginx — pair with certbot for TLS; includes the WebSocket upgrade map. |

Routing both assume:

| Public host | → | Upstream |
|-------------|---|----------|
| `example.com`, `www.example.com` | → | `127.0.0.1:3000` (web) |
| `api.example.com` | → | `127.0.0.1:4000` (panel-api) |

## Use

1. Copy the file (drop the `.example`), replace `example.com` / `api.example.com`
   with your domains and the ACME/cert email.
2. Point DNS A/AAAA records at the host.
3. Caddy: `caddy run --config ./Caddyfile`. nginx: place under
   `/etc/nginx/sites-available/`, symlink, then `certbot --nginx -d example.com
   -d www.example.com -d api.example.com` and `nginx -t && systemctl reload nginx`.

## Must match

- `NEXT_PUBLIC_API_URL` was built as `https://api.<domain>` (baked at web build
  time — rebuild `web` if you change it).
- `CORS_ORIGINS` lists `https://<domain>`(,`https://www.<domain>`).
- `PANEL_URL=https://<domain>` and `TRUST_PROXY=1`.

The console uses WebSockets — both configs pass the `Upgrade`/`Connection`
headers (Caddy automatically; nginx via the `$connection_upgrade` map). `/health`
and `/metrics` are served at the API root, not under `/api/v1`.
