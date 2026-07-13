# Game onboarding QA checklist

Run every item on a server provisioned through the **normal customer purchase path**. A hand-built server proves nothing about what a customer will get.

Most game-onboarding bugs do not appear on first boot. They appear on the second boot, on restart, on reinstall, or after a game switch. That's why this list is long.

## Provisioning

- [ ] Server provisions from a purchase without manual intervention
- [ ] Ports are allocated automatically and do not collide with a neighbouring server on the same node
- [ ] Install script completes and exits 0
- [ ] Install script is **idempotent** — re-running it on an existing server does not destroy customer data
- [ ] Install completes within a reasonable time on the lowest tier (a 40-minute SteamCMD depot download is a refund)

## Boot and lifecycle

- [ ] Server boots and the panel reports "running" (done-detection fires on the right log line)
- [ ] **Stop** is graceful — save is intact afterwards, no corruption, no SIGKILL
- [ ] **Restart** works, twice in a row
- [ ] **Kill** then boot recovers cleanly (customers will do this)
- [ ] Crash → panel reports crashed, does not sit in "starting" forever
- [ ] Auto-restart-on-crash behaves (and doesn't crash-loop a broken server into a boot storm)

## Connectivity

- [ ] A real game client connects from outside the network, using the exact address string the panel shows the customer
- [ ] The address format in the panel is copy-pasteable into the client (no manual port surgery)
- [ ] Server appears in the in-game server browser, if the game has one
- [ ] Query protocol returns the correct player count in the panel
- [ ] Connection survives the DDoS/proxy path — test through the real edge, not a direct IP
- [ ] Voice/extra ports (if any) work

## Configuration

- [ ] Config editor renders the real settings, not a raw text blob
- [ ] Changing a setting in the panel persists after restart
- [ ] Changing a setting in the panel is not silently overwritten by the startup command
- [ ] Editing a config file directly via the file manager also persists
- [ ] Invalid config value produces a readable error, not a silent boot failure

## Resources

- [ ] Server boots on the **lowest tier** offered for this game (verify by booting, not arithmetic)
- [ ] RAM usage at the advertised player count stays under the tier's limit with headroom
- [ ] Container is not OOM-killed under load (exit 137)
- [ ] Disk quota is not exhausted by a fresh install plus a week of projected growth

## Game switching

- [ ] Switching **to** this game from another works
- [ ] Switching **away** from this game works
- [ ] Switching away and back does not leave orphaned files that break a fresh install
- [ ] The panel warns the customer **before** confirming if data will be destroyed
- [ ] Ports are correctly reallocated across the switch

## Backups

- [ ] Backup runs and completes
- [ ] Backup archive contains saves/configs/mods
- [ ] Backup archive does **not** contain caches, logs, or re-downloadable binaries
- [ ] Restore actually restores — restore into a fresh server and connect to it. An untested backup is a hope, not a backup.

## Mods (if supported)

- [ ] A mod/plugin installs through whatever path the docs tell customers to use
- [ ] Server boots with the mod
- [ ] Client with matching mods connects
- [ ] Client with **mismatched** mods gets a comprehensible error (this is the #1 support ticket — check what the customer actually sees)

## Commerce and docs

- [ ] Game is purchasable end to end by an account with no special privileges
- [ ] Landing page is live, in the sitemap, and linked from `/games`
- [ ] Docs get a first-timer from purchase to connected client with no outside help
- [ ] Cancellation/deletion of the server works and frees the ports

## Sign-off

Do not ship on a partial pass. Any unchecked box is either fixed or written into the launch notes as a known limitation with an owner.
