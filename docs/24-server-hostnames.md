# 24 — Branded server hostnames (per-server addresses)

Show customers a branded address like `mc-7f3a.fra.refx.gg:25565` instead of the
raw node IP — the GPortal-style experience — using a wildcard DNS record per node
and the per-server allocation alias. No DNS API integration required.

## How it works

When a server is provisioned, the panel sets its primary allocation's advertised
address. By default that's the node's **FQDN**. If the node has a **game domain**
set (e.g. `fra.refx.gg`), the panel instead assigns the allocation an **alias**
of `<server-shortId>.<gameDomain>` and the panel renders that everywhere the
connection address is shown. The allocation `ip` (= node FQDN) is kept as a
fallback, and the agent always binds the port to `0.0.0.0`, so routing is
unaffected — the alias is purely the *advertised* name.

> **Branding ≠ hiding.** A `nslookup` on the branded name still resolves to the
> node's IP (the game client must connect to a real IP). This hides the raw IP
> from the *UI*, like GPortal does. To truly hide the origin you'd front game
> traffic with a TCP/UDP proxy / DDoS-scrubbing layer — out of scope here.

## Set it up (per node)

1. **DNS:** add a wildcard A (and AAAA) record per node/region pointing at that
   node's public IP:

   ```
   *.fra.refx.gg.  A  203.0.113.10
   ```

   One wildcard covers every server on the node — no per-server records.

2. **Panel:** in **Admin → Nodes** (create or edit), set **Game domain** to
   `fra.refx.gg`. New servers on that node get `<id>.fra.refx.gg` addresses.

That's it. Existing servers keep their current address until reprovisioned;
new servers (and servers **transferred** to the node) pick up the node's game
domain automatically.

## Notes & edge cases

- **Per-node, not global:** each node has its own game domain + wildcard, so a
  server in Frankfurt shows `…​.fra.refx.gg` and one in New York `…​.nyc.refx.gg`.
- **Transfers:** moving a server to another node re-derives the alias from the
  destination node's game domain (so the address follows the server's region).
- **Game switching:** the alias lives on the allocation, which persists across a
  game switch — the address stays stable, as intended.
- **Minecraft portless connect (optional, later):** an `SRV` record
  (`_minecraft._tcp.<name>` → port) lets Java players omit the port. That's
  per-server and needs DNS automation (a DNS-provider API) — a future Tier-3
  enhancement; the wildcard approach here is portful (`name:port`).
- **Clearing it:** blank the game domain to revert new servers to the node FQDN.
