---
name: refx-deploy
description: Deploy, verify, or roll back refx.gg production changes: web, panel, API, DB migrations, node and image updates, proxy config. Use before ANY production change or rollback decision.
---

# refx.gg Deploy Runbook

refx.gg is not a website; it's other people's game servers. A bad web deploy shows a broken page. A bad node or proxy deploy drops every customer's server mid-session, on a Saturday night, and they notice. Treat those as different classes of change and this stays boring.

Boring is the goal.

## Environment map

Everything environment-specific lives in `references/environments.md`. Fill it in once — it's the file that turns this skill from generic advice into a runbook that actually executes. **Read it before doing anything.**

## Guardrails

- **One change class per deploy.** Never ship app code, a database migration, and a proxy/DDoS config change together. If it breaks, you won't know which one did it, and the rollback has to undo all three.
- **Never deploy from a dirty working tree or an unpushed commit.** You cannot roll back to something that only exists on your laptop.
- **Never run a destructive migration in the same deploy as the code that depends on it.** Expand first, contract later (see below). A dropped column makes rollback impossible — you go from "revert" to "restore from backup" and that's an outage, not a blip.
- **Never take a backup you haven't proven restores.** An untested backup is a hope.
- **Never restart all game nodes at once.** Stagger them. Simultaneous restarts = every customer's server down at the same moment. (Nuance: an **agent self-update** does *not* drop servers — the systemd unit is `KillMode=process` and game processes are re-adopted. It's **host reboots and game-image rollouts** that take servers down — stagger *those*.)
- **Never deploy on a Friday evening, or into the peak window.** Game hosting peaks evenings and weekends — that's precisely when customers are on their servers. Deploy weekday mornings. (TODO(frank): record your customers' dominant timezone in `environments.md`.)
- **Never echo secrets.** Not into logs, not into the console, not into a diff. If a secret is ever printed, it's rotated, not "probably fine".
- **Decide rollback criteria before deploying, not during the incident.** Under pressure, everyone talks themselves into "let's give it five more minutes."

## Classify the change

The class determines the whole procedure. Get it right first.

| Class | Examples | Blast radius | Rollback |
|---|---|---|---|
| **Web / marketing** | Landing pages, docs, copy | Nobody's server goes down | Trivial — redeploy previous build |
| **Panel / API** | Control panel, billing, auth | Customers can't manage servers; servers keep running | Easy, if no migration |
| **Database migration** | Schema changes | Potentially everything | **Hard. Plan it before you write it.** |
| **Node / agent / game image** | Daemon updates, container images | **Customers' servers restart or break** | Medium — but the downtime already happened |
| **Infra / proxy / DDoS** | Edge config, routing, firewall | **Everything, instantly, including the panel you'd use to fix it** | Have the out-of-band access ready *first* |

Infra/proxy is the one that can lock you out of your own platform. Before touching it, confirm you have a working path in that doesn't depend on the thing you're changing.

## Pre-flight

