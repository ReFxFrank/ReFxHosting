# refx.gg — Security Go / No-Go

**Verdict: GO WITH CONDITIONS.**

refx.gg is safe to take paying customers and operate as a public storefront
**once the fixes in commit `40fd855` are deployed** and the payment-webhook and
node-deployment conditions below are met. No Critical findings; no committed
secrets; the app-layer High findings (provision-without-pay, privilege
escalation, stored XSS) are fixed and verified. The remaining Highs are
node-runtime hardening that only bites on **native (non-Docker) deployments**.

Basis: full static code + config review across six dimensions (auth, authz/
tenant-isolation, injection/command-exec, payments, secrets/deps, infra) — see
`SECURITY_AUDIT.md`. No active/intrusive testing was run against production
(held pending Frank's approval).

---

## Conditions to clear before / at launch

### Must do (blocking)

1. **Deploy the remediation.** Rebuild + redeploy panel-api and web
   (`docker compose up -d --build panel-api web`). This ships SEC-01..07 and the
   `ws` override. Until deployed, the free-provisioning and XSS holes are live.
2. **Confirm the PayPal webhook ID is set** (Admin → Payments) and both Stripe
   and PayPal webhook endpoints are registered — without the webhook, payments
   don't settle and the provision gate can't fire. (Already flagged separately.)
3. **`npm audit fix` in apps/panel-api during the deploy** (DEP-02 multer DoS —
   non-breaking).

### Must do IF you run native (non-Docker) game nodes (blocking for those nodes)

4. **Node-runtime isolation (INF-H1, M2–M5).** On native deploys a customer's
   game process runs as the docker-group agent user = host root. Before hosting
   untrusted workloads on a native node: default per-server UID isolation, remove
   the agent user from the `docker` group, add egress limits + `CapDrop` +
   per-server disk quota. Requires a node-agent release. **If all nodes use the
   Docker runtime, this is not a launch blocker** (containers are isolated) but
   remains recommended hardening.

### Should do soon after launch (not blocking)

5. Refund/chargeback → revoke entitlement + Stripe dispute handlers (PAY-02).
6. Webhook-delivery SSRF re-validation (INJ-03).
7. Per-account login throttle + enforce MFA for staff/OWNER (AUTH-01/02).
8. Tighten CSP `script-src` to nonces; fix CORS `||` fallback; firewall the agent
   `:8443`/SFTP to the panel IP; restore real client IP behind Cloudflare.

---

## Residual & accepted risks

| Risk | Owner | Rationale / mitigation |
|------|-------|------------------------|
| Access tokens valid ≤1h after logout/password-change | Frank | Role/ban revocation IS immediate; short TTL; add `tokenVersion` post-launch. |
| Refresh-reuse grace window (60s) | Frank | Narrow window; refresh tokens in localStorage already require XSS to steal (now CSP-mitigated + XSS source fixed). |
| Node self-update trusts GitHub TLS (no release signature) | Frank | TLS validation on; sign releases when practical. |
| CSP keeps `script-src 'unsafe-inline'` | Frank | Concrete XSS fixed at source; nonce hardening needs live testing. |
| Referral/coupon economic abuse (Lows) | Frank | Store-credit only, verified-email gated; add thresholds if abused. |

## TODO(frank) — action items the agent could not complete

- [ ] Deploy panel-api + web (ships the fixes).
- [ ] `npm audit fix` in apps/panel-api (multer).
- [ ] Decide native vs Docker-only node policy; if native, schedule the
      node-agent isolation release before onboarding untrusted tenants.
- [ ] Refund/chargeback revocation policy + Stripe dispute webhooks.
- [ ] Firewall agent `:8443` + `:2022` to the panel IP; lock origin to Cloudflare
      ranges; wire `CF-Connecting-IP` into the throttler.
- [ ] Legal review of ToS/Privacy/AUP/Refund pages (presence/consistency checked;
      legal sufficiency is yours). Jurisdiction still `TODO(frank)`.
- [ ] Set a real `security@refx.gg` (see `.well-known/security.txt`).
