# ReFx Hosting — Docker Stack

Local development / single-host stack for **ReFx Hosting**. The **default
(core)** profile is intentionally lean so it runs on a modest VPS; heavier
components are opt-in via Compose profiles.

| Profile | Brings up | Approx. extra RAM |
|---------|-----------|-------------------|
| _(default)_ | postgres, redis, minio (+createbuckets), migrate, **panel-api**, **web** | baseline (~1.5–2 GB) |
| `--profile search` | + opensearch | ~1–2 GB |
| `--profile observability` | + prometheus, grafana, loki | ~0.5–1 GB |
| `--profile scale-out` | + rabbitmq | ~0.3 GB |
| `--profile full` | everything above | ~6–8 GB total |

```bash
# Lean default (good for a first VPS smoke test):
docker compose -f infra/docker/docker-compose.yml up -d
# Everything:
docker compose -f infra/docker/docker-compose.yml --profile full up -d
```

> **OpenSearch note:** if you enable `search`/`full` and OpenSearch crashes on
> boot, the host needs `vm.max_map_count`:
> ```bash
> sudo sysctl -w vm.max_map_count=262144
> echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-refx.conf
> ```

> The **node-agent** (Go) is *not* part of this stack — it is installed per-host
> on the machines that actually run game servers. See
> [Adding a node-agent](#adding-a-node-agent).

---

## Prerequisites

- Docker Engine 24+ with the Compose v2 plugin (`docker compose`, not
  `docker-compose`).
- A populated **repo-root** `.env`. Copy the example and fill in secrets:

  ```bash
  cp .env.example .env          # run from the repo root
  ```

  The stack reads `../../.env` (repo root). Every value also has a
  `${VAR:-default}` fallback in `docker-compose.yml`, so the backing services
  still come up with an empty `.env` — but you should set real secrets
  (`JWT_*`, `SECRETS_ENC_KEY`, `STRIPE_*`, etc.) for anything beyond a smoke
  test.

---

## Quick start

From the repo root (uses the convenience scripts in the root `package.json`):

```bash
npm run stack:up      # docker compose -f infra/docker/docker-compose.yml --env-file .env up -d
npm run stack:logs    # follow logs
npm run stack:down    # stop everything
```

…or directly from this directory:

```bash
cd infra/docker
docker compose up -d            # build + start the full stack
docker compose ps               # check health
docker compose logs -f panel-api
docker compose down             # stop (add -v to also drop named volumes)
```

The first `up` builds three images: `migrate`, `panel-api`, and `web` (build
context is the **repo root**, `../../`, so the Prisma schema and seed are
available).

> **Web build note:** `apps/web/Dockerfile` is owned by another agent. If it is
> not present yet, `docker compose build web` will fail — comment out the `web`
> service (or run `docker compose up -d` for the services you need) until that
> Dockerfile lands.

### Optional: RabbitMQ (scale-out profile)

RabbitMQ is only needed for large fan-out workloads (most setups use
Redis/BullMQ). It is gated behind a Compose profile:

```bash
docker compose --profile scale-out up -d rabbitmq
```

---

## Ports

| Service          | Container | Host (default)        | Purpose                                   |
| ---------------- | --------- | --------------------- | ----------------------------------------- |
| web              | 3000      | `3000` (`WEB_PORT`)   | Next.js panel frontend                    |
| panel-api        | 4000      | `4000` (`PANEL_API_PORT`) | NestJS REST/GraphQL/WS API            |
| postgres         | 5432      | `5432` (`POSTGRES_PORT`)  | PostgreSQL 16                          |
| redis            | 6379      | `6379` (`REDIS_PORT`) | Cache, BullMQ, rate limiting              |
| opensearch       | 9200      | `9200` (`OPENSEARCH_PORT`)| Search / log indexing                 |
| minio (S3 API)   | 9000      | `9000` (`MINIO_API_PORT`) | Object storage (S3 compatible)        |
| minio (console)  | 9001      | `9001` (`MINIO_CONSOLE_PORT`)| MinIO web console                  |
| rabbitmq (AMQP)  | 5672      | `5672` (`RABBITMQ_PORT`)  | Message bus *(scale-out profile)*     |
| rabbitmq (UI)    | 15672     | `15672` (`RABBITMQ_MGMT_PORT`)| Management UI *(scale-out)*       |
| prometheus       | 9090      | `9090` (`PROMETHEUS_PORT`)| Metrics                               |
| grafana          | 3000      | `3001` (`GRAFANA_PORT`)   | Dashboards (host **3001** → cntr 3000) |
| loki             | 3100      | `3100` (`LOKI_PORT`)  | Log aggregation                           |
| node-agent       | 8443/2022 | — (host-installed)    | Signed control API + SFTP *(not in compose)* |

Default credentials (override in `.env`):

- **Grafana:** `admin` / `admin` (`GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD`)
- **MinIO:** `refxadmin` / `refxadminsecret` (`MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`)
- **Postgres:** `refx` / `refx`, db `refx` (`POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`)

---

## Migrations & seeding

Schema migrations and seed data are handled by the one-shot **`migrate`**
service (built from [`Dockerfile.migrate`](./Dockerfile.migrate)):

1. It runs `prisma migrate deploy` against `database/prisma/schema.prisma`. If
   no `migrations/` directory exists yet, it falls back to `prisma db push`
   (dev convenience for a fresh schema).
2. It then runs the seed if `database/seed/seed.ts` (or `seed.js`) is present.
   The seed step is **non-fatal** — a missing or failing seed never blocks the
   API. (Currently only `database/seed/templates/*.json` ship; the seed entry
   point is added separately.)

`panel-api` waits for `migrate` to **complete successfully**
(`service_completed_successfully`) before it starts, so the schema is always
ready first.

Re-run migrations manually:

```bash
docker compose run --rm migrate
```

---

## Object storage buckets

The one-shot **`createbuckets`** service (`minio/mc`) waits for MinIO to become
healthy and creates the required buckets with private policies:

- `refx-backups` — server backups
- `refx-uploads` — user/app uploads

Re-run if needed: `docker compose run --rm createbuckets`.

---

## Observability

- **Prometheus** scrapes itself and `panel-api:4000/metrics`
  (prom-client). Exporter and node-agent scrape jobs are present as commented
  examples in [`prometheus/prometheus.yml`](./prometheus/prometheus.yml).
- **Grafana** is auto-provisioned:
  - Datasources: Prometheus (`http://prometheus:9090`, default) and Loki
    (`http://loki:3100`) — see
    [`grafana/provisioning/datasources/datasources.yml`](./grafana/provisioning/datasources/datasources.yml).
  - Dashboards: the **ReFx Hosting — Overview** dashboard
    ([`refx-overview.json`](./grafana/provisioning/dashboards/refx-overview.json))
    with panel-api request rate/latency/errors, node CPU/memory, and a game
    server count. Drop additional `*.json` dashboards into the same folder and
    they are picked up automatically.
- **Loki** runs single-binary with filesystem storage
  ([`loki/loki-config.yml`](./loki/loki-config.yml)). Ship logs to it with
  Promtail/Alloy or the Docker Loki logging driver.

> The dashboard metric names assume a prom-client-instrumented `panel-api`
> (`http_request_duration_seconds*`, `process_resident_memory_bytes`) plus a
> custom `refx_servers` gauge and node_exporter on game hosts. Adjust the
> expressions to match your actual instrumentation.

---

## Health checks

Every service defines a healthcheck. Notable detail:

- **panel-api** is probed at `http://localhost:4000/api/v1/health` (the
  configured `API_PREFIX`). If the health module is mounted at the root instead
  (`/health`), update the healthcheck in `docker-compose.yml` and the
  `metrics_path` note in `prometheus/prometheus.yml` accordingly.

Check status with `docker compose ps` (the `STATUS` column shows
`healthy`/`unhealthy`).

---

## Adding a node-agent

The node-agent manages game-server containers/processes on each host, exposes a
signed control API on **:8443** and an SFTP endpoint on **:2022**. It needs the
host's Docker daemon and is therefore installed **directly on the host**, not in
this compose file:

```bash
# on each game-host machine
sudo bash infra/scripts/install-node.sh
```

For local development you can run it in a container instead — see the
commented-out `node-agent` service at the bottom of `docker-compose.yml`
(`privileged: true`, `/var/run/docker.sock` mount, ports `8443`/`2022`). To
scrape its metrics, uncomment the `node-agent` / `node-exporter` jobs in
`prometheus/prometheus.yml` and list the host IPs.

---

## Files in this directory

| File | Purpose |
| ---- | ------- |
| `docker-compose.yml` | Full local stack definition |
| `Dockerfile.migrate` | One-shot Prisma migrate + seed runner image |
| `prometheus/prometheus.yml` | Prometheus scrape config |
| `loki/loki-config.yml` | Loki single-binary config |
| `grafana/provisioning/datasources/datasources.yml` | Grafana datasources |
| `grafana/provisioning/dashboards/dashboards.yml` | Grafana dashboard provider |
| `grafana/provisioning/dashboards/refx-overview.json` | Overview dashboard |
