# ReFx Hosting — Web Panel

The customer & admin web panel for [ReFx Hosting](../../README.md): a GPortal-style
game-server hosting platform. Built with **Next.js 14 (App Router)**, **TypeScript**,
**TailwindCSS**, **shadcn/ui** primitives, **TanStack Query**, **Zustand**,
**react-hook-form + Zod**, **xterm.js** (live console) and **Recharts** (graphs).

Design language: clean, dense, dark-mode-first — inspired by Linear, Vercel,
Hetzner Cloud and GPortal.

## Quick start

```bash
cd apps/web
cp .env.example .env.local      # set NEXT_PUBLIC_API_URL
npm install
npm run dev                     # http://localhost:3000
```

The panel talks to the `panel-api` over REST (`/api/v1`) and WebSocket (live
console). Configure the API base with `NEXT_PUBLIC_API_URL` (default
`http://localhost:4000`).

## Scripts

| Script           | Purpose                          |
|------------------|----------------------------------|
| `npm run dev`    | Dev server on port 3000          |
| `npm run build`  | Production build (`standalone`)  |
| `npm run start`  | Serve the production build        |
| `npm run lint`   | ESLint                            |
| `npm run typecheck` | `tsc --noEmit`                 |

## Architecture

```
app/
├── (auth)/           login · register · 2fa · forgot-password
├── (dashboard)/      authenticated app (sidebar + topnav chrome)
│   ├── dashboard/    usage summary, services, billing, activity
│   ├── servers/      list + [id]/{console,files,backups,databases,
│   │                 schedules,switch-game,upgrade,settings}
│   ├── billing/      invoices · subscriptions · payment methods
│   ├── support/      tickets + thread + knowledge base
│   └── account/      profile · security (password, TOTP, WebAuthn, keys, sessions)
├── (admin)/          role-gated admin: nodes, users, products,
│                     game templates (egg editor), audit, alerts, monitoring
└── (store)/order/    GPortal-style buy flow (plan → game → interval → checkout)

lib/
├── api.ts            typed REST client (auth header, refresh, error norm)
├── auth.ts           token storage helpers
├── ws.ts             console WebSocket helper (auto-reconnect)
├── types.ts          API types mirroring the Prisma schema
└── utils.ts          cn(), formatters (money/bytes/MB/relative)

store/                zustand: auth session, UI prefs
components/
├── ui/               shadcn-style cva primitives
├── layout/           sidebar, topnav, nav config
├── server/           resource gauges
├── providers.tsx     React Query + theme + tooltip + toaster
└── theme-provider.tsx
```

### Signature feature — game switching

`servers/[id]/switch-game` lets a customer change the installed game while
keeping the server identity, IP:port, SFTP user, backups and billing plan. The
flow shows a from→to preview, a catalog of plan-allowed templates, and a
confirmation step with an explicit **keep vs. wipe data** choice.

### Live console

`servers/[id]/console` wires `xterm.js` to `lib/ws.ts`. The socket obtains a
short-lived ticket from the API, streams console output, and pushes live
CPU/RAM/disk stats rendered as Recharts sparkline gauges. Power signals
(start/stop/restart/kill) and commands are sent over the same socket with a REST
fallback.

## Auth & data fetching

- **Auth**: `lib/auth.ts` stores access/refresh tokens; `lib/api.ts` attaches the
  bearer header and transparently refreshes on a single `401`. `store/auth.ts`
  exposes reactive session state and role helpers; `hooks/use-require-auth.ts`
  guards route groups (admin pages require `ADMIN`/`OWNER`).
- **Data**: every screen uses TanStack Query; mutations invalidate the relevant
  keys and surface results via `sonner` toasts. Forms use `react-hook-form` with
  `zod` resolvers.

## Notes / `TODO(impl)`

Genuinely large or external integrations are marked inline with `// TODO(impl)`:
WebAuthn ceremonies, Stripe checkout redirects, resumable file uploads, QR-code
rendering for TOTP, and the full game-template variable/install-script editor.
API types are hand-written here; in production they are generated from the
OpenAPI spec in `packages/shared`.

## Docker

```bash
docker build -t refx-web .
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=https://api.example.com refx-web
```

Produces a minimal `standalone` runtime image.
