# ReFx Hosting — Kubernetes deployment

This Helm chart (`helm/refx`) deploys the **central panel** only — `panel-api`
and `web`, plus an Ingress, HPAs, a pre-upgrade Prisma migration hook, a
ConfigMap/Secret, a ServiceAccount, and a default NetworkPolicy.

> **Node-agents are NOT deployed by Kubernetes.** They run as native daemons on
> your bare-metal/VM game nodes (Linux or Windows). Provision them with
> `infra/scripts/install-node.sh` / `install-node.ps1` and register them in the
> admin panel. The panel reaches each agent over its HTTPS control port (8443).

## Prerequisites

- Kubernetes 1.27+
- An ingress controller (nginx assumed) and cert-manager (for TLS)
- Managed PostgreSQL, Redis, and S3-compatible storage (recommended), or set
  `postgresql.enabled=true` / `redis.enabled=true` to use the bundled subcharts
  for dev/staging.

## Install

```bash
helm dependency update infra/k8s/helm/refx   # only if using bundled subcharts

# Create the secret out-of-band (recommended) ...
kubectl create secret generic refx-secrets \
  --from-literal=DATABASE_URL='postgresql://...' \
  --from-literal=REDIS_HOST='...' \
  --from-literal=JWT_ACCESS_SECRET="$(openssl rand -hex 48)" \
  --from-literal=JWT_REFRESH_SECRET="$(openssl rand -hex 48)" \
  --from-literal=SECRETS_ENC_KEY="$(openssl rand -hex 32)" \
  # ... plus STRIPE_*, PAYPAL_*, S3_*

helm upgrade --install refx infra/k8s/helm/refx \
  --namespace refx --create-namespace \
  --set secrets.existingSecret=refx-secrets \
  --set ingress.hosts.panel=panel.example.com \
  --set ingress.hosts.api=api.example.com \
  --set image.tag=v0.1.0
```

## Notable values

| Key | Purpose |
|-----|---------|
| `panelApi.autoscaling` / `web.autoscaling` | HPA bounds + CPU target |
| `secrets.existingSecret` | Use an externally-managed Secret (preferred) |
| `migrations.enabled` | Run `prisma migrate deploy` as a pre-upgrade hook |
| `networkPolicy.enabled` | Apply the default-deny-ish NetworkPolicy |
| `ingress.annotations` | WebSocket timeouts for the live console are preset |

See [`docs/19-production-deployment.md`](../../docs/19-production-deployment.md)
for the full production runbook.