- [ ] What exactly changed? (`git log` since the last deploy tag — read it, don't skim it)
- [ ] Change class identified; **only one class in this deploy**
- [ ] Build/tests green on the exact commit being deployed
- [ ] Migration? → Is it expand-only? Is there a tested rollback? Is there a fresh, verified DB backup?
- [ ] Node/image change? → Have you booted a test server on the new image?
- [ ] Rollback criteria written down, with numbers (see below)
- [ ] In the maintenance window, not the peak window
- [ ] If customer-visible downtime is expected: status page updated and customers notified **before**, not during

## Database migrations: expand / contract

This is the rule that makes rollback possible, so it's worth internalising rather than looking up.

**Expand** (safe, ship first): add nullable columns, add tables, add indexes concurrently, dual-write. Old code still works against the new schema — which is exactly what makes the deploy revertible.

**Contract** (destructive, ship *later*, in a separate deploy, after the new code has been running happily): drop columns, drop tables, add NOT NULL constraints, rename.

Never combine them. The moment a deploy contains a `DROP`, `git revert` stops being a rollback and starts being a restore-from-backup, and your ten-second recovery becomes a forty-minute outage.

## Deploy sequence

1. **Backup** — database, and any config you're about to overwrite. Confirm it exists and is non-zero. For anything destructive, confirm it *restores*.
2. **Tag** the current production commit so "roll back" is one unambiguous command, not archaeology.
3. **Deploy.** There is **no staging environment** (confirmed — see `environments.md`), so deploy to the smallest possible slice of prod first: run the canary-provision check below, and for node/image changes roll one node before the rest. The mechanism is manual — `infra/scripts/update-panel.sh` (compose) or `helm upgrade` (k8s); there is no automated CD.
4. **Verify** (below). Do not skip because it looked fine.
5. **Roll out** to the rest, staggered. Watch after each step, don't fire-and-forget.
6. **Watch** for the length of the rollback window (defaults: web ~15 min · panel/API ~30 min · migration or node/image rollout ~60 min — see `environments.md`) before calling it done.

For node changes specifically: **drain, notify, restart, verify, next node.** Never in parallel. Customers on the node being restarted should know it's happening before their game server disappears.

## Verify

Health endpoints returning 200 prove nothing. A hosting platform can have every service "healthy" and still be unable to give a customer a working game server. Test the thing you actually sell:

- [ ] **Canary provision**: create a real game server through the normal purchase/provision path, boot it, connect a client, delete it. **This is the only check that proves the product works.** Automate it and run it on every deploy.
- [ ] Panel loads and login works
- [ ] **Panel WebSocket console streams live output** — this is the first thing a proxy/edge config change breaks, and it's easy to miss because the page still loads fine
- [ ] File manager reads and writes
- [ ] Start / stop / restart an existing server
- [ ] Billing webhook processes an event
- [ ] Backup job runs and produces a restorable archive
- [ ] Existing customer servers are still up (compare running-server count to before the deploy — a drop is the alarm)
- [ ] Error rate and provisioning-failure rate at baseline

## Rollback

**Criteria — write these down before deploying.** Numbers, not vibes. The real numbers live in `environments.md` — capture your error-rate baseline from the panel `/metrics` (Prometheus) endpoint before deploying. Defaults:

- Error rate > 2× baseline for 5 minutes
- Any provisioning failure on the canary
- Panel login failing for any customer
- Running-server count drops unexpectedly
- Anything you can't explain within 10 minutes

**Procedure**: redeploy the previous tag. That's why you tagged it. Verify with the same checklist you just ran.

**When NOT to roll back**: if a destructive (contract) migration has already run, rolling back the code puts old code against a schema it doesn't understand — you'll make it worse. **Roll forward instead.** This is the entire reason contract migrations ship separately, and the moment you'll be glad you followed the rule.

If it's an infra/proxy change and you've locked yourself out: use the out-of-band access you confirmed in pre-flight. (You did confirm it. That's what pre-flight was for.)

## Post-deploy

- [ ] Changelog entry
- [ ] Status page back to green if it was touched
- [ ] Delete the canary server
- [ ] If anything surprised you: write it into `references/environments.md` or into this skill. A runbook that never learns is a runbook that's slowly going stale.
- [ ] If a contract migration is now pending, **schedule it** — don't let it rot as a half-migrated schema for six months.

## Output format

Before executing, state the plan and wait for a go:

```
Change class:      panel/API
Commits:           <n> since tag <prev>
Migration:         yes — expand only (adds nullable column `x`)
Backup:            taken, verified restorable
Rollback:          redeploy tag <prev>
Rollback criteria: error rate >2× for 5 min | any canary provisioning failure
Window:            Tue 10:00, off-peak
Notify customers:  not required (no expected downtime)
Proceed?
```

Never execute a production deploy without showing this and getting an explicit "go" — including when it feels routine. The routine ones are the ones that get shipped at 6pm on a Friday.
