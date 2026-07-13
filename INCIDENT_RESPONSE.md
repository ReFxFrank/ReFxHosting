# Incident Response Runbook — refx.gg

Short, practical IR guide for a one-operator game-hosting platform. Keep this
current; rehearse the DB-restore path (see `infra/scripts/restore-panel-db.sh`).

## Security contact

- **Report:** security@refx.gg (set this up — alias to your inbox) or GitHub
  private vulnerability reporting. Public policy: `SECURITY.md`,
  `/.well-known/security.txt`.
- **Ack target:** 72h. Coordinated disclosure requested before publication.

## Severity & first move

| Level | Examples | First move |
|-------|----------|------------|
| SEV-1 | Active data breach, payment fraud at scale, node/host compromise, secret leak | Contain now (below), then assess |
| SEV-2 | Account-takeover reports, cross-tenant access, provisioning/billing abuse | Lock the vector, investigate within hours |
| SEV-3 | Isolated abuse, single-account compromise, DoS attempt | Handle in-day |

## Contain (SEV-1/2)

1. **Suspected secret leak** (`SECRETS_ENC_KEY`, JWT, gateway, R2, DB):
   rotate the affected secret; for JWT secrets, rotating invalidates all
   sessions (acceptable). `SECRETS_ENC_KEY` cannot be rotated without
   re-encrypting `*Enc` columns — treat as break-glass; restore from the
   password-manager copy, never regenerate blindly.
2. **Account takeover:** Admin → set user `SUSPENDED` (kills sessions); force
   password reset; check `AuditLog` for the actor's actions.
3. **Compromised node:** mark the node in maintenance, stop its agent, isolate
   at the host firewall; servers on it are down but other nodes are unaffected.
4. **Payment fraud / card testing:** disable the gateway in Admin → Payments,
   enable stricter Stripe Radar rules, review recent orders.
5. **Panel compromise:** `docker compose stop web panel-api`; the node agents
   keep customer game servers running independently.

## Investigate

- `AuditLog` (Admin → Audit) — every mutating action: who, what, when.
- Application logs (`docker compose logs panel-api`) — query strings are
  scrubbed; auth/payment events are structured.
- Panel-DB backup (`infra/scripts/backup-panel-db.sh`, nightly to R2) for
  point-in-time comparison / restore.

## Recover

- Restore DB: `infra/scripts/restore-panel-db.sh --latest` (drill it first).
- Rebuild from a known-good image; re-issue rotated secrets via `.env` +
  Admin → Settings; verify preflight passes on boot.

## Post-incident

Write a short timeline (detection → containment → root cause → fix), file a
finding in `SECURITY_AUDIT.md` if it's a code/config gap, add a regression test,
and notify affected customers per your jurisdiction's breach-notification rules
(`TODO(frank)`: confirm the applicable window).
