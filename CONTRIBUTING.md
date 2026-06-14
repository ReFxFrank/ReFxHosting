# Contributing to ReFx Hosting

Thanks for your interest! This document covers how to get set up, the standards
we hold code to, and how to propose changes.

## Project layout

See [`README.md`](README.md) and [`CLAUDE.md`](CLAUDE.md) for the monorepo map.
The documentation set under [`docs/`](docs/00-index.md) is authoritative for
architecture decisions.

## Prerequisites

- Node.js ≥ 20, npm ≥ 10
- Go ≥ 1.22 (toolchain pins 1.25 for the node agent)
- Docker + Docker Compose v2
- A POSIX shell (the helper scripts assume bash)

## Getting started

```bash
git clone https://github.com/refxfrank/refxhosting.git
cd refxhosting
cp .env.example .env          # generate real secrets for anything non-trivial
npm install                   # installs all workspaces
npx prisma generate --schema database/prisma/schema.prisma

# Bring up backing services + apps:
./infra/scripts/bootstrap.sh
```

## Branching & commits

- Branch from `main`: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
- Use [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat(servers): …`, `fix(migrate): …`). The history already follows this.
- Keep commits focused; explain the *why* in the body.
- **Never** push directly to `main`. Open a PR.

## Standards (the bar for a mergeable PR)

| Area | Requirement |
|------|-------------|
| panel-api | `npm run build`, `npm test`, `npm run test:e2e` all green |
| web | `npm run build`, `npm run typecheck`, `npm run lint` clean |
| node-agent | `go build ./...`, `go vet ./...`, `go test ./...` pass; cross-compiles to linux/amd64+arm64 and windows/amd64 |
| shared | `npm run typecheck` clean; enums stay in sync with `schema.prisma` |
| schema | `npx prisma validate` passes; new fields ship with a migration |
| docs | update `docs/16-status.md` if you change what's implemented |

CI (`.github/workflows/ci.yml`) enforces most of this. Run it locally first.

## Database changes

1. Edit `database/prisma/schema.prisma`.
2. Generate a migration: `npx prisma migrate dev --name <change> --schema database/prisma/schema.prisma`.
3. Mirror any new enums into `packages/shared/src/enums.ts`.
4. Update the seed (`database/seed/`) if relevant.

## Adding a game template ("egg")

No code changes required — add a JSON file under `database/seed/templates/`
matching the existing shape (see [`docs/10-game-templates.md`](docs/10-game-templates.md))
or create it in the admin panel. Re-run the seed to load it.

## Tests

- Unit tests live next to source as `*.spec.ts` (panel-api) / `*_test.go` (agent).
- Integration/e2e: `apps/panel-api/test/*.e2e-spec.ts` (mock all external I/O —
  no real DB/Redis/network in tests).
- Prefer testing real behavior and edge cases over trivial assertions.

## Security

Found a vulnerability? **Do not open a public issue.** Follow
[`SECURITY.md`](SECURITY.md).

## License

By contributing you agree your contributions are licensed under the project's
[AGPL-3.0](LICENSE).
