# Screenshots

Real captures of ReFx Hosting running in production, used by the root
[`README.md`](../../README.md) and the docs. Drop image files in **this**
directory using the exact names below and they render automatically wherever
they're referenced.

> [!IMPORTANT]
> **This repository is public (AGPL-3.0).** Anything you commit here is world
> readable and hard to fully un-publish (forks, mirrors, the git history, and
> caches keep copies). Sanitise every capture before adding it — see the
> checklist at the bottom.

## The shot list

Capture at a **1280–1600px** wide viewport, light *or* dark theme (be
consistent — the panel's dark `#0072ff` theme photographs best), and export as
**PNG**. Filenames are load-bearing; keep them exactly as written.

| File | What to capture | Referenced by |
|------|-----------------|---------------|
| `storefront-home.png` | The public storefront landing page (`/`) — hero + game grid. | README hero |
| `store-games.png` | The games catalogue / order page with tier cards. | README "How it compares" |
| `dashboard.png` | A customer dashboard with a server or two. | README panel section |
| `server-console.png` | A server's **Console** tab, live `xterm.js` output. | README console blurb |
| `server-files.png` | The in-browser **file manager** (folders-first sort). | README file-manager blurb |
| `game-switch.png` | The **Switch Game** flow (the signature feature). | README game-switching |
| `minecraft-tab.png` | The Minecraft loader/version tab. | README one-Minecraft |
| `admin-overview.png` | Admin **Overview** dashboard. | README admin power-tools |
| `admin-nodes.png` | Admin **Nodes** list with live CPU/RAM/ping. | README admin power-tools |
| `admin-network.png` | The **Network Status** module (per-node latency/loss/jitter). | README + docs |
| `status-page.png` | The public `/status` page with the world map. | README status-page |
| `admin-growth.png` | The admin **Growth** report. | README growth-engine |

You don't need all of them — `storefront-home.png`, `dashboard.png`,
`server-console.png`, `game-switch.png`, and `admin-network.png` are the
highest-value five for a launch README. Add the rest as you have them.

## How references look

Once a file is present, reference it from any markdown with a relative path:

```md
![ReFx storefront](docs/screenshots/storefront-home.png)   <!-- from the repo root -->
![Network status](screenshots/admin-network.png)           <!-- from inside docs/ -->
```

Keep a short, descriptive alt text on every image (accessibility + it shows if
the image fails to load).

## Sanitisation checklist (do this before committing)

Because the repo is public, scrub each screenshot for:

- [ ] **Node IPs / hostnames** — blur or crop real datacenter addresses and
      `*.refx.gg` node FQDNs. Region labels (e.g. "CA-East") are fine.
- [ ] **Customer PII** — real names, emails, avatars, billing addresses, order
      IDs tied to a real person. Use a demo/staff account or redact.
- [ ] **Secrets** — API keys, SFTP/DB passwords, TOTP seeds, bootstrap tokens,
      privilege keys, webhook signing secrets. None of these should ever be
      on-screen; if one is, it must be **rotated**, not just blurred.
- [ ] **Financial internals** — real revenue/cost figures on the Growth or
      economics screens if you'd rather not publish them.
- [ ] **Session/JWT values** in a visible URL or devtools panel.

A quick redaction pass with any image editor (solid rectangles, not blur, over
sensitive text) is enough. When in doubt, leave it out.
