# refx.gg environment map

This is the file that turns the deploy skill from generic advice into an executable runbook. Fill it in once. Update it when infra changes — a stale runbook is worse than no runbook, because it's trusted.

**Never put secrets in this file.** Reference where a secret lives, not what it is.

## Services

| Service | What it does | Repo / path | Host | Deploy command | Health check |
|---|---|---|---|---|---|
| Marketing site | | TODO(frank) | | | |
| Control panel | | | | | |
| API / backend | | | | | |
| Node daemon / agent | | | | | |
| Database | | | | | |
| Proxy / DDoS edge | | | | | |
| Voice hosting | | | | | |
| Web hosting | | | | | |

## Nodes

| Node | Location | Capacity | Customers on it | Drain command |
|---|---|---|---|---|
| TODO(frank) | | | | |

Order to restart nodes in (least-busy first, so the blast radius of a bad image is smallest):

TODO(frank)

## Out-of-band access

**The path in that does not depend on the proxy/edge you might be changing.** Confirm this works *before* touching infra, not after you've locked yourself out.

- TODO(frank): console access / provider dashboard / direct SSH route
- TODO(frank): who/what to contact if the provider itself is the problem

## Backups

| What | Command | Where it lands | Retention | Last restore *tested* |
|---|---|---|---|---|
| Database | TODO(frank) | | | TODO(frank): **date** |
| Customer server data | | | | |
| Configs | | | | |

**Restore command** (the one you'd run at 2am, so write it out in full):

```
TODO(frank)
```

If "last restore tested" is blank or older than a few months, that is the highest-priority item on this page. An untested backup is a hope.

## Secrets

- Where they live: TODO(frank) (env file? secret manager? provider vault?)
- Rotation procedure: TODO(frank)
- **If a secret is ever printed to a log or console, it is rotated. Not "probably fine".**

## Windows

- Customers' dominant timezone: TODO(frank)
- Peak usage: evenings and weekends in that timezone — **never deploy into this**
- Chosen maintenance window: TODO(frank) (weekday morning, off-peak)
- Rollback watch period after a deploy: TODO(frank) (15 min? 60 min?)

## Rollback criteria (the real numbers)

| Signal | Baseline | Rollback threshold |
|---|---|---|
| Error rate | TODO(frank) | |
| Provisioning failures | | any failure on the canary |
| Panel login failures | | any |
| Running-server count | | unexplained drop |

## Canary provision check

The one check that proves the product works: provision a real server, boot it, connect, delete.

- Automated? TODO(frank) yes/no — **if no, this is the highest-value automation on the platform.** It's the difference between "the deploy looked fine" and "customers can still buy servers."
- Command / script: TODO(frank)
- Which game does the canary use? (Pick a fast-installing one — you'll run this on every deploy.)

## Status page / customer comms

- Status page: TODO(frank)
- Announcement channel (Discord?): TODO(frank)
- Who writes the customer-facing message: TODO(frank)

## Monitoring

| What | Where | Alerts to |
|---|---|---|
| Uptime | TODO(frank) | |
| Error rate | | |
| Node resources | | |
| Provisioning success rate | | |
| Cost/usage dashboard | | |
